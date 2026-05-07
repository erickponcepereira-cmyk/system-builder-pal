import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Clock, RefreshCw, X, DollarSign, UserRound } from "lucide-react";
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
  holder_name?: string | null;
  holder_cpf?: string | null;
  kind: "coach" | "student";
  owner: { name: string; email: string } | null;
}

interface Transaction {
  id: string;
  gross_amount: number;
  status: string | null;
  purchase_type: string | null;
  payment_method: string;
  created_at: string | null;
  paid_at: string | null;
  metadata: { title?: string } | null;
  students: { profiles: { name: string; email: string } | null } | null;
  products: { name: string } | null;
}

type CoachWithdrawalRow = Omit<Withdrawal, "kind" | "owner"> & { profiles: { name: string; email: string } | null };
type StudentWithdrawalRow = Omit<Withdrawal, "kind" | "owner"> & { students: { profiles: { name: string; email: string } | null } | null };

interface MpPayment {
  id: string;
  mp_payment_id: string;
  source_kind: string;
  amount: number;
  status: string;
  payment_method: string;
  payer_email: string | null;
  payer_name: string | null;
  paid_at: string | null;
  created_at: string;
}

function AdminPayments() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [mpPayments, setMpPayments] = useState<MpPayment[]>([]);
  const [activeTab, setActiveTab] = useState<"orders" | "withdrawals" | "mp">("orders");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [coachWithdrawalRes, studentWithdrawalRes, transactionRes, mpRes] = await Promise.all([
      supabase
        .from("withdrawal_requests")
        .select("*, profiles!withdrawal_requests_profile_id_fkey(name, email)")
        .order("requested_at", { ascending: false }),
      supabase
        .from("student_withdrawal_requests")
        .select("*, students!student_withdrawal_requests_student_id_fkey(profiles!students_profile_id_fkey(name,email))")
        .order("requested_at", { ascending: false }),
      supabase
        .from("transactions")
        .select("id,gross_amount,status,purchase_type,payment_method,created_at,paid_at,metadata,students!transactions_student_id_fkey(profiles!students_profile_id_fkey(name,email)),products!transactions_product_id_fkey(name)")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("mercadopago_payments" as never)
        .select("id,mp_payment_id,source_kind,amount,status,payment_method,payer_email,payer_name,paid_at,created_at" as never)
        .order("created_at" as never, { ascending: false })
        .limit(200),
    ]);
    const coachWithdrawals = ((coachWithdrawalRes.data as unknown as CoachWithdrawalRow[]) || []).map((w) => ({ ...w, kind: "coach", owner: w.profiles })) as Withdrawal[];
    const studentWithdrawals = ((studentWithdrawalRes.data as unknown as StudentWithdrawalRow[]) || []).map((w) => ({ ...w, kind: "student", owner: w.students?.profiles || null })) as Withdrawal[];
    setWithdrawals([...coachWithdrawals, ...studentWithdrawals].sort((a, b) => new Date(b.requested_at || 0).getTime() - new Date(a.requested_at || 0).getTime()));
    setTransactions((transactionRes.data as unknown as Transaction[]) || []);
    setMpPayments((mpRes.data as unknown as MpPayment[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (withdrawal: Withdrawal, status: "approved" | "paid" | "rejected") => {
    const fn = withdrawal.kind === "student" ? "update_student_withdrawal_status" : "update_coach_withdrawal_status";
    const { error } = await supabase.rpc(fn as never, { _withdrawal_id: withdrawal.id, _status: status, _notes: null } as never);
    if (error) toast.error("Erro");
    else { toast.success("Atualizado"); load(); }
  };

  const confirmTransaction = async (id: string) => {
    const { error } = await supabase
      .from("transactions")
      .update({ status: "paid", paid_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Pagamento confirmado e comissões geradas"); load(); }
  };

  const cancelTransaction = async (id: string) => {
    const { error } = await supabase.from("transactions").update({ status: "failed" } as never).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Pedido cancelado"); load(); }
  };

  const releaseCommissions = async () => {
    const { data, error } = await supabase.rpc("release_available_commissions" as never);
    if (error) toast.error(error.message);
    else { toast.success(`${data || 0} comissão(ões) liberada(s)`); load(); }
  };

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const statusColor = (s: string | null) => {
    if (s === "paid") return "bg-success/20 text-success";
    if (s === "approved") return "bg-blue-500/20 text-blue-400";
    if (s === "rejected") return "bg-destructive/20 text-destructive";
    return "bg-red-500/20 text-red-400";
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Pagamentos</h1>
          <p className="text-sm text-white/50">Pedidos, confirmações e solicitações de saque</p>
        </div>
        <button onClick={releaseCommissions} className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          <RefreshCw className="h-4 w-4" /> Liberar comissões vencidas
        </button>
      </div>

      <div className="mb-4 flex gap-1 rounded-xl bg-card p-1">
        <button onClick={() => setActiveTab("orders")} className={`flex-1 rounded-lg px-4 py-2 text-xs font-bold ${activeTab === "orders" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
          Pedidos ({transactions.length})
        </button>
        <button onClick={() => setActiveTab("mp")} className={`flex-1 rounded-lg px-4 py-2 text-xs font-bold ${activeTab === "mp" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
          Mercado Pago ({mpPayments.length})
        </button>
        <button onClick={() => setActiveTab("withdrawals")} className={`flex-1 rounded-lg px-4 py-2 text-xs font-bold ${activeTab === "withdrawals" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
          Saques ({withdrawals.length})
        </button>
      </div>

      {loading ? (
        <p className="text-white/50">Carregando...</p>
      ) : activeTab === "orders" ? (
        transactions.length === 0 ? (
          <div className="rounded-2xl bg-card p-12 text-center">
            <DollarSign className="h-10 w-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/50">Nenhum pedido registrado ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((t) => (
              <div key={t.id} className="rounded-2xl border border-white/5 bg-card p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-white">{t.metadata?.title || t.products?.name || "Pedido FitMind"}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusColor(t.status)}`}>{t.status}</span>
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/50">{t.purchase_type || "challenge"}</span>
                    </div>
                    <div className="space-y-0.5 text-xs text-white/60">
                      <div>{t.students?.profiles?.name || "Aluno"} · {t.students?.profiles?.email || "—"}</div>
                      <div>{t.payment_method} · criado em {t.created_at ? new Date(t.created_at).toLocaleDateString("pt-BR") : "—"}</div>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-primary">{fmt(t.gross_amount)}</p>
                  {t.status === "pending" && (
                    <div className="flex gap-2">
                      <button onClick={() => confirmTransaction(t.id)} className="flex items-center gap-1 rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white">
                        <Check className="h-3 w-3" /> Confirmar
                      </button>
                      <button onClick={() => cancelTransaction(t.id)} className="flex items-center gap-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-white">
                        <X className="h-3 w-3" /> Cancelar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : activeTab === "mp" ? (
        (() => {
          const approved = mpPayments.filter((p) => p.status === "approved");
          const totalApproved = approved.reduce((s, p) => s + Number(p.amount || 0), 0);
          const pending = mpPayments.filter((p) => p.status === "pending").length;
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-card p-4">
                  <p className="text-xs text-white/50">Total arrecadado</p>
                  <p className="mt-1 text-2xl font-bold text-primary">{fmt(totalApproved)}</p>
                </div>
                <div className="rounded-2xl bg-card p-4">
                  <p className="text-xs text-white/50">Vendas aprovadas</p>
                  <p className="mt-1 text-2xl font-bold text-white">{approved.length}</p>
                </div>
                <div className="rounded-2xl bg-card p-4">
                  <p className="text-xs text-white/50">Pendentes</p>
                  <p className="mt-1 text-2xl font-bold text-white">{pending}</p>
                </div>
              </div>
              {mpPayments.length === 0 ? (
                <div className="rounded-2xl bg-card p-12 text-center">
                  <DollarSign className="h-10 w-10 text-white/20 mx-auto mb-3" />
                  <p className="text-white/50">Nenhum pagamento Mercado Pago ainda.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {mpPayments.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-white/5 bg-card p-4">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                        <div className="flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-white">{p.payer_name || p.payer_email || "Pagador"}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusColor(p.status)}`}>{p.status}</span>
                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/50">{p.payment_method}</span>
                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/50">{p.source_kind}</span>
                          </div>
                          <div className="text-xs text-white/60">
                            MP #{p.mp_payment_id} · {new Date(p.created_at).toLocaleString("pt-BR")}
                            {p.paid_at && ` · pago em ${new Date(p.paid_at).toLocaleString("pt-BR")}`}
                          </div>
                        </div>
                        <p className="text-xl font-bold text-primary">{fmt(Number(p.amount))}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()
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
                    <h3 className="text-base font-bold text-white">{w.owner?.name || w.holder_name || "Solicitante"}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusColor(w.status)}`}>
                      {w.status}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase text-white/45">
                      <UserRound className="h-3 w-3" /> {w.kind === "student" ? "aluno" : "coach"}
                    </span>
                  </div>
                  <div className="text-xs text-white/60 space-y-0.5">
                    <div>{w.owner?.email || "—"}</div>
                    {w.holder_cpf && <div>Titular: {w.holder_name || "—"} · CPF {w.holder_cpf}</div>}
                    {w.pix_key && <div>PIX ({w.pix_key_type}): {w.pix_key}</div>}
                    {w.requested_at && <div>Solicitado em {new Date(w.requested_at).toLocaleDateString("pt-BR")}</div>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">{fmt(w.amount)}</p>
                </div>
                {w.status === "requested" && (
                  <div className="flex gap-2">
                    <button onClick={() => updateStatus(w, "approved")} className="flex items-center gap-1 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-bold text-white">
                      <Clock className="h-3 w-3" /> Aprovar
                    </button>
                    <button onClick={() => updateStatus(w, "rejected")} className="flex items-center gap-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-white">
                      <X className="h-3 w-3" /> Rejeitar
                    </button>
                  </div>
                )}
                {w.status === "approved" && (
                  <button onClick={() => updateStatus(w, "paid")} className="flex items-center gap-1 rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white">
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
