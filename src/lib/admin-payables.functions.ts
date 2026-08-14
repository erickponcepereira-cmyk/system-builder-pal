import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const n = (v: unknown) => Number(v || 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

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

async function nameIndex(profileIds: string[]) {
  const map = new Map<string, { name: string; email: string | null }>();
  const unique = Array.from(new Set(profileIds.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 300) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id,name,email")
      .in("id", unique.slice(i, i + 300));
    for (const p of (data as Array<{ id: string; name: string | null; email: string | null }>) || []) {
      map.set(p.id, { name: p.name || "—", email: p.email });
    }
  }
  return map;
}

async function loadLastAudit(): Promise<WalletAuditRun | null> {
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
    await assertAdmin(context.userId);

    const people: PayablePersonRow[] = [];

    // ---- carteira de coach ----
    const { data: coachWallets } = await supabaseAdmin
      .from("wallets")
      .select("profile_id,available_balance,pending_balance,total_withdrawn,is_test");
    // ---- carteira de parceiro ----
    const { data: partnerWallets } = await supabaseAdmin
      .from("partner_wallets")
      .select("partner_id,available_balance,pending_balance,total_withdrawn,partners!inner(profile_id)");
    // ---- carteira de profissional ----
    const { data: proWallets } = await supabaseAdmin
      .from("professional_wallets")
      .select("professional_coach_id,available_balance,pending_balance,total_withdrawn,coaches!inner(profile_id)");
    // ---- carteira de aluno ----
    const { data: studentWallets } = await supabaseAdmin
      .from("student_wallets")
      .select("student_id,available_balance,pending_balance,total_withdrawn,is_test,students!inner(profile_id)");

    const push = (
      profileId: string | null | undefined,
      kind: PayableWalletKind,
      available: unknown,
      pending: unknown,
      withdrawn: unknown,
    ) => {
      if (!profileId) return;
      const a = r2(n(available));
      const p = r2(n(pending));
      const w = r2(n(withdrawn));
      if (a === 0 && p === 0 && w === 0) return;
      people.push({
        profileId, kind, name: "—", email: null,
        available: a, pending: p, withdrawn: w, requested: 0, nextReleaseAt: null,
      });
    };

    for (const w of (coachWallets as Array<Record<string, unknown>>) || []) {
      if (w['is_test']) continue;
      push(w['profile_id'] as string, "coach", w['available_balance'], w['pending_balance'], w['total_withdrawn']);
    }
    for (const w of (partnerWallets as Array<Record<string, unknown>>) || []) {
      const prof = (w['partners'] as { profile_id?: string } | null)?.profile_id;
      push(prof, "partner", w['available_balance'], w['pending_balance'], w['total_withdrawn']);
    }
    for (const w of (proWallets as Array<Record<string, unknown>>) || []) {
      const prof = (w['coaches'] as { profile_id?: string } | null)?.profile_id;
      push(prof, "professional", w['available_balance'], w['pending_balance'], w['total_withdrawn']);
    }
    for (const w of (studentWallets as Array<Record<string, unknown>>) || []) {
      if (w['is_test']) continue;
      const prof = (w['students'] as { profile_id?: string } | null)?.profile_id;
      push(prof, "student", w['available_balance'], w['pending_balance'], w['total_withdrawn']);
    }

    const names = await nameIndex(people.map((p) => p.profileId));
    for (const p of people) {
      const info = names.get(p.profileId);
      p.name = info?.name || "—";
      p.email = info?.email ?? null;
    }

    // ---- saques ----
    const { data: wr } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("id,profile_id,amount,status,requested_at,paid_at")
      .order("requested_at", { ascending: false })
      .limit(1000);
    const { data: swr } = await supabaseAdmin
      .from("student_withdrawal_requests" as never)
      .select("id,student_id,amount,status,requested_at,paid_at" as never)
      .order("requested_at" as never, { ascending: false })
      .limit(1000);

    const studentRows = ((swr as unknown as Array<{ id: string; student_id: string; amount: number; status: string; requested_at: string | null; paid_at: string | null }>) || []);
    const studentIds = studentRows.map((s) => s.student_id).filter(Boolean);
    const studentProfile = new Map<string, string>();
    for (let i = 0; i < studentIds.length; i += 300) {
      const { data } = await supabaseAdmin.from("students").select("id,profile_id").in("id", studentIds.slice(i, i + 300));
      for (const s of (data as Array<{ id: string; profile_id: string }>) || []) studentProfile.set(s.id, s.profile_id);
    }

    const allProfileIds = [
      ...(((wr as Array<{ profile_id: string }>) || []).map((x) => x.profile_id)),
      ...Array.from(studentProfile.values()),
    ];
    const wrNames = await nameIndex(allProfileIds);

    const withdrawals: PayableWithdrawalRow[] = [
      ...(((wr as Array<{ id: string; profile_id: string; amount: number; status: string; requested_at: string | null; paid_at: string | null }>) || []).map((x) => ({
        id: x.id,
        profileId: x.profile_id,
        name: wrNames.get(x.profile_id)?.name || names.get(x.profile_id)?.name || "—",
        kind: (people.find((p) => p.profileId === x.profile_id)?.kind || "coach") as PayableWalletKind,
        amount: n(x.amount),
        status: x.status,
        requestedAt: x.requested_at,
        paidAt: x.paid_at,
      }))),
      ...studentRows.map((x) => {
        const pid = studentProfile.get(x.student_id) || null;
        return {
          id: x.id,
          profileId: pid,
          name: (pid && (wrNames.get(pid)?.name || names.get(pid)?.name)) || "—",
          kind: "student" as PayableWalletKind,
          amount: n(x.amount),
          status: x.status,
          requestedAt: x.requested_at,
          paidAt: x.paid_at,
        };
      }),
    ].sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));

    const openStatuses = new Set(["requested", "approved", "processing"]);
    for (const w of withdrawals) {
      if (!openStatuses.has(w.status) || !w.profileId) continue;
      const target = people.find((p) => p.profileId === w.profileId);
      if (target) target.requested = r2(target.requested + w.amount);
    }

    // ---- projeção: comissões pendentes com data de liberação ----
    const { data: pend } = await supabaseAdmin
      .from("commissions")
      .select("amount,available_at,beneficiary_profile_id,is_test,is_referral,slot_label,status")
      .eq("status", "pending")
      .limit(5000);
    const byMonth = new Map<string, { amount: number; count: number }>();
    const nextByProfile = new Map<string, string>();
    for (const c of (pend as Array<Record<string, unknown>>) || []) {
      if (c['is_test']) continue;
      if (/^(sistema|admin|nutri)/i.test(String(c['slot_label'] || ""))) continue;
      const iso = c['available_at'] ? String(c['available_at']) : null;
      const key = iso ? iso.slice(0, 7) : "sem_data";
      const cur = byMonth.get(key) || { amount: 0, count: 0 };
      cur.amount = r2(cur.amount + n(c['amount']));
      cur.count += 1;
      byMonth.set(key, cur);
      const pid = c['beneficiary_profile_id'] as string | null;
      if (pid && iso) {
        const prev = nextByProfile.get(pid);
        if (!prev || iso < prev) nextByProfile.set(pid, iso);
      }
    }
    for (const p of people) p.nextReleaseAt = nextByProfile.get(p.profileId) || null;

    const projection: PayableProjectionRow[] = Array.from(byMonth.entries())
      .map(([month, v]) => ({ month, amount: v.amount, count: v.count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const monthPrefix = new Date().toISOString().slice(0, 7);
    const summary = {
      available: r2(people.reduce((s, p) => s + p.available, 0)),
      pending: r2(people.reduce((s, p) => s + p.pending, 0)),
      requestedOpen: r2(withdrawals.filter((w) => openStatuses.has(w.status)).reduce((s, w) => s + w.amount, 0)),
      paidThisMonth: r2(withdrawals.filter((w) => w.status === "paid" && (w.paidAt || "").startsWith(monthPrefix)).reduce((s, w) => s + w.amount, 0)),
      paidTotal: r2(withdrawals.filter((w) => w.status === "paid").reduce((s, w) => s + w.amount, 0)),
      peopleWithBalance: people.filter((p) => p.available > 0 || p.pending > 0).length,
    };

    people.sort((a, b) => b.available + b.pending - (a.available + a.pending));

    return {
      generatedAt: new Date().toISOString(),
      summary,
      people,
      projection,
      withdrawals,
      lastAudit: await loadLastAudit(),
    };
  });

/** Roda o recálculo oficial de todas as carteiras e grava o que mudou (auditoria). */
export const runWalletAudit = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<WalletAuditRun | null> => {
    await assertAdmin(context.userId);
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
    await assertAdmin(context.userId);
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
