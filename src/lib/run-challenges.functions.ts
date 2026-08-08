import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RunChallengeTier = { id: string; label: string; target_km: number; sort_order: number };

export type RunChallengeProduct = {
  id: string;
  kind: "partner" | "professional";
  name: string;
  price: number;
} | null;

export type RunChallengeCard = {
  id: string;
  name: string;
  description: string | null;
  starts_on: string;
  ends_on: string;
  requires_ticket: boolean;
  ownerName: string | null;
  tiers: RunChallengeTier[];
  product: RunChallengeProduct;
  ticketsAvailable: number;
  progressKm: number;
  entry: { id: string; tier_id: string; goal_reached_at: string | null; km_at_goal: number | null } | null;
};

async function resolveMe(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id, name").eq("user_id", userId).maybeSingle();
  if (!profile) return null;
  const p = profile as unknown as { id: string; name: string | null };
  const [{ data: chain }, { data: coaches }] = await Promise.all([
    supabaseAdmin.rpc("cadeia_coaches_do_perfil" as never, { _profile_id: p.id } as never),
    supabaseAdmin.from("coaches").select("id").eq("profile_id", p.id),
  ]);
  const myCoachIds = ((coaches as { id: string }[] | null) || []).map((c) => c.id);
  const chainIds = ((chain as unknown as string[] | null) || []).filter(Boolean);
  return { profileId: p.id, name: p.name, chainIds, myCoachIds };
}

async function loadProducts(rows: Array<{ partner_product_id: string | null; professional_product_id: string | null }>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const partnerIds = rows.map((r) => r.partner_product_id).filter(Boolean) as string[];
  const proIds = rows.map((r) => r.professional_product_id).filter(Boolean) as string[];
  const map = new Map<string, RunChallengeProduct>();
  if (partnerIds.length) {
    const { data } = await supabaseAdmin.from("partner_products").select("id, name, price").in("id", partnerIds);
    for (const p of (data as { id: string; name: string; price: number }[] | null) || []) {
      map.set(`partner:${p.id}`, { id: p.id, kind: "partner", name: p.name, price: Number(p.price) });
    }
  }
  if (proIds.length) {
    const { data } = await supabaseAdmin.from("professional_products").select("id, name, price").in("id", proIds);
    for (const p of (data as { id: string; name: string; price: number }[] | null) || []) {
      map.set(`professional:${p.id}`, { id: p.id, kind: "professional", name: p.name, price: Number(p.price) });
    }
  }
  return map;
}

