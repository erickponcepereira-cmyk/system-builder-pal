import { resolveGroupUrl } from "./whatsapp-groups.shared";
import type { WhatsappGroup, NetworkWhatsappGroup } from "./whatsapp-groups.shared";
import { COMMUNITY_POLICY_VERSION } from "./ugc.constants";

const ALLOWED_WHATSAPP_HOSTNAMES = new Set([
  "chat.whatsapp.com",
  "wa.me",
  "api.whatsapp.com",
]);

const URL_SCHEME_RE = /^[a-z][a-z\d+.-]*:/i;
const PHONE_INPUT_RE = /^\+?[\d\s().-]+$/;

export type NormalizedWhatsappTarget = {
  inviteUrl: string | null;
  phone: string | null;
};

/**
 * Normaliza um link/número antes de persistir em `whatsapp_groups`.
 *
 * A comparação também é feita contra a autoridade original para não aceitar
 * portas explícitas, credenciais, subdomínios parecidos ou hosts ofuscados que
 * o parser de URL poderia normalizar silenciosamente.
 */
export function normalizeWhatsappTarget(rawTarget: string): NormalizedWhatsappTarget {
  const target = rawTarget.trim();
  const hasControlCharacter = [...target].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (!target || hasControlCharacter) {
    throw new Error("Informe um link válido do WhatsApp ou um número com DDD.");
  }

  const looksLikeUrl = URL_SCHEME_RE.test(target) || target.startsWith("//");
  if (looksLikeUrl) {
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      throw new Error("Informe um link válido do WhatsApp.");
    }

    if (parsed.protocol !== "https:") {
      throw new Error("O link do WhatsApp deve usar HTTPS.");
    }
    if (parsed.username || parsed.password) {
      throw new Error("O link do WhatsApp não pode conter credenciais.");
    }

    const authority = target.slice(target.indexOf("//") + 2).split(/[/?#]/, 1)[0];
    const normalizedAuthority = authority.toLowerCase();
    const normalizedHostname = parsed.hostname.toLowerCase();

    if (authority.includes(":") || parsed.port) {
      throw new Error("O link do WhatsApp não pode informar uma porta.");
    }
    if (
      !ALLOWED_WHATSAPP_HOSTNAMES.has(normalizedHostname)
      || normalizedAuthority !== normalizedHostname
    ) {
      throw new Error("Use somente um link oficial do WhatsApp.");
    }

    parsed.hash = "";
    return { inviteUrl: parsed.toString(), phone: null };
  }

  if (!PHONE_INPUT_RE.test(target)) {
    throw new Error("Informe o número com DDD ou um link oficial do WhatsApp.");
  }
  const digits = target.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    throw new Error("Informe o número com DDD ou o link do grupo.");
  }
  return { inviteUrl: null, phone: digits };
}

/** Verifica se o usuário é dono (ou equipe) do parceiro/profissional informado. */
export async function assertGroupOwner(userId: string, ownerKind: string, ownerId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  const profileId = (profile as { id?: string } | null)?.id;
  if (!profileId) throw new Error("Perfil não encontrado.");

  if (ownerKind === "professional") {
    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("id", ownerId)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (!coach) throw new Error("Você não tem acesso a este grupo.");
  } else {
    const { data: partner } = await supabaseAdmin
      .from("partners")
      .select("id")
      .eq("id", ownerId)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (!partner) {
      const { data: member } = await supabaseAdmin
        .from("partner_members")
        .select("id")
        .eq("partner_id", ownerId)
        .eq("profile_id", profileId)
        .maybeSingle();
      if (!member) throw new Error("Você não tem acesso a este grupo.");
    }
  }
  return { supabaseAdmin, profileId };
}

