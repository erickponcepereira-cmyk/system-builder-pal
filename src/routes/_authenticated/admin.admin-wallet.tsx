import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Wallet, TrendingUp, TrendingDown, ShieldCheck, Plus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  getAdminWallet,
  listAdminWalletEntries,
  registerAdminWalletDebit,
  type AdminWalletSummary,
  type AdminWalletEntry,
} from "@/lib/admin-financial.functions";

export const Route = createFileRoute("/_authenticated/admin/admin-wallet")({
  head: () => ({ meta: [{ title: "Carteira do Admin — FitMind Club" }] }),
  component: AdminWalletPage,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function AdminWalletPage() {
  const getWallet = useServerFn(getAdminWallet);
  const listEntries = useServerFn(listAdminWalletEntries);
  const registerDebit = useServerFn(registerAdminWalletDebit);

  const [summary, setSummary] = useState<AdminWalletSummary | null>(null);
  const [entries, setEntries] = useState<AdminWalletEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "credit" | "debit">("all");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, e] = await Promise.all([
        getWallet(),
        listEntries({ data: { filter } }),
      ]);
      setSummary(s);
      setEntries(e);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar carteira");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Carteira do Admin
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Carteira compartilhada das taxas do sistema. Administrada pelos master admins.
          </p>
        </div>
        {summary?.isMaster && (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Registrar saque/baixa
          </button>
        )}
      </div>

      {/* Cards de saldo */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-4 w-4 text-primary" />
            <p className="text-xs text-white/50 uppercase tracking-wider">Disponível</p>
          </div>
          <p className="text-3xl font-bold text-primary font-mono">{brl(summary?.available || 0)}</p>
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-success" />
            <p className="text-xs text-white/50 uppercase tracking-wider">Total recebido</p>
          </div>
          <p className="text-2xl font-bold text-white font-mono">{brl(summary?.totalEarned || 0)}</p>
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-white/40" />
            <p className="text-xs text-white/50 uppercase tracking-wider">Total sacado</p>
          </div>
          <p className="text-2xl font-bold text-white/70 font-mono">{brl(summary?.totalWithdrawn || 0)}</p>
        </div>
      </div>

      {/* Master admins */}
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <p className="text-xs text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" /> Administradores Master
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(summary?.masters || []).map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-white">{m.name}</p>
                <p className="text-xs text-white/40">{m.email}</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/15 px-2 py-1 rounded">
                Master
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Extrato */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="font-bold text-white">Extrato</h2>
          <div className="flex gap-1 rounded-lg bg-white/5 p-1">
            {(["all", "credit", "debit"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs rounded ${
                  filter === f ? "bg-primary text-primary-foreground font-medium" : "text-white/60 hover:text-white"
                }`}
              >
                {f === "all" ? "Todos" : f === "credit" ? "Créditos" : "Débitos"}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-center text-sm text-white/40 py-12">Nenhuma movimentação encontrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-white/40">
                <tr>
                  <th className="text-left px-4 py-3">Data</th>
                  <th className="text-left px-4 py-3">Descrição</th>
                  <th className="text-left px-4 py-3">Aluno</th>
                  <th className="text-left px-4 py-3">Produto</th>
                  <th className="text-right px-4 py-3">Valor</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-white/60 whitespace-nowrap">{fmtDate(e.createdAt)}</td>
                    <td className="px-4 py-3 text-white">{e.description}</td>
                    <td className="px-4 py-3 text-white/60">{e.studentName || "—"}</td>
                    <td className="px-4 py-3 text-white/60">{e.productName || "—"}</td>
                    <td className={`px-4 py-3 text-right font-mono font-medium ${e.kind === "debit" ? "text-red-400" : "text-success"}`}>
                      {e.kind === "debit" ? "-" : "+"}{brl(e.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <DebitModal
          onClose={() => setModalOpen(false)}
          onSubmit={async (amount, description) => {
            try {
              await registerDebit({ data: { amount, description } });
              toast.success("Baixa registrada com sucesso");
              setModalOpen(false);
              await refresh();
            } catch (err: any) {
              toast.error(err?.message || "Erro ao registrar baixa");
            }
          }}
        />
      )}
    </div>
  );
}

function DebitModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (amount: number, description: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount.replace(",", "."));
    if (!n || n <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (!description.trim()) {
      toast.error("Informe uma descrição");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(n, description.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl p-6" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Registrar saque/baixa</h3>
            <p className="text-xs text-white/50 mt-1">Lança um débito na carteira compartilhada.</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-white/60 uppercase tracking-wider">Valor (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-white focus:outline-none focus:border-primary"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-white/60 uppercase tracking-wider">Descrição</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Repasse mensal Erick"
              className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-white focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg bg-white/5 px-4 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar baixa
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
