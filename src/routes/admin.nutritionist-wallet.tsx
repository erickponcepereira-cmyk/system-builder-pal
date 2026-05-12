import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Lock, Unlock, X, Wallet } from "lucide-react";
import {
  listNutritionistWallets,
  listNutritionistBlockedEntries,
  releaseNutritionistEntry,
  cancelNutritionistEntry,
  type NutritionistWalletRow,
  type NutriBlockedEntry,
} from "@/lib/nutritionist.functions";

export const Route = createFileRoute("/admin/nutritionist-wallet")({
  head: () => ({ meta: [{ title: "Carteira da Nutricionista — Admin" }] }),
  component: NutriWalletPage,
});

const money = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function NutriWalletPage() {
  const fetchWallets = useServerFn(listNutritionistWallets);
  const fetchEntries = useServerFn(listNutritionistBlockedEntries);
  const releaseFn = useServerFn(releaseNutritionistEntry);
  const cancelFn = useServerFn(cancelNutritionistEntry);

  const [wallets, setWallets] = useState<NutritionistWalletRow[] | null>(null);
  const [entries, setEntries] = useState<NutriBlockedEntry[] | null>(null);
  const [filter, setFilter] = useState<"blocked" | "released" | "cancelled" | "all">("blocked");
  const [busy, setBusy] = useState<string | null>(null);

  const reload = () => {
    fetchWallets().then(setWallets).catch(() => toast.error("Erro ao carregar carteiras"));
    fetchEntries({ data: { status: filter } })
      .then(setEntries)
      .catch(() => toast.error("Erro ao carregar lançamentos"));
  };

  useEffect(() => {
    reload();
  }, [filter]);

  const release = async (e: NutriBlockedEntry) => {
    if (!confirm(`Liberar ${money(e.amount)} para ${e.profile_name}?\n\nIsso marca a entrega do protocolo/dieta como concluída e move o valor para o saldo disponível.`))
      return;
    setBusy(e.id);
    try {
      await releaseFn({ data: { entryId: e.id } });
      toast.success("Valor liberado");
      reload();
    } catch (err: any) {
      toast.error(err.message || "Erro");
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (e: NutriBlockedEntry) => {
    const reason = prompt("Motivo do cancelamento (opcional):", "");
    if (reason === null) return;
    setBusy(e.id);
    try {
      await cancelFn({ data: { entryId: e.id, notes: reason || undefined } });
      toast.success("Lançamento cancelado");
      reload();
    } catch (err: any) {
      toast.error(err.message || "Erro");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Carteira da Nutricionista</h1>
        <p className="text-xs text-white/50">
          Valores ficam <strong>bloqueados</strong> até a confirmação de entrega do protocolo/dieta. Após liberar, vai
          para o saldo disponível para saque.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-white/80">Carteiras</h2>
        {wallets === null ? (
          <div className="flex justify-center p-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : wallets.length === 0 ? (
          <div className="rounded-lg border border-white/5 bg-white/5 p-6 text-center text-sm text-white/50">
            Nenhuma nutricionista com carteira ainda.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {wallets.map((w) => (
              <div key={w.profile_id} className="rounded-lg border border-white/5 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Wallet className="h-4 w-4 text-primary" />
                  {w.name}
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-emerald-300/80">Disponível</span>
                    <span className="text-white">{money(w.available_balance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-300/80">Bloqueado</span>
                    <span className="text-white">{money(w.blocked_balance)}</span>
                  </div>
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

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold text-white/80">Lançamentos</h2>
          {(["blocked", "released", "cancelled", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded px-3 py-1 text-xs ${
                filter === s ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              {s === "all" ? "Todos" : s === "blocked" ? "Bloqueados" : s === "released" ? "Liberados" : "Cancelados"}
            </button>
          ))}
        </div>
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
                  <th className="p-3 text-left">Nutricionista</th>
                  <th className="p-3 text-left">Aluno</th>
                  <th className="p-3 text-left">Produto / Slot</th>
                  <th className="p-3 text-right">Valor</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Criado</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-white/5">
                    <td className="p-3 text-white">{e.profile_name}</td>
                    <td className="p-3 text-white/80">{e.student_name || "—"}</td>
                    <td className="p-3 text-white/60">
                      {e.product_name || "—"}
                      <div className="text-[10px] text-white/40">{e.slot_label || ""}</div>
                    </td>
                    <td className="p-3 text-right text-white">{money(e.amount)}</td>
                    <td className="p-3">
                      {e.status === "blocked" ? (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
                          <Lock className="h-3 w-3" /> Bloqueado
                        </span>
                      ) : e.status === "released" ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                          <Unlock className="h-3 w-3" /> Liberado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
                          <X className="h-3 w-3" /> Cancelado
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-white/40">
                      {new Date(e.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="p-3 text-right">
                      {e.status === "blocked" && (
                        <div className="flex justify-end gap-1">
                          <button
                            disabled={busy === e.id}
                            onClick={() => release(e)}
                            className="rounded bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                          >
                            Liberar
                          </button>
                          <button
                            disabled={busy === e.id}
                            onClick={() => cancel(e)}
                            className="rounded bg-red-500/15 px-2 py-1 text-xs text-red-300 hover:bg-red-500/25 disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
