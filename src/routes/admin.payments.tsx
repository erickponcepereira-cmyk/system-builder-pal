import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Clock, X, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/payments")({
  component: AdminPayments,
});

interface Withdrawal {
  id: string;
  amount: number;
  status: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  requested_at: string | null;
  profiles: { name: string; email: string } | null;
}

function AdminPayments() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("withdrawal_requests")
      .select("*, profiles!withdrawal_requests_profile_id_fkey(name, email)")
      .order("requested_at", { ascending: false });
    setWithdrawals((data as unknown as Withdrawal[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: "approved" | "paid" | "rejected") => {
    const updates: Record<string, unknown> = { status };
    if (status === "approved") updates.approved_at = new Date().toISOString();
    if (status === "paid") updates.paid_at = new Date().toISOString();
    const { error } = await supabase.from("withdrawal_requests").update(updates).eq("id", id);
    if (error) toast.error("Erro");
    else { toast.success("Atualizado"); load(); }
  };

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const statusColor = (s: string | null) => {
    if (s === "paid") return "bg-success/20 text-success";
    if (s === "approved") return "bg-blue-500/20 text-blue-400";
    if (s === "rejected") return "bg-destructive/20 text-destructive";
    return "bg-orange-500/20 text-orange-400";
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Pagamentos</h1>
        <p className="text-sm text-white/50">Solicitações de saque dos coaches</p>
      </div>

      {loading ? (
        <p className="text-white/50">Carregando...</p>
      ) : withdrawals.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <DollarSign className="h-10 w-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/50">Nenhum saque solicitado ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {withdrawals.map((w) => (
            <div key={w.id} className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-base font-bold text-white">{w.profiles?.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusColor(w.status)}`}>
                      {w.status}
                    </span>
                  </div>
                  <div className="text-xs text-white/60 space-y-0.5">
                    <div>{w.profiles?.email}</div>
                    {w.pix_key && <div>PIX ({w.pix_key_type}): {w.pix_key}</div>}
                    {w.requested_at && <div>Solicitado em {new Date(w.requested_at).toLocaleDateString("pt-BR")}</div>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">{fmt(w.amount)}</p>
                </div>
                {w.status === "requested" && (
                  <div className="flex gap-2">
                    <button onClick={() => updateStatus(w.id, "approved")} className="flex items-center gap-1 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-bold text-white">
                      <Clock className="h-3 w-3" /> Aprovar
                    </button>
                    <button onClick={() => updateStatus(w.id, "rejected")} className="flex items-center gap-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-white">
                      <X className="h-3 w-3" /> Rejeitar
                    </button>
                  </div>
                )}
                {w.status === "approved" && (
                  <button onClick={() => updateStatus(w.id, "paid")} className="flex items-center gap-1 rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white">
                    <Check className="h-3 w-3" /> Marcar como pago
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