/** Desafios de corrida visíveis para o usuário logado (rede do dono ou dono). */
export const listMyRunChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RunChallengeCard[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await resolveMe(context.userId);
    if (!me) return [];
    const ownerIds = Array.from(new Set([...me.chainIds, ...me.myCoachIds]));
    if (ownerIds.length === 0) return [];

    const today = new Date().toISOString().slice(0, 10);
    const { data: challenges } = await supabaseAdmin
      .from("run_challenges")
      .select("id, owner_coach_id, name, description, starts_on, ends_on, requires_ticket, partner_product_id, professional_product_id")
      .in("owner_coach_id", ownerIds)
      .eq("is_active", true)
      .gte("ends_on", today)
      .order("starts_on", { ascending: true });

    const list = (challenges as Array<{
      id: string; owner_coach_id: string; name: string; description: string | null;
      starts_on: string; ends_on: string; requires_ticket: boolean;
      partner_product_id: string | null; professional_product_id: string | null;
    }> | null) || [];
    if (list.length === 0) return [];

    const ids = list.map((c) => c.id);
    const usedOwnerIds = Array.from(new Set(list.map((c) => c.owner_coach_id)));

    const [{ data: tiers }, { data: entries }, { data: tickets }, { data: owners }, products] = await Promise.all([
      supabaseAdmin.from("run_challenge_tiers").select("id, challenge_id, label, target_km, sort_order").in("challenge_id", ids).order("sort_order"),
      supabaseAdmin.from("run_challenge_entries").select("id, challenge_id, tier_id, goal_reached_at, km_at_goal").eq("profile_id", me.profileId).in("challenge_id", ids),
      supabaseAdmin.from("run_challenge_tickets").select("id, owner_coach_id, challenge_id").eq("profile_id", me.profileId).is("consumed_at", null),
      supabaseAdmin.from("coaches").select("id, profile:profile_id(name)").in("id", usedOwnerIds),
      loadProducts(list),
    ]);

    const ownerName = new Map<string, string | null>();
    for (const o of (owners as Array<{ id: string; profile: { name: string | null } | null }> | null) || []) {
      ownerName.set(o.id, o.profile?.name ?? null);
    }

    const progress = new Map<string, number>();
    await Promise.all(list.map(async (c) => {
      const { data } = await supabaseAdmin.rpc("run_challenge_progress" as never, { _challenge_id: c.id, _profile_id: me.profileId } as never);
      progress.set(c.id, Number(data ?? 0));
    }));

    return list.map((c) => {
      const key = c.partner_product_id
        ? `partner:${c.partner_product_id}`
        : c.professional_product_id ? `professional:${c.professional_product_id}` : "";
      const entry = ((entries as Array<{ id: string; challenge_id: string; tier_id: string; goal_reached_at: string | null; km_at_goal: number | null }> | null) || [])
        .find((e) => e.challenge_id === c.id) || null;
      const ticketsAvailable = ((tickets as Array<{ owner_coach_id: string; challenge_id: string | null }> | null) || [])
        .filter((t) => t.owner_coach_id === c.owner_coach_id && (!t.challenge_id || t.challenge_id === c.id)).length;
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        starts_on: c.starts_on,
        ends_on: c.ends_on,
        requires_ticket: c.requires_ticket,
        ownerName: ownerName.get(c.owner_coach_id) ?? null,
        tiers: ((tiers as Array<RunChallengeTier & { challenge_id: string }> | null) || [])
          .filter((t) => t.challenge_id === c.id)
          .map((t) => ({ id: t.id, label: t.label, target_km: Number(t.target_km), sort_order: t.sort_order })),
        product: key ? (products.get(key) ?? null) : null,
        ticketsAvailable,
        progressKm: progress.get(c.id) ?? 0,
        entry: entry ? { id: entry.id, tier_id: entry.tier_id, goal_reached_at: entry.goal_reached_at, km_at_goal: entry.km_at_goal } : null,
      };
    });
  });

export const joinRunChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { challengeId: string; tierId: string }) =>
    z.object({ challengeId: z.string().uuid(), tierId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await resolveMe(context.userId);
    if (!me) return { ok: false, error: "Perfil não encontrado." };

    const { data: ch } = await supabaseAdmin
      .from("run_challenges")
      .select("id, owner_coach_id, requires_ticket, is_active, ends_on")
      .eq("id", data.challengeId).maybeSingle();
    const c = ch as unknown as { id: string; owner_coach_id: string; requires_ticket: boolean; is_active: boolean; ends_on: string } | null;
    if (!c || !c.is_active) return { ok: false, error: "Desafio indisponível." };
    if (c.ends_on < new Date().toISOString().slice(0, 10)) return { ok: false, error: "Este desafio já encerrou." };

    const allowed = [...me.chainIds, ...me.myCoachIds].includes(c.owner_coach_id);
    if (!allowed) return { ok: false, error: "Este desafio é exclusivo da rede do organizador." };

    const { data: tier } = await supabaseAdmin
      .from("run_challenge_tiers").select("id, challenge_id").eq("id", data.tierId).maybeSingle();
    if (!tier || (tier as { challenge_id: string }).challenge_id !== c.id) {
      return { ok: false, error: "Faixa inválida." };
    }

    const { data: existing } = await supabaseAdmin
      .from("run_challenge_entries").select("id").eq("challenge_id", c.id).eq("profile_id", me.profileId).maybeSingle();
    if (existing) return { ok: false, error: "Você já está inscrito neste desafio." };

    let ticketId: string | null = null;
    if (c.requires_ticket) {
      const { data: tk } = await supabaseAdmin
        .from("run_challenge_tickets")
        .select("id, challenge_id")
        .eq("profile_id", me.profileId)
        .eq("owner_coach_id", c.owner_coach_id)
        .is("consumed_at", null)
        .limit(10);
      const usable = ((tk as Array<{ id: string; challenge_id: string | null }> | null) || [])
        .find((t) => !t.challenge_id || t.challenge_id === c.id);
      if (!usable) return { ok: false, error: "Você ainda não tem ticket para este desafio." };
      ticketId = usable.id;
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("run_challenge_entries")
      .insert({ challenge_id: c.id, tier_id: data.tierId, profile_id: me.profileId } as never)
      .select("id").maybeSingle();
    if (error) return { ok: false, error: error.message };

    if (ticketId) {
      await supabaseAdmin.from("run_challenge_tickets")
        .update({ consumed_at: new Date().toISOString(), consumed_entry_id: (inserted as { id: string }).id, challenge_id: c.id } as never)
        .eq("id", ticketId);
    }

    await supabaseAdmin.rpc("run_challenge_sync_goals" as never, { _profile_id: me.profileId } as never);
    return { ok: true };
  });

/** Troca a faixa escolhida enquanto o desafio está aberto. */
export const changeRunChallengeTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { entryId: string; tierId: string }) =>
    z.object({ entryId: z.string().uuid(), tierId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await resolveMe(context.userId);
    if (!me) return { ok: false as const, error: "Perfil não encontrado." };
    const { error } = await supabaseAdmin
      .from("run_challenge_entries")
      .update({ tier_id: data.tierId, goal_reached_at: null, km_at_goal: null, updated_at: new Date().toISOString() } as never)
      .eq("id", data.entryId).eq("profile_id", me.profileId);
    if (error) return { ok: false as const, error: error.message };
    await supabaseAdmin.rpc("run_challenge_sync_goals" as never, { _profile_id: me.profileId } as never);
    return { ok: true as const };
  });

