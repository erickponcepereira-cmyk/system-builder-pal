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
  const s = statement.sources;
  const rows: Array<{ label: string; value: number; hint?: string; tone?: string; subs?: Array<{ label: string; value: number }> }> = [
    {
      label: "Disponível para saque agora",
      value: statement.available,
      tone: "text-success",
      hint: "Saque feito pelo perfil de coach — reúne coach, parceiro e profissional",
      subs: [
        { label: "Coach (comissões)", value: s.coach.available },
        { label: "Parceiro (produtos/serviços)", value: s.partner.available },
        { label: "Profissional", value: s.professional.available },
      ],
    },
    ...(statement.overpaid > 0
      ? [{
          label: "Já pago acima do liberado (a compensar)",
          value: statement.overpaid,
          tone: "text-red-400",
          hint: "Saques pagos além do que já tinha sido liberado — abate das próximas liberações",
        }]
      : []),
    ...(statement.advanceOpen > 0
      ? [{
          label: "Adiantamento em aberto",
          value: statement.advanceOpen,
          tone: "text-red-400",
          hint: `Lançamento manual — desconta do disponível. Já quitado ${fmt(statement.advanceSettled)} de ${fmt(statement.advanceTotal)}`,
        }]
      : []),
    {
      label: "A liberar (carência)",
      value: statement.hold,
      tone: "text-amber-400",
      hint: "Aguardando o prazo de liberação — não inclui rede bloqueada",
      subs: [
        { label: "Venda direta / produtos", value: statement.holdDirect },
        { label: "Rede (ainda em carência)", value: statement.holdNetwork },
      ],
    },
    { label: "Rede bloqueada", value: statement.networkBlocked, tone: "text-amber-400", hint: "Prazo já venceu, mas só libera ao bater a missão do mês" },
    { label: "Pendente total", value: statement.pendingTotal, tone: "text-white/70", hint: "A liberar + rede bloqueada" },

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
          <div key={r.label} className="border-t border-white/5 pt-1.5 first:border-0 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-white/70">{r.label}</p>
                {r.hint && <p className="text-[10px] text-white/35">{r.hint}</p>}
              </div>
              <span className={`text-sm font-mono font-bold ${r.tone || "text-white"}`}>{fmt(r.value)}</span>
            </div>
            {r.subs && r.subs.some((x) => x.value > 0) && (
              <div className="mt-1 ml-2 space-y-0.5">
                {r.subs.filter((x) => x.value > 0).map((x) => (
                  <div key={x.label} className="flex items-center justify-between gap-3">
                    <p className="text-[10px] text-white/35">└ {x.label}</p>
                    <span className="text-[10px] font-mono text-white/50">{fmt(x.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {statement.networkByMonth.length > 0 && (
        <div className="mt-3 rounded-xl bg-white/5 p-3">
          <p className="text-[11px] font-bold text-white/70">Rede por mês</p>
          <p className="text-[10px] text-white/35 mb-1.5">Rede só vira disponível quando a meta do mês é batida.</p>
          <div className="space-y-1">
            {statement.networkByMonth.map((m) => (
              <div key={m.period} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="text-white/60">
                  {m.period}{" "}
                  <span className={m.goalMet ? "text-emerald-400" : "text-amber-400"}>
                    {m.goalMet ? "meta batida" : "meta não batida"}
                  </span>
                </span>
                <span className="font-mono text-white/70">
                  liberado {fmt(m.released)} · carência {fmt(m.hold)} · bloqueado {fmt(m.blocked)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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

