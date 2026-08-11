import { supabase } from "@/integrations/supabase/client";
import {
  requiredTermTypes,
  TERMS_VERSION,
  type ActiveRoles,
  type TermType,
} from "@/lib/terms";

/**
 * O que falta a pessoa cumprir antes de usar o app.
 *
 * Dois itens hoje:
 *  1. Aceite da versão vigente de cada termo aplicável ao que ela tem ativo.
 *  2. Cidade no perfil — a loja e os gratuitos por localização dependem disso,
 *     e `profiles.city` existe mas nunca foi preenchida em cadastro nenhum.
 *
 * Tudo lê de tabela que já existe. Nenhuma migration.
 */

export type PendingCompliance = {
  loading: boolean;
  userId: string | null;
  profileId: string | null;
  /** Termos cuja versão vigente ainda não foi aceita por esta pessoa. */
  pendingTerms: Exclude<TermType, "desafio">[];
  /** true quando `profiles.city` está vazia. */
  needsCity: boolean;
  currentCity: string | null;
  currentState: string | null;
  roles: ActiveRoles;
};

export const EMPTY_PENDING: PendingCompliance = {
  loading: true,
  userId: null,
  profileId: null,
  pendingTerms: [],
  needsCity: false,
  currentCity: null,
  currentState: null,
  roles: { student: false, coach: false, professional: false, partner: false },
};

export async function loadPendingCompliance(): Promise<PendingCompliance> {
  const result: PendingCompliance = { ...EMPTY_PENDING, loading: false, pendingTerms: [] };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return result;
  result.userId = user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, city, state")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id) return result;
  result.profileId = profile.id;
  result.currentCity = (profile as { city?: string | null }).city ?? null;
  result.currentState = (profile as { state?: string | null }).state ?? null;
  result.needsCity = !String(result.currentCity || "").trim();

  // Papéis ativos — mesma leitura que o RoleSwitcher faz.
  const [{ data: coach }, { data: partner }, { data: student }, { data: membro }] = await Promise.all([
    supabase.from("coaches").select("id, is_professional, approved_at").eq("profile_id", profile.id).maybeSingle(),
    supabase.from("partners" as never).select("id" as never).eq("profile_id" as never, profile.id).limit(1),
    supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle(),
    supabase.from("partner_members" as never).select("id" as never).eq("profile_id" as never, profile.id).limit(1).maybeSingle(),
  ]);

  const coachRow = coach as { is_professional?: boolean; approved_at?: string | null } | null;
  result.roles = {
    student: !!student,
    coach: !!coach,
    professional: !!(coachRow?.is_professional && coachRow?.approved_at),
    partner: (Array.isArray(partner) ? partner.length : 0) > 0 || !!membro,
  };

  const required = requiredTermTypes(result.roles);
  if (required.length === 0) return result;

  // Aceites já registrados, na versão vigente de cada termo.
  const { data: accepted, error } = await supabase
    .from("terms_acceptances")
    .select("term_type, term_version")
    .eq("user_id", user.id)
    .in("term_type", required);

  if (error) {
    // Sem conseguir ler o histórico, não bloqueia o app: um erro de leitura
    // não pode virar porta trancada para quem já aceitou.
    console.error("[compliance-gate] aceites", error);
    return result;
  }

  const acceptedSet = new Set(
    ((accepted as Array<{ term_type: string; term_version: string }>) || [])
      .map((a) => `${a.term_type}@${a.term_version}`),
  );

  result.pendingTerms = required.filter(
    (type) => !acceptedSet.has(`${type}@${TERMS_VERSION[type]}`),
  );

  return result;
}

/** Grava a cidade e o estado no perfil. */
export async function saveCity(profileId: string, city: string, state: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ city: city.trim(), state: state.trim().toUpperCase() || null })
    .eq("id", profileId);
  if (error) throw new Error(error.message);
}

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
