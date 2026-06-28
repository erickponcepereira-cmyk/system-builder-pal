import { Loader2 } from "lucide-react";
import type { CreatorEntryRow } from "@/lib/creator-wallets.functions";
import { SaleChannelBadge } from "@/components/ui/SaleChannelBadge";

const money = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CreatorEntriesSection({
  entries,
  ownerLabel,
}: {
  entries: CreatorEntryRow[] | null;
  ownerLabel: string;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-white/80">Lançamentos</h2>
      {entries === null ? (
        <div className="flex justify-center p-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-white/5 p-6 text-center text-sm text-white/50">
          Sem lançamentos.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/5">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase text-white/50">
              <tr>
                <th className="p-3 text-left">{ownerLabel}</th>
                <th className="p-3 text-left">Aluno</th>
                <th className="p-3 text-left">Produto</th>
                <th className="p-3 text-left">Canal</th>
                <th className="p-3 text-right">Bruto</th>
                <th className="p-3 text-right">Líquido</th>
                <th className="p-3 text-left">Pago em</th>
                <th className="p-3 text-left">Pedido</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-white/5">
                  <td className="p-3 text-white">{e.owner_name}</td>
                  <td className="p-3 text-white/80">{e.student_name || "—"}</td>
                  <td className="p-3 text-white/80">{e.product_name || "—"}</td>
                  <td className="p-3"><SaleChannelBadge channel={e.sale_channel} compact /></td>
                  <td className="p-3 text-right text-white/60">{money(e.gross_amount)}</td>
                  <td className="p-3 text-right text-emerald-300">{money(e.net_amount)}</td>
                  <td className="p-3 text-xs text-white/50">
                    {new Date(e.paid_at || e.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="p-3 text-[11px] text-white/40">{e.order_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