/** Desafios de corrida ligados aos produtos comprados (para CTA pós-compra). */
export const runChallengesForProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { productIds: string[] }) =>
    z.object({ productIds: z.array(z.string().uuid()).max(30) }).parse(d))
  .handler(async ({ data }): Promise<Array<{ id: string; name: string }>> => {
    if (data.productIds.length === 0) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = data.productIds;
    const { data: rows } = await supabaseAdmin
      .from("run_challenges")
      .select("id, name, partner_product_id, professional_product_id")
      .eq("is_active", true)
      .or(`partner_product_id.in.(${ids.join(",")}),professional_product_id.in.(${ids.join(",")})`);
    return ((rows as Array<{ id: string; name: string }> | null) || []).map((r) => ({ id: r.id, name: r.name }));
  });

/* ============================ Gestão (dono / admin) ============================ */

export type OwnedRunChallenge = {
  id: string;
  name: string;
  description: string | null;
  starts_on: string;
  ends_on: string;
  is_active: boolean;
  requires_ticket: boolean;
  partner_product_id: string | null;
  professional_product_id: string | null;
  tiers: RunChallengeTier[];
  participants: number;
};

async function ownerCoachIds(userId: string) {
  const me = await resolveMe(userId);
  return me?.myCoachIds ?? [];
}

export const listOwnedRunChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ challenges: OwnedRunChallenge[]; products: Array<{ id: string; kind: "partner" | "professional"; name: string }> }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const coachIds = await ownerCoachIds(context.userId);
    if (coachIds.length === 0) return { challenges: [], products: [] };

    const { data: rows } = await supabaseAdmin
      .from("run_challenges")
      .select("id, name, description, starts_on, ends_on, is_active, requires_ticket, partner_product_id, professional_product_id")
      .in("owner_coach_id", coachIds)
      .order("starts_on", { ascending: false });
    const list = (rows as OwnedRunChallenge[] | null) || [];

    const ids = list.map((c) => c.id);
    const [{ data: tiers }, { data: entries }, { data: proProducts }] = await Promise.all([
      ids.length
        ? supabaseAdmin.from("run_challenge_tiers").select("id, challenge_id, label, target_km, sort_order").in("challenge_id", ids).order("sort_order")
        : Promise.resolve({ data: [] as never[] }),
      ids.length
        ? supabaseAdmin.from("run_challenge_entries").select("id, challenge_id").in("challenge_id", ids)
        : Promise.resolve({ data: [] as never[] }),
      supabaseAdmin.from("professional_products").select("id, name").in("coach_id", coachIds),
    ]);

    const challenges = list.map((c) => ({
      ...c,
      tiers: ((tiers as Array<RunChallengeTier & { challenge_id: string }> | null) || [])
        .filter((t) => t.challenge_id === c.id)
        .map((t) => ({ id: t.id, label: t.label, target_km: Number(t.target_km), sort_order: t.sort_order })),
      participants: ((entries as Array<{ challenge_id: string }> | null) || []).filter((e) => e.challenge_id === c.id).length,
    }));

    const products = ((proProducts as Array<{ id: string; name: string }> | null) || [])
      .map((p) => ({ id: p.id, kind: "professional" as const, name: p.name }));

    return { challenges, products };
  });

