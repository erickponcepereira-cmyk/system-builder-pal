import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

export type SellerWithdrawalSource = "coach" | "partner" | "professional";
export type WithdrawalRequestKind = "seller" | "student";

export type WithdrawalRow = {
  id: string;
  amount: number;
  status: string | null;
  requested_at: string | null;
  paid_at: string | null;
  notes?: string | null;
  kind: WithdrawalRequestKind;
};

export const requestSellerWithdrawal = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((data: {
    source: SellerWithdrawalSource;
    entityId?: string | null;
    amount: number;
    pixKey: string;
    pixKeyType?: string | null;
    bankName?: string | null;
    bankAgency?: string | null;
    bankAccount?: string | null;
    bankAccountType?: string | null;
  }) => data)
  .handler(async ({ context, data }): Promise<WithdrawalRow> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const amount = Math.round(Number(data.amount || 0) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 50) throw new Error("Saque mínimo: R$ 50,00");
    const pixKey = String(data.pixKey || "").trim();
    if (!pixKey) throw new Error("Informe a chave PIX");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile?.id) throw new Error("Perfil não encontrado");

    const activeStatuses = ["requested", "approved", "processing"] as const;
    const { data: activeSeller } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("id,amount,status,requested_at")
      .eq("profile_id", profile.id)
      .in("status", activeStatuses)
      .order("requested_at", { ascending: false })
      .limit(1);
    if ((activeSeller || []).length > 0) {
      const current = activeSeller![0] as { amount: number };
      throw new Error(`Você já tem uma solicitação pendente de R$ ${Number(current.amount || 0).toFixed(2).replace(".", ",")}. Cancele antes de refazer.`);
    }

    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (student?.id) {
      const { data: activeStudent } = await supabaseAdmin
        .from("student_withdrawal_requests" as never)
        .select("id,amount,status,requested_at" as never)
        .eq("student_id" as never, student.id as never)
        .in("status" as never, activeStatuses as never)
        .order("requested_at" as never, { ascending: false })
        .limit(1);
      if (((activeStudent as any[]) || []).length > 0) {
        const current = (activeStudent as any[])[0];
        throw new Error(`Você já tem uma solicitação pendente de R$ ${Number(current.amount || 0).toFixed(2).replace(".", ",")}. Cancele antes de refazer.`);
      }
    }

    let partnerId: string | null = null;
    let professionalCoachId: string | null = null;
    let available = 0;
    const notesParts = [data.bankName, data.bankAgency, data.bankAccount, data.bankAccountType]
      .map((v) => String(v || "").trim())
      .filter(Boolean);

    if (data.source === "partner") {
      let q = supabaseAdmin.from("partners" as never).select("id" as never).eq("profile_id" as never, profile.id as never);
      if (data.entityId) q = q.eq("id" as never, data.entityId as never);
      const { data: partner, error } = await q.maybeSingle();
      if (error) throw new Error(error.message);
      if (!(partner as any)?.id) throw new Error("Parceiro não encontrado para este perfil");
      partnerId = (partner as any).id;
      const { data: wallet } = await supabaseAdmin
        .from("partner_wallets" as never)
        .select("available_balance" as never)
        .eq("partner_id" as never, partnerId as never)
        .maybeSingle();
      available = Number((wallet as any)?.available_balance || 0);
    } else if (data.source === "professional") {
      let q = supabaseAdmin.from("coaches" as never).select("id" as never).eq("profile_id" as never, profile.id as never);
      if (data.entityId) q = q.eq("id" as never, data.entityId as never);
      const { data: coach, error } = await q.maybeSingle();
      if (error) throw new Error(error.message);
      if (!(coach as any)?.id) throw new Error("Profissional não encontrado para este perfil");
      professionalCoachId = (coach as any).id;
      const { data: wallet } = await supabaseAdmin
        .from("professional_wallets" as never)
        .select("available_balance" as never)
        .eq("professional_coach_id" as never, professionalCoachId as never)
        .maybeSingle();
      available = Number((wallet as any)?.available_balance || 0);
    } else {
      let q = supabaseAdmin.from("coaches" as never).select("id" as never).eq("profile_id" as never, profile.id as never);
      if (data.entityId) q = q.eq("id" as never, data.entityId as never);
      const { data: coach, error } = await q.maybeSingle();
      if (error) throw new Error(error.message);
      if (!(coach as any)?.id) throw new Error("Coach não encontrado para este perfil");
      const { error: bankError } = await supabaseAdmin.from("coaches" as never).update({
        pix_key: pixKey,
        pix_key_type: data.pixKeyType || "other",
        bank_name: data.bankName?.trim() || null,
        bank_agency: data.bankAgency?.trim() || null,
        bank_account: data.bankAccount?.trim() || null,
        bank_account_type: data.bankAccountType || null,
      } as never).eq("id" as never, (coach as any).id as never);
      if (bankError) throw new Error(bankError.message);
      const { data: wallet } = await supabaseAdmin
        .from("wallets")
        .select("available_balance")
        .eq("profile_id", profile.id)
        .maybeSingle();
      available = Number(wallet?.available_balance || 0);
    }

    if (amount > available) throw new Error(`Saldo disponível insuficiente (${available.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`);

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("withdrawal_requests")
      .insert({
        profile_id: profile.id,
        partner_id: partnerId,
        professional_coach_id: professionalCoachId,
        amount,
        pix_key: pixKey,
        pix_key_type: data.pixKeyType || "other",
        status: "requested",
        notes: notesParts.join(" · ") || null,
      } as never)
      .select("id,amount,status,requested_at,paid_at,notes")
      .single();
    if (insertError || !inserted) throw new Error(insertError?.message || "Erro ao solicitar saque");
    const row = inserted as unknown as Omit<WithdrawalRow, "kind">;
    return { ...row, amount: Number(row.amount), kind: "seller" };
  });

