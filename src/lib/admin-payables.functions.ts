import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const n = (v: unknown) => Number(v || 0);

async function getAdmin() {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin;
}


export type PayableWalletKind = "coach" | "partner" | "professional" | "student";

export interface PayablePersonRow {
  profileId: string;
  name: string;
  email: string | null;
  kind: PayableWalletKind;
  available: number;
  pending: number;
  withdrawn: number;
  /** Já solicitado e ainda não pago (reservado do disponível). */
  requested: number;
  /** Próxima data em que algo pendente vira disponível. */
  nextReleaseAt: string | null;
}

export interface PayableProjectionRow {
  month: string; // YYYY-MM
  amount: number;
  count: number;
}

export interface PayableWithdrawalRow {
  id: string;
  profileId: string | null;
  name: string;
  kind: PayableWalletKind;
  amount: number;
  status: string;
  requestedAt: string | null;
  paidAt: string | null;
}

export interface WalletAuditDiffRow {
  profileId: string | null;
  name: string | null;
  walletKind: string;
  field: string;
  before: number;
  after: number;
  delta: number;
}

export interface WalletAuditRun {
  id: string;
  runAt: string;
  walletsChecked: number;
  diffsCount: number;
  totalDelta: number;
  diffs: WalletAuditDiffRow[];
}

export interface PayablesReport {
  generatedAt: string;
  summary: {
    available: number;
    pending: number;
    requestedOpen: number;
    paidThisMonth: number;
    paidTotal: number;
    peopleWithBalance: number;
  };
  people: PayablePersonRow[];
  projection: PayableProjectionRow[];
  withdrawals: PayableWithdrawalRow[];
  lastAudit: WalletAuditRun | null;
}

async function loadLastAudit(): Promise<WalletAuditRun | null> {
  const supabaseAdmin = await getAdmin();
  const { data: run } = await supabaseAdmin
    .from("wallet_audit_runs" as never)
    .select("id,run_at,wallets_checked,diffs_count,total_delta" as never)
    .order("run_at" as never, { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = run as unknown as
    | { id: string; run_at: string; wallets_checked: number; diffs_count: number; total_delta: number }
    | null;
  if (!row) return null;
  const { data: diffs } = await supabaseAdmin
    .from("wallet_audit_diffs" as never)
    .select("profile_id,person_name,wallet_kind,field,before_value,after_value,delta" as never)
    .eq("run_id" as never, row.id as never)
    .order("delta" as never, { ascending: false })
    .limit(500);
  return {
    id: row.id,
    runAt: row.run_at,
    walletsChecked: row.wallets_checked,
    diffsCount: row.diffs_count,
    totalDelta: n(row.total_delta),
    diffs: ((diffs as unknown as Array<{
      profile_id: string | null; person_name: string | null; wallet_kind: string; field: string;
      before_value: number; after_value: number; delta: number;
    }>) || []).map((d) => ({
      profileId: d.profile_id,
      name: d.person_name,
      walletKind: d.wallet_kind,
      field: d.field,
      before: n(d.before_value),
      after: n(d.after_value),
      delta: n(d.delta),
    })),
  };
}

/** Relatório completo de contas a pagar (carteiras, fila de saques e projeção de liberação). */
export const getPayablesReport = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<PayablesReport> => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Acesso negado");
    const supabaseAdmin = await getAdmin();
    const { data, error } = await supabaseAdmin.rpc("admin_payables_report" as never, {} as never);
    if (error) throw new Error(error.message);
    const report = (data || {}) as unknown as Omit<PayablesReport, "lastAudit">;
    return { ...report, lastAudit: await loadLastAudit() };
  });

/** Roda o recálculo oficial de todas as carteiras e grava o que mudou (auditoria). */
export const runWalletAudit = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<WalletAuditRun | null> => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Acesso negado");
    const supabaseAdmin = await getAdmin();
    const { error } = await supabaseAdmin.rpc("admin_wallet_audit_run" as never, {
      _admin_user_id: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return loadLastAudit();
  });

/** Histórico das conferências já realizadas. */
export const listWalletAuditRuns = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Acesso negado");
    const supabaseAdmin = await getAdmin();
    const { data } = await supabaseAdmin
      .from("wallet_audit_runs" as never)
      .select("id,run_at,wallets_checked,diffs_count,total_delta" as never)
      .order("run_at" as never, { ascending: false })
      .limit(30);
    return ((data as unknown as Array<{ id: string; run_at: string; wallets_checked: number; diffs_count: number; total_delta: number }>) || []).map((x) => ({
      id: x.id,
      runAt: x.run_at,
      walletsChecked: x.wallets_checked,
      diffsCount: x.diffs_count,
      totalDelta: n(x.total_delta),
    }));
  });
