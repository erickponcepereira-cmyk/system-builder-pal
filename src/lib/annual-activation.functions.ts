import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ANNUAL_PRODUCT_ID = "b43baf23-76b6-4abc-91a4-2730b3570d77"; // Ativação Anual — R$ 179,90

export type ActivationSource =
  | "purchased"     // pagamento real (existe activation_order_id)
  | "already_coach" // autodeclaração "já sou coach"
  | "admin_grant"   // concedida manualmente por admin
  | "exempt"        // perfil ativo sem registro de ativação (legado/isento)
  | "none";         // sem ativação

function addOneYear(d: Date): Date {
  const n = new Date(d);
  n.setFullYear(n.getFullYear() + 1);
  return n;
}

function resolveSource(c: {
  activation_paid_at: string | null;
  activation_source: string | null;
  activation_order_id: string | null;
  already_coach: boolean | null;
}): ActivationSource {
  if (!c.activation_paid_at) return "none";
  if (c.activation_source === "purchased" || c.activation_source === "already_coach" || c.activation_source === "admin_grant") {
    return c.activation_source;
  }
  // Fallback heurístico para registros antigos sem source preenchido
  if (c.activation_order_id) return "purchased";
  if (c.already_coach) return "already_coach";
  return "admin_grant";
}

/**
 * Retorna o estado da anuidade (curso de Ativação Anual) do usuário logado.
 */
export const getMyAnnualActivation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: product } = await supabase
      .from("products")
      .select("id, name, price, is_active")
      .eq("id", ANNUAL_PRODUCT_ID)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, status, created_at")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: coach } = await supabase
      .from("coaches")
      .select("id, activation_paid_at, activation_order_id, activation_source, activation_note, already_coach, created_at")
      .eq("profile_id", profile?.id ?? "")
      .maybeSingle();

    const today = new Date();
    let paidAt: Date | null = null;
    let source: ActivationSource = "none";
    let note: string | null = null;

    if (coach?.activation_paid_at) {
      paidAt = new Date(coach.activation_paid_at);
      source = resolveSource(coach as never);
      note = (coach as { activation_note?: string | null }).activation_note ?? null;
    } else if (coach?.id && profile?.status === "active") {
      paidAt = new Date(coach.created_at ?? profile.created_at ?? Date.now());
      source = "exempt";
    }

    const validUntil = paidAt ? addOneYear(paidAt) : null;
    const active = validUntil ? validUntil >= today : false;
    const daysRemaining = validUntil
      ? Math.max(0, Math.ceil((validUntil.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    return {
      product: product
        ? { id: product.id, name: product.name, price: Number(product.price), is_active: product.is_active }
        : null,
      isCoach: Boolean(coach?.id),
      source,
      note,
      paidAt: paidAt ? paidAt.toISOString() : null,
      validUntil: validUntil ? validUntil.toISOString() : null,
      active,
      daysRemaining,
    };
  });

/**
 * Admin: estado da anuidade de TODOS os usuários (indexado por user_id).
 */
export const listAllAnnualActivationsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: userId });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: coaches } = await supabaseAdmin
      .from("coaches")
      .select("id, profile_id, activation_paid_at, activation_order_id, activation_source, activation_note, already_coach, created_at, onboarding_stage, profile:profiles!coaches_profile_id_fkey(user_id, status)");

    const today = new Date();
    type Row = {
      user_id: string;
      paid_at: string | null;
      valid_until: string | null;
      source: ActivationSource;
      note: string | null;
      active: boolean;
    };
    const rows: Row[] = [];
    for (const c of (coaches || []) as Array<{
      activation_paid_at: string | null;
      activation_order_id: string | null;
      activation_source: string | null;
      activation_note: string | null;
      already_coach: boolean | null;
      created_at: string;
      onboarding_stage: string | null;
      profile?: { user_id?: string; status?: string } | null;
    }>) {
      const uid = c.profile?.user_id;
      if (!uid) continue;
      let paidAt: Date | null = null;
      let source: ActivationSource = "none";
      let note: string | null = null;
      if (c.activation_paid_at) {
        paidAt = new Date(c.activation_paid_at);
        source = resolveSource(c);
        note = c.activation_note;
      } else if (c.profile?.status === "active") {
        paidAt = new Date(c.created_at);
        source = "exempt";
      }
      const validUntil = paidAt ? addOneYear(paidAt) : null;
      rows.push({
        user_id: uid,
        paid_at: paidAt ? paidAt.toISOString() : null,
        valid_until: validUntil ? validUntil.toISOString() : null,
        source,
        note,
        active: validUntil ? validUntil >= today : false,
      });
    }
    return rows;
  });