export const requestStudentWithdrawal = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((data: {
    studentId: string;
    amount: number;
    pixKey: string;
    pixKeyType: string;
    holderName: string;
    holderCpf: string;
  }) => data)
  .handler(async ({ context, data }): Promise<WithdrawalRow> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const amount = Math.round(Number(data.amount || 0) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 50) throw new Error("Saque mínimo: R$ 50,00");
    const pixKey = String(data.pixKey || "").trim();
    const holderName = String(data.holderName || "").trim();
    const holderCpf = String(data.holderCpf || "").trim();
    if (!pixKey || !holderName || !holderCpf) throw new Error("Preencha os dados do PIX");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile?.id) throw new Error("Perfil não encontrado");
    const { data: student, error: studentError } = await supabaseAdmin
      .from("students")
      .select("id,profile_id")
      .eq("id", data.studentId)
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (studentError) throw new Error(studentError.message);
    if (!student?.id) throw new Error("Aluno não encontrado");

    const activeStatuses = ["requested", "approved", "processing"] as const;
    const { data: activeStudent } = await supabaseAdmin
      .from("student_withdrawal_requests" as never)
      .select("id,amount,status,requested_at" as never)
      .eq("student_id" as never, student.id as never)
      .in("status" as never, activeStatuses as never)
      .order("requested_at" as never, { ascending: false })
      .limit(1);
    if (((activeStudent as any[]) || []).length > 0) {
      const current = (activeStudent as any[])[0];
      throw new Error(`Você já tem uma solicitação pendente de R$ ${Number(current.amount || 0).toFixed(2).replace(".", ",")}. Cancele antes de refazer.`);
    }
    const { data: activeSeller } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("id,amount,status,requested_at")
      .eq("profile_id", profile.id)
      .in("status", activeStatuses)
      .order("requested_at", { ascending: false })
      .limit(1);
    if ((activeSeller || []).length > 0) {
      const current = activeSeller![0] as { amount: number };
      throw new Error(`Você já tem uma solicitação pendente de R$ ${Number(current.amount || 0).toFixed(2).replace(".", ",")}. Cancele antes de refazer.`);
    }

    const { data: wallet } = await supabaseAdmin
      .from("student_wallets")
      .select("available_balance")
      .eq("student_id", student.id)
      .maybeSingle();
    const available = Number(wallet?.available_balance || 0);
    if (amount > available) throw new Error(`Saldo disponível insuficiente (${available.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`);

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("student_withdrawal_requests" as never)
      .insert({
        student_id: student.id,
        amount,
        pix_key: pixKey,
        pix_key_type: data.pixKeyType || "other",
        holder_name: holderName,
        holder_cpf: holderCpf,
        status: "requested",
      } as never)
      .select("id,amount,status,requested_at,paid_at,notes" as never)
      .single();
    if (insertError || !inserted) throw new Error(insertError?.message || "Erro ao solicitar saque");
    const row = inserted as unknown as Omit<WithdrawalRow, "kind">;
    return { ...row, amount: Number(row.amount), kind: "student" };
  });

export const cancelMyWithdrawalRequest = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((data: { withdrawalId: string; kind: WithdrawalRequestKind }) => data)
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile?.id) throw new Error("Perfil não encontrado");

    if (data.kind === "student") {
      const { data: student } = await supabaseAdmin
        .from("students")
        .select("id")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (!student?.id) throw new Error("Aluno não encontrado");
      const { data: wr } = await supabaseAdmin
        .from("student_withdrawal_requests" as never)
        .select("id,status,notes" as never)
        .eq("id" as never, data.withdrawalId as never)
        .eq("student_id" as never, student.id as never)
        .maybeSingle();
      if (!(wr as any)?.id) throw new Error("Solicitação não encontrada");
      if ((wr as any).status !== "requested") throw new Error("Só é possível cancelar solicitações pendentes");
      const notes = [(wr as any).notes, "Cancelado pelo solicitante"].filter(Boolean).join(" · ");
      const { error } = await supabaseAdmin
        .from("student_withdrawal_requests" as never)
        .update({ status: "rejected", notes } as never)
        .eq("id" as never, data.withdrawalId as never);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    const { data: wr } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("id,status,notes")
      .eq("id", data.withdrawalId)
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!wr?.id) throw new Error("Solicitação não encontrada");
    if (wr.status !== "requested") throw new Error("Só é possível cancelar solicitações pendentes");
    const notes = [wr.notes, "Cancelado pelo solicitante"].filter(Boolean).join(" · ");
    const { error } = await supabaseAdmin
      .from("withdrawal_requests")
      .update({ status: "rejected", notes } as never)
      .eq("id", data.withdrawalId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });