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
