import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabaseAdmin: any, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.role !== "admin") throw new Error("Acesso negado");
}

export interface ReferralSelfTestStep {
  step: string;
  ok: boolean;
  detail?: string;
}

export interface ReferralSelfTestResult {
  ok: boolean;
  steps: ReferralSelfTestStep[];
  summary: {
    productId?: string;
    productName?: string;
    referrerStudentId?: string;
    buyerStudentId?: string;
    transactionId?: string;
    commissionsTotal?: number;
    referralCommissionsCount?: number;
    referrerProfileId?: string;
    matchedReferrerProfile?: boolean;
  };
}

/**
 * Teste end-to-end (no banco) do fluxo de comissão por indicação aluno→aluno.
 *
 * Não toca em auth.users, MP ou frontend. Insere transação simulada com
 * referrer_student_id, executa process_paid_transaction, valida que ao menos
 * uma commission saiu com is_referral=true e referred_by_student_id correto,
 * e remove tudo no final (rollback manual).
 */
export const runReferralSelfTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReferralSelfTestResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(supabaseAdmin, (context as any).userId);

    const steps: ReferralSelfTestStep[] = [];
    const summary: ReferralSelfTestResult["summary"] = {};
    let transactionId: string | null = null;

    try {
      // 1) Encontrar produto com slot de indicação aluno→aluno
      const { data: slotRow, error: slotErr } = await supabaseAdmin
        .from("product_value_slots")
        .select("product_id, products!inner(id, name, price, status)")
        .eq("applies_to_student_referral", true)
        .eq("is_active", true)
        .eq("products.status", "active")
        .gt("products.price", 0)
        .limit(1)
        .maybeSingle();
      if (slotErr) throw new Error(`slots: ${slotErr.message}`);
      if (!slotRow) throw new Error("Nenhum produto ativo com slot de indicação aluno→aluno encontrado");
      const product = (slotRow as any).products;
      summary.productId = product.id;
      summary.productName = product.name;
      steps.push({ step: "Produto com slot de indicação", ok: true, detail: `${product.name} (R$ ${product.price})` });

      // 2) Pegar dois alunos distintos com profile vinculado
      const { data: students, error: stuErr } = await supabaseAdmin
        .from("students")
        .select("id, profile_id, coach_id")
        .not("profile_id", "is", null)
        .not("coach_id", "is", null)
        .limit(2);
      if (stuErr) throw new Error(`students: ${stuErr.message}`);
      if (!students || students.length < 2) throw new Error("Precisa de ao menos 2 alunos cadastrados");
      const [referrer, buyer] = students;
      summary.referrerStudentId = referrer.id;
      summary.buyerStudentId = buyer.id;
      summary.referrerProfileId = referrer.profile_id;
      steps.push({ step: "Alunos selecionados", ok: true, detail: `indicador=${referrer.id.slice(0, 8)} comprador=${buyer.id.slice(0, 8)}` });

      // 3) Inserir transação paga com referrer_student_id
      const { data: tx, error: txErr } = await supabaseAdmin
        .from("transactions")
        .insert({
          student_id: buyer.id,
          product_id: product.id,
          gross_amount: product.price,
          net_amount: product.price,
          payment_method: "pix",
          status: "paid",
          paid_at: new Date().toISOString(),
          purchase_type: "challenge",
          referrer_student_id: referrer.id,
          metadata: { selftest: true, kind: "referral_selftest" },
        })
        .select("id")
        .single();
      if (txErr || !tx) throw new Error(`insert tx: ${txErr?.message}`);
      transactionId = tx.id;
      summary.transactionId = tx.id;
      steps.push({ step: "Transação simulada criada", ok: true, detail: tx.id });

      // 4) Executar engine de comissões
      const { error: procErr } = await supabaseAdmin.rpc("process_paid_transaction", { _transaction_id: tx.id });
      if (procErr) throw new Error(`process_paid_transaction: ${procErr.message}`);
      steps.push({ step: "process_paid_transaction executou", ok: true });

      // 5) Validar comissões
      const { data: commissions, error: comErr } = await supabaseAdmin
        .from("commissions")
        .select("id, is_referral, referred_by_student_id, beneficiary_profile_id, amount, slot_label")
        .eq("transaction_id", tx.id);
      if (comErr) throw new Error(`select commissions: ${comErr.message}`);
      summary.commissionsTotal = commissions?.length ?? 0;
      const referralCommissions = (commissions ?? []).filter((c) => c.is_referral === true);
      summary.referralCommissionsCount = referralCommissions.length;

      const hasReferralFlag = referralCommissions.length > 0;
      steps.push({
        step: "Comissões com is_referral=true",
        ok: hasReferralFlag,
        detail: `${referralCommissions.length} / ${commissions?.length ?? 0}`,
      });

      const matched = referralCommissions.find((c) => c.referred_by_student_id === referrer.id);
      summary.matchedReferrerProfile = !!matched;
      steps.push({
        step: "referred_by_student_id corresponde ao indicador",
        ok: !!matched,
        detail: matched
          ? `comissão ${matched.id.slice(0, 8)} (${matched.slot_label ?? "?"}) → ${matched.referred_by_student_id?.slice(0, 8)}`
          : `nenhuma das ${referralCommissions.length} comissões aponta para ${referrer.id.slice(0, 8)}`,
      });

      const allOk = steps.every((s) => s.ok);
      return { ok: allOk, steps, summary };
    } finally {
      // Rollback: remove commissions + tx criadas para o teste
      if (transactionId) {
        await supabaseAdmin.from("commissions").delete().eq("transaction_id", transactionId);
        await supabaseAdmin.from("coach_points_log").delete().eq("transaction_id", transactionId);
        await supabaseAdmin.from("product_order_pool_entries").delete().eq("transaction_id", transactionId);
        await supabaseAdmin.from("admin_system_wallet_entries").delete().eq("transaction_id", transactionId);
        await supabaseAdmin.from("master_coach_attendances").delete().eq("transaction_id", transactionId);
        await supabaseAdmin.from("transactions").delete().eq("id", transactionId);
      }
    }
  });
