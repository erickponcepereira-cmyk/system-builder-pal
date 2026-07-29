import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRecurring, enableAutoDebit, cancelMyRecurring, deleteMySavedCard } from "@/lib/recurring.functions";
import { toast } from "sonner";
import { CreditCard, Trash2, Repeat, AlertTriangle } from "lucide-react";

const money = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

const STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  pending: "Aguardando autorização",
  paused: "Pausada",
  past_due: "Em atraso",
  cancelled: "Cancelada",
};

/** Cartões salvos + débito automático da mensalidade. */
export function AutoDebitCard() {
  const list = useServerFn(getMyRecurring);
  const enable = useServerFn(enableAutoDebit);
  const cancel = useServerFn(cancelMyRecurring);
  const removeCard = useServerFn(deleteMySavedCard);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["my-recurring"], queryFn: () => list({}) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-recurring"] });

  const mEnable = useMutation({
    mutationFn: (saved_card_id: string) => enable({ data: { saved_card_id } }),
    onSuccess: () => { toast.success("Débito automático ativado"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Erro ao ativar"),
  });
  const mCancel = useMutation({
    mutationFn: (id: string) => cancel({ data: { id } }),
    onSuccess: () => { toast.success("Assinatura cancelada"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Erro ao cancelar"),
  });
  const mRemove = useMutation({
    mutationFn: (id: string) => removeCard({ data: { id } }),
    onSuccess: () => { toast.success("Cartão removido"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Erro ao remover cartão"),
  });

  if (isLoading) return null;

  const cards = data?.cards || [];
  const subs = (data?.subscriptions || []).filter((s: any) => s.status !== "cancelled");
  const platform = subs.find((s: any) => s.product_kind === "platform_subscription");

  return (
    <div className="rounded-2xl border border-white/10 p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-white/60">
        <Repeat className="h-4 w-4" /> Cobrança automática no cartão
      </h3>

      {!cards.length && (
        <p className="text-sm text-white/50">
          Nenhum cartão salvo ainda. Ao pagar no cartão, marque “Salvar este cartão para cobranças automáticas”
          e ele aparecerá aqui.
        </p>
      )}

      <div className="space-y-2">
        {cards.map((c: any) => (
          <div key={c.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-white/80">
              <CreditCard className="h-4 w-4 text-primary" />
              <span className="uppercase">{c.brand || "cartão"}</span>
              <span>•••• {c.last_four}</span>
              <span className="text-xs text-white/40">{c.expiration_month}/{c.expiration_year}</span>
            </div>
            <div className="flex items-center gap-2">
              {platform?.saved_card_id === c.id ? (
                <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-bold text-green-400">Débito automático</span>
              ) : (
                <button
                  onClick={() => mEnable.mutate(c.id)}
                  className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground"
                >
                  Usar na mensalidade
                </button>
              )}
              <button onClick={() => mRemove.mutate(c.id)} className="rounded-lg bg-white/5 p-1.5 text-white/60 hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {subs.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-bold uppercase text-white/40">Minhas assinaturas</p>
          {subs.map((s: any) => (
            <div key={s.id} className="rounded-xl bg-white/5 px-3 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{s.title}</p>
                  <p className="text-xs text-white/50">
                    {money(s.amount)}/{s.interval_type === "yearly" ? "ano" : "mês"} · próxima: {date(s.next_charge_at)} ·{" "}
                    {STATUS_LABEL[s.status] || s.status}
                  </p>
                </div>
                <button onClick={() => mCancel.mutate(s.id)} className="text-xs font-bold text-destructive hover:underline">
                  Cancelar
                </button>
              </div>
              {s.status === "past_due" && (
                <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" /> Última tentativa recusada: {s.last_failure_reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
