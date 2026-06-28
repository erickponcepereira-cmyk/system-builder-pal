import { Crown } from "lucide-react";

/**
 * Badge para sinalizar que uma venda/comissão foi originada por um Master Coach
 * (venda cross-network). Mostra o nome do Master Coach beneficiário quando disponível.
 *
 * Padronizado em todos os portais: Coach, Admin Pagamentos, Carteiras (parceiro,
 * profissional, professor) e Resumo Financeiro.
 */
export function MasterCoachBadge({
  masterCoachName,
  compact = false,
}: {
  masterCoachName?: string | null;
  compact?: boolean;
}) {
  const label = compact
    ? "Master Coach"
    : masterCoachName
    ? `Master Coach · ${masterCoachName}`
    : "Master Coach";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary"
      title={
        masterCoachName
          ? `Venda realizada pelo Master Coach: ${masterCoachName}`
          : "Venda realizada por um Master Coach"
      }
    >
      <Crown className="h-3 w-3" />
      {label}
    </span>
  );
}
