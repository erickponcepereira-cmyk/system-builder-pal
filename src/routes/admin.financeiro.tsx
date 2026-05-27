import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Wallet, Network, Stethoscope, Shield, Package, ArrowRight, X, Receipt, CreditCard, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  getAdminFinancialOverview,
  listPayoutHistory,
  listBucketCommissions,
  getFeesAndTaxesBreakdown,
  listPendingSystemFees,
  payManualSystemFee,
  payRecipientAvailable,
  type AdminFinancialOverview,
  type PayoutHistoryItem,
  type RecipientTotal,
  type BucketKind,
  type BucketCommissionRow,
  type FeesAndTaxesOverview,
  type PendingFeeRow,
} from "@/lib/admin-financial.functions";

export const Route = createFileRoute("/admin/financeiro")({ component: AdminFinanceiro });

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function AdminFinanceiro() {
  const navigate = useNavigate();
  const fetchOverview = useServerFn(getAdminFinancialOverview);
  const fetchHistory = useServerFn(listPayoutHistory);
  const fetchBucket = useServerFn(listBucketCommissions);
  const fetchFees = useServerFn(getFeesAndTaxesBreakdown);
  const fetchPendingFees = useServerFn(listPendingSystemFees);
  const callPayFee = useServerFn(payManualSystemFee);
  const callPayRecipient = useServerFn(payRecipientAvailable);

  const [data, setData] = useState<AdminFinancialOverview | null>(null);
  const [history, setHistory] = useState<PayoutHistoryItem[]>([]);
  const [fees, setFees] = useState<FeesAndTaxesOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const [bucketOpen, setBucketOpen] = useState<{ kind: BucketKind; title: string } | null>(null);
  const [bucketRows, setBucketRows] = useState<BucketCommissionRow[] | null>(null);
  const [feesOpen, setFeesOpen] = useState<"tax" | "payment_fee" | null>(null);
  const [feesRows, setFeesRows] = useState<PendingFeeRow[] | null>(null);

  const reload = () => {
    Promise.all([fetchOverview(), fetchHistory(), fetchFees()])
      .then(([ov, hi, fe]) => { setData(ov); setHistory(hi); setFees(fe); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const openBucket = (kind: BucketKind, title: string) => {
    setBucketOpen({ kind, title });
    setBucketRows(null);
    fetchBucket({ data: { bucket: kind } })
      .then(setBucketRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"));
  };

  const openFees = (kind: "tax" | "payment_fee") => {
    setFeesOpen(kind);
    setFeesRows(null);
    fetchPendingFees().then(setFeesRows).catch((e) => toast.error(e instanceof Error ? e.message : "Erro"));
  };

  const handlePayFee = async (transactionId: string, kind: "tax" | "payment_fee") => {
    try {
      await callPayFee({ data: { transactionId, kind } });
      toast.success("Baixa registrada");
      fetchPendingFees().then(setFeesRows);
      fetchFees().then(setFees);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao dar baixa");
    }
  };

  const handlePayRecipient = async (
    profileId: string,
    kind: "coach" | "network" | "nutritionist" | "system",
    name: string,
  ) => {
    if (!confirm(`Dar baixa do saldo disponível de ${name}?`)) return;
    try {
      const r = await callPayRecipient({ data: { profileId, kind } });
      if (r.amount > 0) toast.success(`Baixa de ${money(r.amount)} registrada`);
      else toast.info("Nada disponível para pagar");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };


  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Financeiro</h1>
        <p className="text-sm text-white/50">
          Visão consolidada do que precisa ser pago e do que já foi pago. Cada bucket é independente — carteiras nunca se misturam.
          Clique em um bucket para ver as vendas que originaram os valores.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4 mb-6">
        <BucketCard
          title="Coaches a pagar"
          subtitle="Comissões diretas dos vendedores"
          icon={Wallet}
          pending={data.coaches.pending}
          available={data.coaches.available}
          paid={data.coaches.paid}
          accent="#E24B4A"
          onClick={() => openBucket("coaches", "Coaches a pagar")}
        />
        <BucketCard
          title="Rede (uplines)"
          subtitle="Comissões de níveis 1/2/3 — pagas como coach"
          icon={Network}
          pending={data.network.pending}
          available={data.network.available}
          paid={data.network.paid}
          accent="#F09595"
          onClick={() => openBucket("network", "Rede (uplines) a pagar")}
        />
        <BucketCard
          title="Nutricionistas"
          subtitle="Saldo bloqueado/liberado dos nutris"
          icon={Stethoscope}
          pending={data.nutritionists.pending}
          available={data.nutritionists.available}
          paid={data.nutritionists.paid}
          accent="#A78BFA"
          onClick={() => navigate({ to: "/admin/nutritionist-wallet" })}
        />
        <BucketCard
          title="Sistema (Admin)"
          subtitle="Taxas do sistema — abre o relatório de vendas"
          icon={Shield}
          pending={data.system.pending}
          available={data.system.available}
          paid={data.system.paid}
          accent="#888780"
          onClick={() => openBucket("system", "Sistema")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <section className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-white">Custos de produtos (pool)</h2>
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <Stat label="Pendente" value={money(data.productCosts.pending)} />
            <Stat label="Em preparo" value={money(data.productCosts.preparing)} />
            <Stat label="Enviado" value={money(data.productCosts.shipped)} />
            <Stat label="Entregue" value={money(data.productCosts.delivered)} />
            <Stat label="Cancelado" value={money(data.productCosts.cancelled)} />
            <Stat label="Total" value={money(data.productCosts.total)} highlight />
          </div>
          <Link to="/admin/product-orders" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
            Abrir painel de pedidos <ArrowRight className="h-3 w-3" />
          </Link>
        </section>

        <section className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-white">Atalhos de pagamento</h2>
          </div>
          <div className="space-y-2 text-sm">
            <ShortcutLink to="/admin/payments" label="Solicitações de saque (coaches + alunos)" />
            <ShortcutLink to="/admin/nutritionist-wallet" label="Carteira do nutricionista" />
            <ShortcutLink to="/admin/product-orders" label="Painel de pedidos / custos" />
          </div>
        </section>
      </div>

      {fees && (
        <section className="rounded-2xl border border-white/5 p-5 mb-6" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-white">Impostos & Taxas</h2>
              <p className="text-xs text-white/50">
                Cartão é abatido automaticamente na liquidação. PIX/Boleto entram em "Pendente manual" — clique para dar baixa por transação.
              </p>
            </div>
            <Receipt className="h-5 w-5 text-primary" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FeeBlock
              title="Imposto (Simples Nacional)"
              icon={Receipt}
              total={fees.tax.total}
              autoCard={fees.tax.autoPaidCard}
              manualPaid={fees.tax.manualPaid}
              manualPending={fees.tax.manualPending}
              onOpen={() => openFees("tax")}
            />
            <FeeBlock
              title="Taxa de pagamento (gateway)"
              icon={CreditCard}
              total={fees.paymentFee.total}
              autoCard={fees.paymentFee.autoPaidCard}
              manualPaid={fees.paymentFee.manualPaid}
              manualPending={fees.paymentFee.manualPending}
              onOpen={() => openFees("payment_fee")}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
            <Stat label="Vendas Cartão" value={money(fees.sales.card)} />
            <Stat label="Vendas PIX" value={money(fees.sales.pix)} />
            <Stat label="Vendas Boleto" value={money(fees.sales.boleto)} />
            <Stat label="Vendas Outros" value={money(fees.sales.other)} />
          </div>
        </section>
      )}

      <RecipientsTable title="Coaches — saldos por destinatário" rows={data.coaches.recipients} kind="coach" onPay={handlePayRecipient} />
      <RecipientsTable title="Rede (uplines) — saldos por destinatário" rows={data.network.recipients} kind="network" onPay={handlePayRecipient} />
      <RecipientsTable title="Sistema (Admin) — taxas acumuladas" rows={data.system.recipients} kind="system" onPay={handlePayRecipient} />
      <RecipientsTable title="Nutricionistas — saldos por destinatário" rows={data.nutritionists.recipients} kind="nutritionist" onPay={handlePayRecipient} />

      <section className="rounded-2xl border border-white/5 p-5 mt-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h2 className="mb-3 font-bold text-white">Histórico de pagamentos</h2>
        {history.length === 0 ? (
          <p className="text-sm text-white/40">Nenhum pagamento registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-white/40">
                <tr>
                  <th className="px-2 py-1 text-left">Data</th>
                  <th className="px-2 py-1 text-left">Tipo</th>
                  <th className="px-2 py-1 text-left">Destinatário</th>
                  <th className="px-2 py-1 text-right">Valor</th>
                  <th className="px-2 py-1 text-left">Status</th>
                  <th className="px-2 py-1 text-left">Pago em</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 100).map((h) => (
                  <tr key={`${h.kind}-${h.id}`} className="border-t border-white/5">
                    <td className="px-2 py-1.5 text-white/70">{h.requestedAt ? new Date(h.requestedAt).toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="px-2 py-1.5 text-white/60">{h.kind === "coach" ? "Coach" : h.kind === "student" ? "Aluno" : "Nutri"}</td>
                    <td className="px-2 py-1.5 text-white">{h.name}<span className="text-white/30 ml-1">{h.email}</span></td>
                    <td className="px-2 py-1.5 text-right font-bold text-primary">{money(h.amount)}</td>
                    <td className="px-2 py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        h.status === "paid" ? "bg-emerald-500/15 text-emerald-300" :
                        h.status === "rejected" ? "bg-red-500/15 text-red-300" :
                        h.status === "approved" || h.status === "processing" ? "bg-sky-500/15 text-sky-300" :
                        "bg-amber-500/15 text-amber-300"
                      }`}>{h.status}</span>
                    </td>
                    <td className="px-2 py-1.5 text-white/50">{h.paidAt ? new Date(h.paidAt).toLocaleDateString("pt-BR") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Link to="/admin/payments" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
          Gerenciar solicitações de saque <ArrowRight className="h-3 w-3" />
        </Link>
      </section>

      {bucketOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setBucketOpen(null)}
        >
          <div
            className="w-full max-w-4xl rounded-xl border border-white/10 bg-[#0F0F0F] p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">{bucketOpen.title}</h2>
                <p className="text-xs text-white/50">Vendas que originaram comissões pendentes/disponíveis neste bucket.</p>
              </div>
              <button onClick={() => setBucketOpen(null)} className="rounded p-1 text-white/60 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            {bucketRows === null ? (
              <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : bucketRows.length === 0 ? (
              <p className="text-sm text-white/50">Nenhuma comissão pendente neste bucket.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-white/40">
                    <tr>
                      <th className="px-2 py-1 text-left">Data</th>
                      <th className="px-2 py-1 text-left">Cliente</th>
                      <th className="px-2 py-1 text-left">Produto</th>
                      <th className="px-2 py-1 text-left">Coach beneficiário</th>
                      <th className="px-2 py-1 text-left">Slot</th>
                      <th className="px-2 py-1 text-center">Nível</th>
                      <th className="px-2 py-1 text-right">Valor</th>
                      <th className="px-2 py-1 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bucketRows.map((r) => (
                      <tr key={r.commissionId} className="border-t border-white/5">
                        <td className="px-2 py-1.5 text-white/70">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("pt-BR") : "—"}</td>
                        <td className="px-2 py-1.5 text-white">{r.clientName || "—"}</td>
                        <td className="px-2 py-1.5 text-white/80">{r.productName || "—"}</td>
                        <td className="px-2 py-1.5 text-white">{r.beneficiaryName}<span className="ml-1 text-white/30">{r.beneficiaryEmail}</span></td>
                        <td className="px-2 py-1.5 text-white/60">{r.slotLabel || "—"}</td>
                        <td className="px-2 py-1.5 text-center text-white/60">{r.level}</td>
                        <td className="px-2 py-1.5 text-right font-bold text-primary">{money(r.amount)}</td>
                        <td className="px-2 py-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            r.status === "available" ? "bg-sky-500/15 text-sky-300" : "bg-amber-500/15 text-amber-300"
                          }`}>{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex justify-end gap-4 text-xs text-white/60">
                  <span>Total: <strong className="text-primary">{money(bucketRows.reduce((s, r) => s + r.amount, 0))}</strong></span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {feesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setFeesOpen(null)}
        >
          <div
            className="w-full max-w-4xl rounded-xl border border-white/10 bg-[#0F0F0F] p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Pendências de {feesOpen === "tax" ? "imposto" : "taxa de pagamento"}
                </h2>
                <p className="text-xs text-white/50">PIX e Boleto exigem baixa manual. Clique em "Pagar" para registrar a quitação.</p>
              </div>
              <button onClick={() => setFeesOpen(null)} className="rounded p-1 text-white/60 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            {feesRows === null ? (
              <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : (() => {
              const rows = feesRows.filter((r) =>
                feesOpen === "tax" ? !r.taxPaid && r.taxAmount > 0 : !r.feePaid && r.feeAmount > 0
              );
              if (rows.length === 0) return <p className="text-sm text-white/50">Nenhuma pendência.</p>;
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase text-white/40">
                      <tr>
                        <th className="px-2 py-1 text-left">Data</th>
                        <th className="px-2 py-1 text-left">Cliente</th>
                        <th className="px-2 py-1 text-left">Produto</th>
                        <th className="px-2 py-1 text-left">Método</th>
                        <th className="px-2 py-1 text-right">Valor</th>
                        <th className="px-2 py-1 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.transactionId} className="border-t border-white/5">
                          <td className="px-2 py-1.5 text-white/70">{r.date ? new Date(r.date).toLocaleDateString("pt-BR") : "—"}</td>
                          <td className="px-2 py-1.5 text-white">{r.clientName || "—"}</td>
                          <td className="px-2 py-1.5 text-white/80">{r.productName || "—"}</td>
                          <td className="px-2 py-1.5 text-white/60 uppercase">{r.paymentMethod || "—"}</td>
                          <td className="px-2 py-1.5 text-right font-bold text-primary">
                            {money(feesOpen === "tax" ? r.taxAmount : r.feeAmount)}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              onClick={() => handlePayFee(r.transactionId, feesOpen)}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/25"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Pagar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}

function FeeBlock({
  title, icon: Icon, total, autoCard, manualPaid, manualPending, onOpen,
}: { title: string; icon: typeof Receipt; total: number; autoCard: number; manualPaid: number; manualPending: number; onOpen: () => void }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <p className="text-sm font-bold text-white">{title}</p>
        </div>
        <p className="text-xs text-white/40">Total: <strong className="text-white">{money(total)}</strong></p>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
        <Mini label="Auto (cartão)" value={money(autoCard)} />
        <Mini label="Pago manual" value={money(manualPaid)} />
        <Mini label="Pendente manual" value={money(manualPending)} />
      </div>
      <button
        onClick={onOpen}
        disabled={manualPending <= 0}
        className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline disabled:opacity-40 disabled:no-underline"
      >
        Ver pendências <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}

function BucketCard({
  title, subtitle, icon: Icon, pending, available, paid, accent, onClick,
}: { title: string; subtitle: string; icon: typeof Wallet; pending: number; available: number; paid: number; accent: string; onClick?: () => void }) {
  const aPagar = pending + available;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-2xl border border-white/5 p-4 transition hover:border-white/20 hover:bg-white/[0.03]"
      style={{ backgroundColor: "#1A1A1A" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-white/50">{title}</p>
          <p className="text-[10px] text-white/40">{subtitle}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${accent}22`, color: accent }}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-bold" style={{ color: accent }}>{money(aPagar)}</p>
      <p className="text-[10px] text-white/40 mb-3">Total a pagar (pendente + disponível)</p>
      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <Mini label="Pendente" value={money(pending)} />
        <Mini label="Disponível" value={money(available)} />
        <Mini label="Pago" value={money(paid)} />
      </div>
    </button>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/5 px-2 py-1.5">
      <p className="text-white/40">{label}</p>
      <p className="font-bold text-white">{value}</p>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-primary/15" : "bg-white/5"}`}>
      <p className="text-[10px] text-white/40">{label}</p>
      <p className={`text-sm font-bold ${highlight ? "text-primary" : "text-white"}`}>{value}</p>
    </div>
  );
}

function ShortcutLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2.5 text-white/80 hover:bg-white/10">
      <span>{label}</span>
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function RecipientsTable({ title, rows, kind, onPay }: {
  title: string;
  rows: RecipientTotal[];
  kind?: "coach" | "network" | "nutritionist";
  onPay?: (profileId: string, kind: "coach" | "network" | "nutritionist", name: string) => void;
}) {
  if (!rows.length) return null;
  const showPay = !!kind && !!onPay;
  return (
    <section className="rounded-2xl border border-white/5 p-5 mb-5" style={{ backgroundColor: "#1A1A1A" }}>
      <h2 className="mb-3 font-bold text-white">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-white/40">
            <tr>
              <th className="px-2 py-1 text-left">Beneficiário</th>
              <th className="px-2 py-1 text-right">Pendente</th>
              <th className="px-2 py-1 text-right">Disponível</th>
              <th className="px-2 py-1 text-right">Pago</th>
              <th className="px-2 py-1 text-right">Acumulado</th>
              {showPay && <th className="px-2 py-1 text-right">Ação</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.profileId} className="border-t border-white/5">
                <td className="px-2 py-1.5 text-white">
                  {r.name} <span className="text-white/30">{r.email}</span>
                </td>
                <td className="px-2 py-1.5 text-right text-amber-300">{money(r.pending)}</td>
                <td className="px-2 py-1.5 text-right text-sky-300">{money(r.available)}</td>
                <td className="px-2 py-1.5 text-right text-emerald-300">{money(r.paid)}</td>
                <td className="px-2 py-1.5 text-right font-bold text-primary">{money(r.total)}</td>
                {showPay && (
                  <td className="px-2 py-1.5 text-right">
                    <button
                      disabled={r.available <= 0}
                      onClick={() => onPay!(r.profileId, kind!, r.name)}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Pagar disponível
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
