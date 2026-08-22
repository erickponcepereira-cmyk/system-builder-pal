import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WalletStatement = {
  profileId: string;
  generatedAt: string;
  /** Pode sacar agora (comissões liberadas + produto criado liberado), já descontado adiantamento. NÃO inclui Fitcoin. */
  available: number;
  /** Disponível antes de descontar o adiantamento em aberto. */
  availableBeforeAdvance: number;
  /** Adiantamento em aberto (recebeu acima do liberado) — desconta do disponível. */
  advanceOpen: number;
  /** Em carência (ainda não passou o prazo de liberação). */
  hold: number;
  /** Rede liberada por prazo, porém bloqueada até bater a missão do mês. */
  networkBlocked: number;
  /** Total pendente registrado nas carteiras profissionais. */
  pendingTotal: number;
  /** Saques solicitados/aprovados aguardando pagamento. */
  withdrawOpen: number;
  /** Saques já pagos. */
  withdrawnPaid: number;
  /** Valor usado para pagar mensalidade/pedidos com a própria carteira. */
  spentWallet: number;
  /** Tudo que já entrou nas carteiras profissionais (sem Fitcoin). */
  totalEarned: number;
  /** Carteira de indicação (Fitcoin do aluno) — separada, não entra no saldo profissional. */
  fitcoin: { available: number; pending: number; earned: number };
  breakdown: {
    commissions: { available: number; pending: number; releasedTotal: number; earned: number; withdrawn: number };
    creator: { available: number; pending: number; earned: number; withdrawn: number };
    referral: { available: number; pending: number; earned: number };
  };
};

const n = (v: unknown) => Number(v || 0);

function mapStatement(raw: Record<string, any>): WalletStatement {
  const b = raw?.breakdown || {};
  return {
    profileId: String(raw?.profile_id || ""),
    generatedAt: String(raw?.generated_at || new Date().toISOString()),
    available: n(raw?.available),
    availableBeforeAdvance: n(raw?.available_before_advance),
    advanceOpen: n(raw?.advance_open),
    hold: n(raw?.hold),
    networkBlocked: n(raw?.network_blocked),
    pendingTotal: n(raw?.pending_total),
    withdrawOpen: n(raw?.withdraw_open),
    withdrawnPaid: n(raw?.withdrawn_paid),
    spentWallet: n(raw?.spent_wallet),
    totalEarned: n(raw?.total_earned),
    fitcoin: {
      available: n(raw?.fitcoin?.available),
      pending: n(raw?.fitcoin?.pending),
      earned: n(raw?.fitcoin?.earned),
    },
    breakdown: {
      commissions: {
        available: n(b?.commissions?.available),
        pending: n(b?.commissions?.pending),
        releasedTotal: n(b?.commissions?.released_total),
        earned: n(b?.commissions?.earned),
        withdrawn: n(b?.commissions?.withdrawn),
      },
      creator: {
        available: n(b?.creator?.available),
        pending: n(b?.creator?.pending),
        earned: n(b?.creator?.earned),
        withdrawn: n(b?.creator?.withdrawn),
      },
      referral: {
        available: n(b?.referral?.available),
        pending: n(b?.referral?.pending),
        earned: n(b?.referral?.earned),
      },
    },
  };
}


/** Extrato consolidado (fonte única de verdade) para um perfil. Recalcula antes de ler. */
export async function loadWalletStatement(profileId: string): Promise<WalletStatement> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    await supabaseAdmin.rpc("recalc_wallet_for_profile" as never, { _profile_id: profileId } as never);
  } catch (e) {
    console.error("recalc_wallet_for_profile failed", e);
  }
  const { data, error } = await supabaseAdmin.rpc("wallet_statement" as never, { _profile_id: profileId } as never);
  if (error) throw new Error(error.message);
  return mapStatement((data as Record<string, any>) || {});
}

export const getMyWalletStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WalletStatement | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id").eq("user_id", context.userId).maybeSingle();
    if (!profile) return null;
    return loadWalletStatement(profile.id);
  });