function mapRow(row: Record<string, unknown> | null): WhatsappGroup | null {
  if (!row) return null;
  return {
    id: String(row["id"]),
    name: String(row["name"] ?? ""),
    inviteUrl: (row["invite_url"] as string | null) ?? null,
    phone: (row["phone"] as string | null) ?? null,
    description: (row["description"] as string | null) ?? null,
    isActive: !!row["is_active"],
  };
}

const COLS = "id,name,invite_url,phone,description,is_active";

export async function readOwnGroup(userId: string, ownerKind: string, ownerId: string) {
  const { supabaseAdmin } = await assertGroupOwner(userId, ownerKind, ownerId);
  const col = ownerKind === "partner" ? "owner_partner_id" : "owner_coach_id";
  const { data: row } = await supabaseAdmin
    .from("whatsapp_groups")
    .select(COLS)
    .eq(col, ownerId)
    .maybeSingle();
  return mapRow(row as Record<string, unknown> | null);
}

export async function writeOwnGroup(
  userId: string,
  input: {
    ownerKind: string;
    ownerId: string;
    name: string;
    target: string;
    description?: string | null;
    isActive: boolean;
  },
): Promise<WhatsappGroup> {
  const { supabaseAdmin, profileId } = await assertGroupOwner(userId, input.ownerKind, input.ownerId);

  const { data: policyAcceptance } = await supabaseAdmin
    .from("ugc_policy_acceptances" as never)
    .select("id" as never)
    .eq("profile_id" as never, profileId as never)
    .eq("policy_version" as never, COMMUNITY_POLICY_VERSION as never)
    .maybeSingle();
  if (!policyAcceptance) {
    throw new Error("Aceite as Diretrizes da Comunidade antes de publicar um grupo.");
  }

  const { inviteUrl, phone } = normalizeWhatsappTarget(input.target);

  const payload: Record<string, unknown> = {
    owner_kind: input.ownerKind,
    owner_partner_id: input.ownerKind === "partner" ? input.ownerId : null,
    owner_coach_id: input.ownerKind === "professional" ? input.ownerId : null,
    name: input.name.trim(),
    invite_url: inviteUrl,
    phone,
    description: input.description?.trim() || null,
    is_active: input.isActive,
  };

  const col = input.ownerKind === "partner" ? "owner_partner_id" : "owner_coach_id";
  const { data: existente } = await supabaseAdmin
    .from("whatsapp_groups")
    .select("id")
    .eq(col, input.ownerId)
    .maybeSingle();

  if (existente) {
    const { data: up, error } = await supabaseAdmin
      .from("whatsapp_groups")
      .update(payload as never)
      .eq("id", (existente as { id: string }).id)
      .select(COLS)
      .single();
    if (error) throw new Error(error.message);
    return mapRow(up as Record<string, unknown>)!;
  }
  const { data: ins, error } = await supabaseAdmin
    .from("whatsapp_groups")
    .insert(payload as never)
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapRow(ins as Record<string, unknown>)!;
}