const tierInput = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(60),
  target_km: z.number().positive().max(10000),
});

export const saveRunChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(2).max(120),
    description: z.string().max(2000).nullable().optional(),
    starts_on: z.string(),
    ends_on: z.string(),
    is_active: z.boolean().default(true),
    requires_ticket: z.boolean().default(true),
    professional_product_id: z.string().uuid().nullable().optional(),
    tiers: z.array(tierInput).min(1).max(10),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const coachIds = await ownerCoachIds(context.userId);
    if (coachIds.length === 0) return { ok: false as const, error: "Você não tem painel de coach/profissional." };
    if (data.ends_on < data.starts_on) return { ok: false as const, error: "A data final deve ser depois da inicial." };

    let challengeId = data.id;
    const payload = {
      name: data.name,
      description: data.description ?? null,
      starts_on: data.starts_on,
      ends_on: data.ends_on,
      is_active: data.is_active,
      requires_ticket: data.requires_ticket,
      professional_product_id: data.professional_product_id ?? null,
      updated_at: new Date().toISOString(),
    };

    if (challengeId) {
      const { data: existing } = await supabaseAdmin
        .from("run_challenges").select("owner_coach_id").eq("id", challengeId).maybeSingle();
      const owner = (existing as { owner_coach_id: string } | null)?.owner_coach_id;
      if (!owner || !coachIds.includes(owner)) return { ok: false as const, error: "Sem permissão." };
      const { error } = await supabaseAdmin.from("run_challenges").update(payload as never).eq("id", challengeId);
      if (error) return { ok: false as const, error: error.message };
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("run_challenges")
        .insert({ ...payload, owner_coach_id: coachIds[0] } as never)
        .select("id").maybeSingle();
      if (error || !created) return { ok: false as const, error: error?.message || "Erro ao criar desafio." };
      challengeId = (created as { id: string }).id;
    }

    const keepIds = data.tiers.map((t) => t.id).filter(Boolean) as string[];
    if (keepIds.length > 0) {
      await supabaseAdmin.from("run_challenge_tiers").delete().eq("challenge_id", challengeId).not("id", "in", `(${keepIds.join(",")})`);
    } else {
      await supabaseAdmin.from("run_challenge_tiers").delete().eq("challenge_id", challengeId);
    }
    let order = 0;
    for (const t of data.tiers) {
      order += 1;
      if (t.id) {
        await supabaseAdmin.from("run_challenge_tiers")
          .update({ label: t.label, target_km: t.target_km, sort_order: order } as never).eq("id", t.id);
      } else {
        await supabaseAdmin.from("run_challenge_tiers")
          .insert({ challenge_id: challengeId, label: t.label, target_km: t.target_km, sort_order: order } as never);
      }
    }

    return { ok: true as const, id: challengeId };
  });

export const deleteRunChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const coachIds = await ownerCoachIds(context.userId);
    const { data: existing } = await supabaseAdmin
      .from("run_challenges").select("owner_coach_id").eq("id", data.id).maybeSingle();
    const owner = (existing as { owner_coach_id: string } | null)?.owner_coach_id;
    if (!owner || !coachIds.includes(owner)) return { ok: false as const, error: "Sem permissão." };
    const { error } = await supabaseAdmin.from("run_challenges").delete().eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export type RunChallengeParticipant = {
  entryId: string;
  profileId: string;
  name: string | null;
  tierLabel: string;
  targetKm: number;
  km: number;
  goalReachedAt: string | null;
  logs: Array<{ id: string; run_date: string; distance_km: number; photo_url: string | null; review_status: string }>;
};

