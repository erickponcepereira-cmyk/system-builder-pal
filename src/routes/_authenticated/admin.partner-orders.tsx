import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Stethoscope, CheckCircle2, X, Clock, RotateCcw, ChevronRight } from "lucide-react";
import {
  listPartnerProductOrders,
  updatePartnerProductOrderStatus,
  type PartnerOrderRow,
} from "@/lib/partner-orders.functions";

export const Route = createFileRoute("/_authenticated/admin/partner-orders")({
  head: () => ({ meta: [{ title: "Pedidos de Parceiros — Admin" }] }),
  component: AdminPartnerOrdersPage,
});

type Status = "pending" | "paid" | "cancelled" | "refunded";

const STATUS_META: Record<Status, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Pendente", color: "bg-amber-500/15 text-amber-300", icon: Clock },
  paid: { label: "Pago", color: "bg-emerald-500/15 text-emerald-300", icon: CheckCircle2 },
  cancelled: { label: "Cancelado", color: "bg-red-500/15 text-red-300", icon: X },
  refunded: { label: "Reembolsado", color: "bg-purple-500/15 text-purple-300", icon: RotateCcw },
};

const money = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SPEC: Record<string, string> = {
  personal_trainer: "Personal", nutritionist: "Nutri", doctor: "Médico",
  cardiologist: "Cardio", esthetician: "Esteticista", lawyer: "Advogado", other: "Outro",
};

function AdminPartnerOrdersPage() {
  const fetchList = useServerFn(listPartnerProductOrders);
  const updateStatus = useServerFn(updatePartnerProductOrderStatus);
  const [rows, setRows] = useState<PartnerOrderRow[] | null>(null);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [editing, setEditing] = useState<PartnerOrderRow | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = () =>
    fetchList({ data: { status: filter } })
      .then(setRows)
      .catch((e) => toast.error(e.message || "Erro ao carregar"));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const save = async (s: Status) => {
    if (!editing) return;
    setBusy(true);
    try {
      await updateStatus({ data: { orderId: editing.id, status: s, note } });
      toast.success("Pedido atualizado");
      setEditing(null);
      setNote("");
      reload();
    } catch (e: any) {
      toast.error(e.message || "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-primary" /> Pedidos de Parceiros
        </h1>
        <p className="text-xs text-white/50">
          Pedidos dos produtos de profissionais da saúde aprovados. Ao marcar como pago,
          os splits são creditados automaticamente nas carteiras (sistema, coach, rede, parceiro).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "paid", "cancelled", "refunded"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              filter === s
                ? "bg-primary text-primary-foreground"
                : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {s === "all" ? "Todos" : STATUS_META[s as Status].label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-white/5 p-8 text-center text-sm text-white/50">
          Nenhum pedido neste filtro.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/5">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase text-white/50">
              <tr>
                <th className="p-3 text-left">Pedido</th>
                <th className="p-3 text-left">Aluno</th>
                <th className="p-3 text-left">Produto</th>
                <th className="p-3 text-left">Profissional</th>
                <th className="p-3 text-left">Coach Vendedor</th>
                <th className="p-3 text-right">Bruto</th>
                <th className="p-3 text-right">Parceiro líq.</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Criado</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = STATUS_META[r.status as Status] ?? STATUS_META.pending;
                const Icon = meta.icon;
                return (
                  <tr
                    key={r.id}
                    className="border-t border-white/5 cursor-pointer hover:bg-white/5"
                    onClick={() => { setEditing(r); setNote(""); }}
                  >
                    <td className="p-3 font-mono text-[11px] text-white/60">{r.orderNumber}</td>
                    <td className="p-3 text-white">{r.studentName || "—"}</td>
                    <td className="p-3 text-white/80">{r.productName || "—"}</td>
                    <td className="p-3 text-white/70">
                      {r.professionalName || "—"}
                      {r.specialty && <span className="ml-1 text-[10px] text-white/40">· {SPEC[r.specialty] || r.specialty}</span>}
                    </td>
                    <td className="p-3 text-white/70">{r.sellingCoachName || "—"}</td>
                    <td className="p-3 text-right text-white">{money(r.grossAmount)}</td>
                    <td className="p-3 text-right text-primary font-semibold">{money(r.partnerNet)}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${meta.color}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-white/40">
                      {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="p-3 text-right">
                      <ChevronRight className="inline h-4 w-4 text-white/30" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-2xl space-y-4 rounded-xl border border-white/10 bg-[#0F0F0F] p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-bold text-white">{editing.orderNumber}</h2>
              <p className="text-xs text-white/50">{editing.productName}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <Info label="Aluno" value={editing.studentName} />
              <Info label="Profissional" value={editing.professionalName} />
              <Info label="Coach vendedor" value={editing.sellingCoachName} />
              <Info label="Pagamento" value={editing.paymentMethod.toUpperCase()} />
            </div>

            <div className="rounded-lg border border-white/5 bg-white/5 p-3 space-y-1.5 text-xs">
              <Row label="Bruto" value={money(editing.grossAmount)} />
              <Row label="Taxa do sistema" value={`- ${money(editing.systemFee)}`} muted />
              <Row label="Comissão coach (bruta)" value={`- ${money(editing.coachCommission)}`} muted />
              <div className="pl-3 text-white/40 space-y-1">
                <Row label="↳ Rede L1 (3%)" value={money(editing.networkL1)} muted small />
                <Row label="↳ Rede L2 (2%)" value={money(editing.networkL2)} muted small />
                <Row label="↳ Rede L3 (1%)" value={money(editing.networkL3)} muted small />
                <Row label="↳ Coach líquido" value={money(editing.coachNet)} muted small />
              </div>
              <div className="border-t border-white/10 pt-1.5 flex justify-between font-bold">
                <span className="text-white">Parceiro recebe</span>
                <span className="text-primary">{money(editing.partnerNet)}</span>
              </div>
            </div>

            <div>
              <label className="text-xs text-white/60">Nota (opcional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full rounded bg-white/5 px-3 py-2 text-sm text-white outline-none"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["paid", "cancelled", "refunded", "pending"] as Status[])
                .filter((s) => s !== editing.status)
                .map((s) => {
                  const meta = STATUS_META[s];
                  return (
                    <button
                      key={s}
                      disabled={busy}
                      onClick={() => save(s)}
                      className={`rounded-lg px-3 py-2 text-xs font-medium ${meta.color} hover:opacity-80 disabled:opacity-50`}
                    >
                      Marcar como {meta.label}
                    </button>
                  );
                })}
            </div>
            <button
              onClick={() => setEditing(null)}
              className="w-full rounded bg-white/5 px-3 py-2 text-xs text-white/60"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded bg-white/5 px-2 py-1.5">
      <p className="text-[10px] uppercase text-white/40">{label}</p>
      <p className="text-white">{value || "—"}</p>
    </div>
  );
}

function Row({ label, value, muted, small }: { label: string; value: string; muted?: boolean; small?: boolean }) {
  return (
    <div className={`flex justify-between ${small ? "text-[11px]" : ""}`}>
      <span className={muted ? "text-white/50" : "text-white"}>{label}</span>
      <span className={muted ? "text-white/70" : "text-white"}>{value}</span>
    </div>
  );
}