export const getWalletStatementFor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profileId: string }) => input)
  .handler(async ({ data, context }): Promise<WalletStatement> => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin" as never, { _user_id: context.userId } as never);
    if (!isAdmin) throw new Error("Acesso restrito ao administrador");
    return loadWalletStatement(data.profileId);
  });

export type WalletKind = "commission" | "partner" | "professional" | "fitcoin" | "nutritionist" | "professor";

export type WalletKindTotals = {
  kind: WalletKind;
  people: number;
  available: number;
  pending: number;
  blocked: number;
  earned: number;
  withdrawn: number;
};

export type WalletPersonRow = {
  profileId: string;
  name: string;
  email: string | null;
  available: number;
  pending: number;
  blocked: number;
  earned: number;
  withdrawn: number;
  advanceOpen: number;
  kinds: Partial<Record<WalletKind, { available: number; pending: number; blocked: number; earned: number; withdrawn: number }>>;
};

export type WalletsOverview = {
  generatedAt: string;
  advancesOpen: number;
  adminWallet: { available: number; earned: number; withdrawn: number };
  totals: WalletKindTotals[];
  people: WalletPersonRow[];
};

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("is_admin" as never, { _user_id: userId } as never);
  if (!isAdmin) throw new Error("Acesso restrito ao administrador");
}

/** Totais por tipo de carteira + detalhamento por pessoa (admin). */
export const getWalletsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WalletsOverview> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("wallets_overview" as never, {} as never);
    if (error) throw new Error(error.message);
    const raw = (data as Record<string, any>) || {};
    return {
      generatedAt: String(raw.generated_at || new Date().toISOString()),
      advancesOpen: n(raw.advances_open),
      adminWallet: {
        available: n(raw?.admin_wallet?.available),
        earned: n(raw?.admin_wallet?.earned),
        withdrawn: n(raw?.admin_wallet?.withdrawn),
      },
      totals: ((raw.totals as any[]) || []).map((t) => ({
        kind: t.kind as WalletKind,
        people: n(t.people),
        available: n(t.available),
        pending: n(t.pending),
        blocked: n(t.blocked),
        earned: n(t.earned),
        withdrawn: n(t.withdrawn),
      })),
      people: ((raw.people as any[]) || []).map((p) => ({
        profileId: String(p.profile_id),
        name: String(p.name || "Sem nome"),
        email: p.email ?? null,
        available: n(p.available),
        pending: n(p.pending),
        blocked: n(p.blocked),
        earned: n(p.earned),
        withdrawn: n(p.withdrawn),
        advanceOpen: n(p.advance_open),
        kinds: (p.kinds || {}) as WalletPersonRow["kinds"],
      })),
    };
  });

export type WalletAdvanceRow = {
  id: string;
  amount: number;
  settledAmount: number;
  reason: string | null;
  createdAt: string;
};

/** Adiantamentos de uma pessoa (admin). */
export const listWalletAdvances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profileId: string }) => input)
  .handler(async ({ data, context }): Promise<WalletAdvanceRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("wallet_advances")
      .select("id, amount, settled_amount, reason, created_at")
      .eq("profile_id", data.profileId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows || []).map((r: any) => ({
      id: r.id,
      amount: n(r.amount),
      settledAmount: n(r.settled_amount),
      reason: r.reason,
      createdAt: r.created_at,
    }));
  });

/** Lança um adiantamento (valor recebido acima do liberado) — desconta do disponível. */
export const createWalletAdvance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profileId: string; amount: number; reason?: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context.supabase, context.userId);
    if (!(data.amount > 0)) throw new Error("Informe um valor maior que zero");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("wallet_advances").insert({
      profile_id: data.profileId,
      amount: data.amount,
      reason: data.reason || null,
      created_by: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Marca um adiantamento como compensado (total ou parcial). */
export const settleWalletAdvance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { advanceId: string; settledAmount?: number }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: readErr } = await supabaseAdmin
      .from("wallet_advances").select("amount").eq("id", data.advanceId).maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Adiantamento não encontrado");
    const settled = data.settledAmount ?? n((row as any).amount);
    const { error } = await supabaseAdmin
      .from("wallet_advances")
      .update({ settled_amount: settled } as never)
      .eq("id", data.advanceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