export const listRunChallengeParticipants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { challengeId: string }) => z.object({ challengeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<RunChallengeParticipant[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const coachIds = await ownerCoachIds(context.userId);
    const { data: ch } = await supabaseAdmin
      .from("run_challenges").select("id, owner_coach_id, starts_on, ends_on").eq("id", data.challengeId).maybeSingle();
    const c = ch as unknown as { id: string; owner_coach_id: string; starts_on: string; ends_on: string } | null;
    if (!c || !coachIds.includes(c.owner_coach_id)) return [];

    const { data: entries } = await supabaseAdmin
      .from("run_challenge_entries")
      .select("id, profile_id, goal_reached_at, tier:tier_id(label, target_km), profile:profile_id(name)")
      .eq("challenge_id", c.id);

    const rows = (entries as Array<{
      id: string; profile_id: string; goal_reached_at: string | null;
      tier: { label: string; target_km: number } | null;
      profile: { name: string | null } | null;
    }> | null) || [];

    const out: RunChallengeParticipant[] = [];
    for (const e of rows) {
      const [{ data: km }, { data: logs }] = await Promise.all([
        supabaseAdmin.rpc("run_challenge_progress" as never, { _challenge_id: c.id, _profile_id: e.profile_id } as never),
        supabaseAdmin.from("run_logs")
          .select("id, run_date, distance_km, photo_url, review_status")
          .eq("profile_id", e.profile_id)
          .gte("run_date", c.starts_on).lte("run_date", c.ends_on)
          .order("run_date", { ascending: false }),
      ]);
      out.push({
        entryId: e.id,
        profileId: e.profile_id,
        name: e.profile?.name ?? null,
        tierLabel: e.tier?.label ?? "—",
        targetKm: Number(e.tier?.target_km ?? 0),
        km: Number(km ?? 0),
        goalReachedAt: e.goal_reached_at,
        logs: ((logs as Array<{ id: string; run_date: string; distance_km: number; photo_url: string | null; review_status: string }> | null) || [])
          .map((l) => ({ ...l, distance_km: Number(l.distance_km) })),
      });
    }
    out.sort((a, b) => b.km - a.km);
    return out;
  });

export const reviewRunLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { logId: string; status: "approved" | "rejected" | "pending"; note?: string | null }) =>
    z.object({
      logId: z.string().uuid(),
      status: z.enum(["approved", "rejected", "pending"]),
      note: z.string().max(500).nullable().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const coachIds = await ownerCoachIds(context.userId);
    if (coachIds.length === 0) return { ok: false as const, error: "Sem permissão." };

    const { data: log } = await supabaseAdmin.from("run_logs").select("id, profile_id").eq("id", data.logId).maybeSingle();
    const l = log as { id: string; profile_id: string } | null;
    if (!l) return { ok: false as const, error: "Registro não encontrado." };

    // O dono só pode revisar registros de quem está inscrito em um desafio dele.
    const { data: entries } = await supabaseAdmin
      .from("run_challenge_entries")
      .select("id, challenge:challenge_id(owner_coach_id)")
      .eq("profile_id", l.profile_id);
    const allowed = ((entries as Array<{ challenge: { owner_coach_id: string } | null }> | null) || [])
      .some((e) => e.challenge && coachIds.includes(e.challenge.owner_coach_id));
    if (!allowed) return { ok: false as const, error: "Sem permissão." };

    const { error } = await supabaseAdmin.from("run_logs")
      .update({ review_status: data.status, review_note: data.note ?? null } as never)
      .eq("id", data.logId);
    if (error) return { ok: false as const, error: error.message };
    await supabaseAdmin.rpc("run_challenge_sync_goals" as never, { _profile_id: l.profile_id } as never);
    return { ok: true as const };
  });
