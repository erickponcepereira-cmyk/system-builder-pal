import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Cliente checagem: e-mail é slot de teste (`.test` domain OU whitelist).
export function isTestEmailClient(email: string): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  return /@fitmind\.test$/.test(e) || /\.test$/.test(e);
}

/**
 * PUBLIC (sem auth). Cria/reset de conta de teste:
 * - Valida que o e-mail é slot de teste (segurança).
 * - Se já existe user com esse e-mail → apaga cascata (admin_purge_user_dependents + auth.admin.deleteUser).
 * - Cria novo user com email_confirm=true (nada de e-mail).
 * - Retorna userId + tokens de sessão para o cliente já entrar.
 */
export const bootstrapTestSignup = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string; name: string }) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(6),
      name: z.string().min(1),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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

    // Marca profile como is_test (o profile é criado por trigger em outras rotas; garantimos após finalize)
    return { userId: created.user.id, email };
  });

/**
 * Marca perfil/students/coaches do usuário como is_test=true.
 * Deve ser chamado logo após finalizeRegistrationFn no fluxo de teste.
 * Só permitido se o e-mail do próprio usuário for slot de teste.
 */
export const markSelfAsTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("id, email").eq("user_id", userId).maybeSingle();
    if (!profile) throw new Error("Perfil não encontrado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isTest } = await supabaseAdmin.rpc("is_test_email", { _email: profile.email });
    if (!isTest) throw new Error("Usuário não é conta de teste.");

    await supabaseAdmin.from("profiles").update({ is_test: true }).eq("id", profile.id);
    await supabaseAdmin.from("students").update({ is_test: true }).eq("profile_id", profile.id);
    await supabaseAdmin.from("coaches").update({ is_test: true }).eq("profile_id", profile.id);
    return { ok: true };
  });

/**
 * Marca fatura de mensalidade como paga sem passar por Mercado Pago.
 * Só funciona para usuários is_test.
 */
export const simulateTestPayInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invoice_id: string }) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
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
      payment_method: "test",
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
 * Deleta o próprio usuário se for is_test. Cascata + auth.users.
 */
export const wipeTestSelf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("id, is_test, email").eq("user_id", userId).maybeSingle();
    if (!profile?.is_test) throw new Error("Apenas contas de teste podem ser removidas.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try { await supabaseAdmin.rpc("admin_purge_user_dependents", { _user_id: userId }); } catch { /* best effort */ }
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return { ok: true };
  });

/**
 * Retorna se o usuário logado é conta de teste (para o frontend ramificar UI).
 */
export const getIsTestUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("profiles").select("is_test").eq("user_id", context.userId).maybeSingle();
    return { isTest: Boolean(data?.is_test) };
  });
