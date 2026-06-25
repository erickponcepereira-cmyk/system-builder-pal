import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ANNUAL_PRODUCT_ID = "b43baf23-76b6-4abc-91a4-2730b3570d77"; // Ativação Anual — R$ 179,90

function addOneYear(d: Date): Date {
  const n = new Date(d);
  n.setFullYear(n.getFullYear() + 1);
  return n;
}

/**
 * Retorna o estado da anuidade (curso de Ativação Anual) do usuário logado.
 * - Para coaches que pagaram: validade = activation_paid_at + 1 ano.
 * - Para coaches isentos (sem pagamento, mas perfil ativo): validade = data de criação do perfil + 1 ano.
 * - Para usuários sem registro de coach: retorna apenas o produto e status "não iniciado".
 */
export const getMyAnnualActivation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Produto Ativação Anual (apenas leitura — pode falhar silenciosamente)
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
      .select("id, activation_paid_at, activation_order_id, created_at")
      .eq("profile_id", profile?.id ?? "")
      .maybeSingle();

    const today = new Date();
    let paidAt: Date | null = null;
    let source: "paid" | "exempt" | "none" = "none";

    if (coach?.activation_paid_at) {
      paidAt = new Date(coach.activation_paid_at);
      source = "paid";
    } else if (coach?.id && profile?.status === "active") {
      // Isento: usa created_at do coach (ou profile como fallback) como ponto zero
      paidAt = new Date(coach.created_at ?? profile.created_at);
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
      paidAt: paidAt ? paidAt.toISOString() : null,
      validUntil: validUntil ? validUntil.toISOString() : null,
      active,
      daysRemaining,
    };
  });