/** Grupos dos parceiros/profissionais diretamente vinculados ao usuário. */
export async function readNetworkGroups(userId: string): Promise<NetworkWhatsappGroup[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  const profileId = (profile as { id?: string } | null)?.id;
  if (!profileId) return [];

  const { data: blockedRows } = await supabaseAdmin
    .from("ugc_blocks" as never)
    .select("blocked_whatsapp_group_id" as never)
    .eq("blocker_profile_id" as never, profileId as never);
  const blockedGroupIds = new Set(
    ((blockedRows as unknown as Array<{ blocked_whatsapp_group_id: string | null }>) || [])
      .map((row) => row.blocked_whatsapp_group_id)
      .filter((id): id is string => !!id),
  );

  const coachIds = new Set<string>();
  const partnerIds = new Set<string>();

  const { data: alunos } = await supabaseAdmin
    .from("students")
    .select("coach_id,professional_coach_id,partner_id")
    .eq("profile_id", profileId);
  ((alunos as Array<Record<string, string | null>>) || []).forEach((s) => {
    if (s["coach_id"]) coachIds.add(s["coach_id"]!);
    if (s["professional_coach_id"]) coachIds.add(s["professional_coach_id"]!);
    if (s["partner_id"]) partnerIds.add(s["partner_id"]!);
  });

  const { data: meusCoaches } = await supabaseAdmin
    .from("coaches")
    .select("id,upline_coach_id")
    .eq("profile_id", profileId);
  const proprios = new Set<string>();
  ((meusCoaches as Array<Record<string, string | null>>) || []).forEach((c) => {
    if (c["id"]) proprios.add(c["id"]!);
    if (c["upline_coach_id"]) coachIds.add(c["upline_coach_id"]!);
  });

  const { data: minhasUnidades } = await supabaseAdmin
    .from("partners")
    .select("id")
    .eq("profile_id", profileId);
  const propriasUnidades = new Set(((minhasUnidades as Array<{ id: string }>) || []).map((p) => p.id));

  const { data: membros } = await supabaseAdmin
    .from("partner_members")
    .select("partner_id")
    .eq("profile_id", profileId);
  ((membros as Array<{ partner_id: string }>) || []).forEach((m) => partnerIds.add(m.partner_id));

  // Não repete o próprio grupo para o dono
  proprios.forEach((id) => coachIds.delete(id));
  propriasUnidades.forEach((id) => partnerIds.delete(id));
  if (coachIds.size === 0 && partnerIds.size === 0) return [];

  const filtros: string[] = [];
  if (coachIds.size) filtros.push(`owner_coach_id.in.(${Array.from(coachIds).join(",")})`);
  if (partnerIds.size) filtros.push(`owner_partner_id.in.(${Array.from(partnerIds).join(",")})`);

  const { data: rows } = await supabaseAdmin
    .from("whatsapp_groups")
    .select("id,name,description,invite_url,phone,owner_kind,owner_coach_id,owner_partner_id")
    .eq("is_active", true)
    .or(filtros.join(","));

  const lista = ((rows as Array<Record<string, string | null>>) || [])
    .filter((row) => !blockedGroupIds.has(String(row["id"])));
  if (lista.length === 0) return [];

  const coachOwners = lista.map((r) => r["owner_coach_id"]).filter(Boolean) as string[];
  const partnerOwners = lista.map((r) => r["owner_partner_id"]).filter(Boolean) as string[];
  const nomeCoach: Record<string, string> = {};
  const nomeParceiro: Record<string, string> = {};

  if (coachOwners.length) {
    const { data: cs } = await supabaseAdmin
      .from("coaches")
      .select("id,profiles!coaches_profile_id_fkey(name)")
      .in("id", coachOwners);
    ((cs as unknown as Array<{ id: string; profiles: { name: string } | null }>) || []).forEach((c) => {
      nomeCoach[c.id] = c.profiles?.name || "Profissional";
    });
  }
  if (partnerOwners.length) {
    const { data: ps } = await supabaseAdmin
      .from("partners")
      .select("id,fantasy_name")
      .in("id", partnerOwners);
    ((ps as Array<{ id: string; fantasy_name: string }>) || []).forEach((p) => {
      nomeParceiro[p.id] = p.fantasy_name || "Parceiro";
    });
  }

  const grupos: NetworkWhatsappGroup[] = [];
  lista.forEach((r) => {
    const url = resolveGroupUrl(r["invite_url"] ?? null, r["phone"] ?? null);
    if (!url) return;
    const ownerName = r["owner_coach_id"]
      ? nomeCoach[r["owner_coach_id"]!] || "Profissional"
      : nomeParceiro[r["owner_partner_id"] || ""] || "Parceiro";
    grupos.push({
      id: String(r["id"]),
      name: String(r["name"] ?? "Grupo do WhatsApp"),
      description: r["description"] ?? null,
      url,
      ownerName,
    });
  });
  return grupos;
}
