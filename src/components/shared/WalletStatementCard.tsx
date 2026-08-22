import type { WalletStatement } from "@/lib/wallet-statement.functions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Extrato consolidado — mesma fonte de verdade (função `wallet_statement`)
 * usada no painel do coach/parceiro/profissional e no admin.
 */
export function WalletStatementCard({
  statement,
  mask,
  title = "Extrato consolidado",
}: {
  statement: WalletStatement | null;
  mask?: (v: number) => string;
  title?: string;
}) {
  if (!statement) return null;
  const fmt = mask ?? brl;
  const rows: Array<{ label: string; value: number; hint?: string; tone?: string }> = [
    { label: "Disponível para saque agora", value: statement.available, tone: "text-success" },
    ...(statement.advanceOpen > 0
      ? [{
          label: "Adiantamento a compensar",
          value: statement.advanceOpen,
          tone: "text-red-400",
          hint: "Valor já pago acima do liberado — desconta do disponível",
        }]
      : []),
    { label: "Em carência (a liberar)", value: statement.hold, tone: "text-amber-400", hint: "Aguardando o prazo de liberação" },
    { label: "Rede bloqueada", value: statement.networkBlocked, tone: "text-amber-400", hint: "Libera ao bater a missão do mês" },
    { label: "Saque solicitado (aguardando pagamento)", value: statement.withdrawOpen, tone: "text-blue-400" },
    { label: "Já pago em saques", value: statement.withdrawnPaid, tone: "text-white/70" },
    { label: "Usado na própria carteira", value: statement.spentWallet, tone: "text-white/70", hint: "Mensalidade e pedidos pagos com saldo" },
    { label: "Total ganho (sem Fitcoin)", value: statement.totalEarned, tone: "text-white" },
  ];

  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
      <h3 className="text-sm font-bold text-white mb-3">{title}</h3>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-3 border-t border-white/5 pt-1.5 first:border-0 first:pt-0">
            <div>
              <p className="text-xs text-white/70">{r.label}</p>
              {r.hint && <p className="text-[10px] text-white/35">{r.hint}</p>}
            </div>
            <span className={`text-sm font-mono font-bold ${r.tone || "text-white"}`}>{fmt(r.value)}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl bg-white/5 p-3">
        <p className="text-[11px] font-bold text-white/70">Carteira de indicação (Fitcoin) — separada</p>
        <p className="text-[10px] text-white/35 mb-1.5">Não entra no saldo de comissões nem no limite de saque.</p>
        <div className="grid grid-cols-3 gap-2 text-[10px] text-white/40">
          <div>Disponível<p className="font-mono text-white/70">{fmt(statement.fitcoin.available)}</p></div>
          <div>Pendente<p className="font-mono text-white/70">{fmt(statement.fitcoin.pending)}</p></div>
          <div>Total ganho<p className="font-mono text-white/70">{fmt(statement.fitcoin.earned)}</p></div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-white/40">
        <div>
          Comissões (rede/vendas)
          <p className="text-white/70 font-mono">{fmt(statement.breakdown.commissions.earned)}</p>
        </div>
        <div>
          Produtos criados
          <p className="text-white/70 font-mono">{fmt(statement.breakdown.creator.earned)}</p>
        </div>
      </div>
    </div>
  );
}

