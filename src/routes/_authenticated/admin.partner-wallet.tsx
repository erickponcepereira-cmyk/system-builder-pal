import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";
import {
  listPartnerCreatorWallets,
  listPartnerCreatorEntries,
  type CreatorWalletRow,
  type CreatorEntryRow,
} from "@/lib/creator-wallets.functions";

export const Route = createFileRoute("/_authenticated/admin/partner-wallet")({
  head: () => ({ meta: [{ title: "Carteira do Parceiro — Admin" }] }),
  component: PartnerWalletPage,
});

const money = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function PartnerWalletPage() {
  const fetchWallets = useServerFn(listPartnerCreatorWallets);
  const fetchEntries = useServerFn(listPartnerCreatorEntries);
  const [wallets, setWallets] = useState<CreatorWalletRow[] | null>(null);
  const [entries, setEntries] = useState<CreatorEntryRow[] | null>(null);

  useEffect(() => {
    fetchWallets().then(setWallets).catch(() => toast.error("Erro ao carregar carteiras"));
    fetchEntries().then(setEntries).catch(() => toast.error("Erro ao carregar lançamentos"));
  }, []);

  const totals = (wallets || []).reduce(
    (a, w) => ({
      available: a.available + w.available_balance,
      pending: a.pending + w.pending_balance,
      earned: a.earned + w.total_earned,
      withdrawn: a.withdrawn + w.total_withdrawn,
    }),
    { available: 0, pending: 0, earned: 0, withdrawn: 0 },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Carteira do Parceiro</h1>
        <p className="text-xs text-white/50">
          Saldos dos parceiros como <strong>criadores de produto</strong>. Valor sai do{" "}
          <em>partner_net_amount</em> de cada venda paga, com carência de 7 dias. Em Modo de Testes, somente
          vendas posteriores ao marco aparecem.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Disponível" value={money(totals.available)} tone="emerald" />
        <Kpi label="Bloqueado (7d)" value={money(totals.pending)} tone="amber" />
        <Kpi label="Total ganho" value={money(totals.earned)} />
        <Kpi label="Total sacado" value={money(totals.withdrawn)} />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-white/80">Carteiras</h2>
        {wallets === null ? (
          <div className="flex justify-center p-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : wallets.length === 0 ? (
          <div className="rounded-lg border border-white/5 bg-white/5 p-6 text-center text-sm text-white/50">
            Nenhuma carteira de parceiro com saldo.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {wallets.map((w) => (
              <div key={w.id} className="rounded-lg border border-white/5 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Wallet className="h-4 w-4 text-primary" />
                  {w.name}
                </div>
                {w.email && <div className="text-[10px] text-white/40">{w.email}</div>}
                <div className="mt-3 space-y-1 text-xs">
                  <Row label="Disponível" value={money(w.available_balance)} tone="emerald" />
                  <Row label="Bloqueado" value={money(w.pending_balance)} tone="amber" />
                  <div className="flex justify-between border-t border-white/5 pt-1 text-white/50">
                    <span>Total ganho</span>
                    <span>{money(w.total_earned)}</span>
                  </div>
                  <div className="flex justify-between text-white/50">
                    <span>Total sacado</span>
                    <span>{money(w.total_withdrawn)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <EntriesSection entries={entries} ownerLabel="Parceiro" />
    </div>
  );
}

export function EntriesSection({
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

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" }) {
  const color = tone === "emerald" ? "text-emerald-300" : tone === "amber" ? "text-amber-300" : "text-white";
  return (
    <div className="rounded-lg border border-white/5 bg-white/5 p-3">
      <div className="text-[10px] uppercase text-white/40">{label}</div>
      <div className={`mt-1 text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: "emerald" | "amber" }) {
  const color = tone === "emerald" ? "text-emerald-300/80" : "text-amber-300/80";
  return (
    <div className="flex justify-between">
      <span className={color}>{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}
