import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ACTIVATION_PRODUCT_ID = "b43baf23-76b6-4abc-91a4-2730b3570d77"; // "Ativação Coach - Anual"
export const QUIZ_URL = "https://quiz-remember-share.lovable.app";

export type OnboardingStage =
  | "awaiting_payment"
  | "awaiting_quiz_result"
  | "awaiting_upline_release"
  | "released";

export async function getStageByProfileId(profileId: string) {
  const { data: coach } = await supabaseAdmin
    .from("coaches")
    .select("id, profile_id, upline_coach_id, onboarding_stage, quiz_result_url, activation_paid_at, approved_at")
    .eq("profile_id", profileId)
    .maybeSingle();
  return coach;
}

export async function notifyUpline(coachId: string, title: string, message: string) {
  const { data: coach } = await supabaseAdmin
    .from("coaches")
    .select("upline_coach_id, profile:profiles!coaches_profile_id_fkey(name)")
    .eq("id", coachId)
    .maybeSingle();
  const uplineCoachId = (coach as { upline_coach_id?: string } | null)?.upline_coach_id;
  if (!uplineCoachId) return;
  const { data: upline } = await supabaseAdmin
    .from("coaches")
    .select("profile_id")
    .eq("id", uplineCoachId)
    .maybeSingle();
  const uplineProfileId = (upline as { profile_id?: string } | null)?.profile_id;
  if (!uplineProfileId) return;
  await supabaseAdmin.from("notifications").insert({
    profile_id: uplineProfileId,
    type: "coach_onboarding",
    title,
    message,
    action_url: "/coach?tab=network",
  });
}

export async function notifyAdmins(title: string, message: string, actionUrl = "/admin/coach-releases") {
  const { data: admins } = await supabaseAdmin.from("profiles").select("id").eq("role", "admin");
  const rows = (admins || []).map((a: { id: string }) => ({
    profile_id: a.id,
    type: "coach_onboarding",
    title,
    message,
    action_url: actionUrl,
  }));
  if (rows.length) await supabaseAdmin.from("notifications").insert(rows);
}

/**
 * Chamado pelo webhook do MP quando um store_order é marcado como pago.
 * Se o pedido contém o produto de ativação e o pagador é um coach na etapa
 * "awaiting_payment", avança para "awaiting_quiz_result".
 */
export async function handlePaidStoreOrderForActivation(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from("store_orders")
    .select("id, student_id, store_order_items(product_id, store_product_id, digital_product_id)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  const items = (order as { store_order_items?: Array<{ product_id?: string | null; store_product_id?: string | null; digital_product_id?: string | null }> }).store_order_items || [];
  const hasActivation = items.some((i) =>
    i.product_id === ACTIVATION_PRODUCT_ID ||
    i.store_product_id === ACTIVATION_PRODUCT_ID ||
    i.digital_product_id === ACTIVATION_PRODUCT_ID
  );
  if (!hasActivation) return;

  const studentId = (order as { student_id?: string }).student_id;
  if (!studentId) return;
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("profile_id")
    .eq("id", studentId)
    .maybeSingle();
  const profileId = (student as { profile_id?: string } | null)?.profile_id;
  if (!profileId) return;

  const { data: coach } = await supabaseAdmin
    .from("coaches")
    .select("id, onboarding_stage, activation_paid_at")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (coach) {
    const c = coach as { id: string; onboarding_stage?: string; activation_paid_at?: string | null };
    const patch: {
      activation_paid_at?: string;
      activation_order_id?: string;
      activation_source?: string;
      onboarding_stage?: string;
    } = {};

    // A anuidade deve ser registrada SEMPRE que o pedido de ativação for pago,
    // independentemente da etapa do onboarding (profissional/parceiro/coach).
    if (!c.activation_paid_at) {
      patch.activation_paid_at = new Date().toISOString();
      patch.activation_order_id = orderId;
      patch.activation_source = "purchased";
    }
    // A etapa só avança quando o gate estava efetivamente esperando pagamento.
    if (c.onboarding_stage === "awaiting_payment") {
      patch.onboarding_stage = "awaiting_quiz_result";
    }
    if (Object.keys(patch).length > 0) {
      await supabaseAdmin.from("coaches").update(patch).eq("id", c.id);
    }
  }


  // Também marca a ativação anual do parceiro (se existir) — a anuidade é única para ambos os papéis.
  const { data: partner } = await supabaseAdmin
    .from("partners")
    .select("id, activation_paid_at")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (partner && !(partner as { activation_paid_at: string | null }).activation_paid_at) {
    await supabaseAdmin
      .from("partners")
      .update({
        activation_paid_at: new Date().toISOString(),
        activation_source: "purchased",
      })
      .eq("id", (partner as { id: string }).id);
  }
}
