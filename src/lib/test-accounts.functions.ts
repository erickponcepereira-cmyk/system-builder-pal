import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";

function testAccountFeaturesEnabled(): boolean {
  return process.env.ENABLE_TEST_ACCOUNT_FEATURES === "true";
}

/**
 * Provisionamento administrativo de conta de teste.
 * - Exige master admin autenticado e flag explícita no servidor.
 * - Aceita apenas slots cadastrados na whitelist do banco.
 * - Se já existe user com esse e-mail → apaga cascata (admin_purge_user_dependents + auth.admin.deleteUser).
 * - Cria novo user com email_confirm=true (nada de e-mail).
 * - Marca os registros criados como teste e retorna apenas userId + e-mail.
 */
export const bootstrapTestSignup = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string; name: string }) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(12),
      name: z.string().min(1),
    }).parse(d)
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    if (process.env.ENABLE_TEST_ACCOUNT_BOOTSTRAP !== "true") {
      throw new Error("Provisionamento de contas de teste desativado neste ambiente.");
    }
    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: actor } = await supabaseAdmin
      .from("profiles")
      .select("role,is_master_admin")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (actor?.role !== "admin" || !(actor as { is_master_admin?: boolean }).is_master_admin) {
      throw new Error("Acesso negado.");
    }

    // Whitelist server-side (canonical)
    const { data: isTest, error: errCheck } = await supabaseAdmin.rpc("is_test_email", { _email: email });
    if (errCheck) throw new Error(errCheck.message);
    if (!isTest) throw new Error("E-mail não é um slot de conta de teste válido.");

    // Purge se existir
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const prior = existing?.users?.find((u) => u.email?.toLowerCase() === email);
    if (prior) {
      try { await supabaseAdmin.rpc("admin_purge_user_dependents", { _user_id: prior.id }); } catch { /* best effort */ }
      await supabaseAdmin.auth.admin.deleteUser(prior.id);
    }

    // Cria confirmado
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name.trim(), role: "student", is_test: true },
    });
    if (error || !created?.user) throw new Error(error?.message || "Falha ao criar conta de teste.");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .update({ is_test: true })
      .eq("user_id", created.user.id)
      .select("id")
      .maybeSingle();
    if (profile?.id) {
      await Promise.all([
        supabaseAdmin.from("students").update({ is_test: true }).eq("profile_id", profile.id),
        supabaseAdmin.from("coaches").update({ is_test: true }).eq("profile_id", profile.id),
      ]);
    }

    return { userId: created.user.id, email };
  });

/**
 * Marca fatura de mensalidade como paga sem passar por Mercado Pago.
 * Só funciona para usuários is_test e em ambiente explicitamente habilitado.
 */
export const simulateTestPayInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invoice_id: string }) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!testAccountFeaturesEnabled()) {
      throw new Error("Recursos de conta de teste estão desativados.");
    }
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("id, is_test").eq("user_id", userId).maybeSingle();
    if (!profile?.is_test) throw new Error("Apenas contas de teste podem simular pagamento.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin.from("subscription_invoices").select("id, user_id, status").eq("id", data.invoice_id).maybeSingle();
    if (!inv || inv.user_id !== userId) throw new Error("Fatura não encontrada.");
    if (inv.status === "paid") return { ok: true };
    await supabaseAdmin.from("subscription_invoices").update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_method: "manual_admin",
      is_test: true,
    }).eq("id", data.invoice_id);
    return { ok: true };
  });

/**
 * Marca ativação anual (coach) como paga sem passar por Mercado Pago.
 * Só funciona para usuários is_test.
 */
export const simulateTestPayAnnual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!testAccountFeaturesEnabled()) {
      throw new Error("Recursos de conta de teste estão desativados.");
    }
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("id, is_test").eq("user_id", userId).maybeSingle();
    if (!profile?.is_test) throw new Error("Apenas contas de teste podem simular pagamento.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("coaches").update({
      activation_paid_at: new Date().toISOString(),
      activation_source: "admin_grant",
      activation_note: "Pagamento simulado (conta de teste)",
    }).eq("profile_id", profile.id);
    return { ok: true };
  });

/**
 * Retorna se o usuário logado é conta de teste (para o frontend ramificar UI).
 */
export const getIsTestUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!testAccountFeaturesEnabled()) return { isTest: false };
    const { data } = await context.supabase.from("profiles").select("is_test").eq("user_id", context.userId).maybeSingle();
    return { isTest: Boolean(data?.is_test) };
  });
