import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, CalendarCheck, ChevronDown, ChevronRight, Download, Loader2, ShoppingBag, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { listDetailedSales, type DetailedSale } from "@/lib/admin-reports.functions";

export const Route = createFileRoute("/admin/reports")({ component: AdminReports });

type AttendanceRow = { student_id: string; log_date: string; attended: boolean | null; students: { profile_id: string | null; profiles: { name: string; email: string } | null } | null };
type OrderRow = { id: string; order_number: string; status: string; total_amount: number; created_at: string | null; students: { profiles: { name: string; email: string } | null } | null };
type GroupKey = "aluno" | "aluno_coach" | "aluno_profissional" | "aluno_parceiro";
const GROUP_LABELS: Record<GroupKey, string> = { aluno: "Só Aluno", aluno_coach: "Aluno Coach", aluno_profissional: "Aluno Profissional", aluno_parceiro: "Aluno Parceiro" };

function AdminReports() {
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<DetailedSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending" | "refunded">("all");
  const [salesOpen, setSalesOpen] = useState(false);
  const [groupTab, setGroupTab] = useState<GroupKey>("aluno");
  const [coachProfileSet, setCoachProfileSet] = useState<Set<string>>(new Set());
  const [proProfileSet, setProProfileSet] = useState<Set<string>>(new Set());
  const [partnerProfileSet, setPartnerProfileSet] = useState<Set<string>>(new Set());
  const fetchSales = useServerFn(listDetailedSales);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const [attendanceRes, ordersRes, coachesRes, partnersRes] = await Promise.all([
      supabase.from("attendance_logs").select("student_id,log_date,attended,students!attendance_logs_student_id_fkey(profile_id,profiles!students_profile_id_fkey(name,email))").gte("log_date", since).order("log_date", { ascending: false }),
      supabase.from("store_orders" as never).select("id,order_number,status,total_amount,created_at,students!store_orders_student_id_fkey(profiles!students_profile_id_fkey(name,email))" as never).order("created_at" as never, { ascending: false }).limit(100),
      supabase.from("coaches").select("profile_id,is_professional"),
      supabase.from("partners").select("profile_id"),
    ]);
    if (attendanceRes.error || ordersRes.error) toast.error(attendanceRes.error?.message || ordersRes.error?.message || "Erro ao carregar relatórios");
    setAttendance((attendanceRes.data as unknown as AttendanceRow[]) || []);
    setOrders((ordersRes.data as unknown as OrderRow[]) || []);
    const coachRows = (coachesRes.data as Array<{ profile_id: string; is_professional: boolean | null }> | null) || [];
    setCoachProfileSet(new Set(coachRows.filter((c) => !c.is_professional).map((c) => c.profile_id)));
    setProProfileSet(new Set(coachRows.filter((c) => !!c.is_professional).map((c) => c.profile_id)));
    setPartnerProfileSet(new Set(((partnersRes.data as Array<{ profile_id: string }> | null) || []).map((p) => p.profile_id)));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    setSalesLoading(true);
    fetchSales({ data: { limit: 100 } })
      .then((rows) => setSales(rows))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar vendas"))
      .finally(() => setSalesLoading(false));
  }, []);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportSalesCsv = () => {
    const header = ["Data", "Canal", "Cliente", "Vendedor", "Upline 1", "Upline 2", "Upline 3", "Produto", "Bruto", "Taxa MP", "Imposto", "App fee", "Líquido", "Status", "Pontos"];
    const lines = [
      header,
      ...sales.map((s) => [
        s.paidAt ? new Date(s.paidAt).toLocaleString("pt-BR") : new Date(s.createdAt).toLocaleString("pt-BR"),
        s.saleChannelLabel,
        s.studentName || "—",
        s.sellerCoachName || "—",
        s.upline1Name || "—",
        s.upline2Name || "—",
        s.upline3Name || "—",
        s.productName || "—",
        fmt(s.grossAmount),
        fmt(s.paymentFee),
        fmt(s.taxAmount),
        fmt(s.appFee),
        fmt(s.netAmount),
        s.status,
        String(s.pointsGenerated),
      ]),
    ];
    const csv = lines.map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "vendas-detalhadas-fitmind.csv";
    a.click();
    URL.revokeObjectURL(url);
  };


  const studentSummary = useMemo(() => {
    const map = new Map<string, { name: string; email: string; count: number; last: string; group: GroupKey }>();
    attendance.filter((row) => row.attended).forEach((row) => {
      const profileId = row.students?.profile_id || null;
      let group: GroupKey = "aluno";
      if (profileId) {
        if (proProfileSet.has(profileId)) group = "aluno_profissional";
        else if (coachProfileSet.has(profileId)) group = "aluno_coach";
        else if (partnerProfileSet.has(profileId)) group = "aluno_parceiro";
      }
      const current = map.get(row.student_id) || { name: row.students?.profiles?.name || "Aluno", email: row.students?.profiles?.email || "", count: 0, last: row.log_date, group };
      current.count += 1;
      if (row.log_date > current.last) current.last = row.log_date;
      map.set(row.student_id, current);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [attendance, coachProfileSet, proProfileSet, partnerProfileSet]);

  const groupedSummary = useMemo(() => {
    const groups: Record<GroupKey, typeof studentSummary> = { aluno: [], aluno_coach: [], aluno_profissional: [], aluno_parceiro: [] };
    studentSummary.forEach((s) => groups[s.group].push(s));
    return groups;
  }, [studentSummary]);

  const visibleSummary = groupedSummary[groupTab];

  const revenue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const paidOrders = orders.filter((order) => ["paid", "preparing", "shipped", "delivered"].includes(order.status)).length;
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const exportCsv = () => {
    const lines = [["Aluno", "Email", "Grupo", "Check-ins 30 dias", "Último check-in"], ...studentSummary.map((row) => [row.name, row.email, GROUP_LABELS[row.group], String(row.count), row.last])];
    const csv = lines.map((line) => line.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "frequencia-fitmind.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return <>
    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h1 className="text-2xl font-bold text-white">Relatórios</h1><p className="text-sm text-white/50">Frequência, pedidos e exportação operacional</p></div><Button onClick={exportCsv} className="gap-2"><Download className="h-4 w-4" /> Exportar frequência</Button></div>
    {loading ? <div className="rounded-2xl p-12 text-center" style={{ backgroundColor: "#1A1A1A" }}><Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" /><p className="text-white/50">Carregando relatórios...</p></div> : <>
      <div className="mb-5 grid gap-3 sm:grid-cols-4">{[{ label: "Check-ins", value: attendance.filter((r) => r.attended).length, icon: CalendarCheck }, { label: "Alunos ativos", value: studentSummary.length, icon: Users }, { label: "Pedidos", value: orders.length, icon: ShoppingBag }, { label: "Receita loja", value: fmt(revenue), icon: BarChart3 }].map((card) => <div key={card.label} className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}><div className="flex items-center justify-between"><p className="text-xs text-white/50">{card.label}</p><card.icon className="h-5 w-5 text-primary" /></div><p className="mt-2 text-2xl font-bold text-white">{card.value}</p></div>)}</div>
      <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}><div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-bold text-white">Frequência dos alunos</h2><span className="text-[10px] text-white/40">{visibleSummary.length} no grupo</span></div><div className="mb-3 flex flex-wrap gap-1.5">{(Object.keys(GROUP_LABELS) as GroupKey[]).map((k) => <button key={k} onClick={() => setGroupTab(k)} className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition ${groupTab === k ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>{GROUP_LABELS[k]} ({groupedSummary[k].length})</button>)}</div><div className="space-y-2">{visibleSummary.length === 0 ? <p className="py-6 text-center text-xs text-white/40">Nenhum aluno deste grupo no período.</p> : visibleSummary.slice(0, 12).map((row) => <div key={row.email} className="rounded-xl bg-white/5 p-3"><div className="flex items-center justify-between"><div className="min-w-0"><p className="truncate text-sm font-medium text-white">{row.name}</p><p className="truncate text-[10px] text-white/40">{row.email}</p></div><span className="text-sm font-bold text-primary">{Math.round((row.count / 30) * 100)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((row.count / 30) * 100))}%` }} /></div></div>)}</div></section><section className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}><h2 className="mb-3 font-bold text-white">Resumo de pedidos</h2><div className="mb-3 grid grid-cols-2 gap-2"><Metric label="Pagos/em separação" value={String(paidOrders)} /><Metric label="Pendentes" value={String(orders.length - paidOrders)} /></div><div className="space-y-2">{orders.slice(0, 10).map((order) => <div key={order.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs"><div><p className="font-bold text-white">{order.order_number}</p><p className="text-white/40">{order.students?.profiles?.name || "Aluno"} · {order.status}</p></div><b className="text-primary">{fmt(Number(order.total_amount || 0))}</b></div>)}</div></section></div>

      <section className="mt-5 rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => setSalesOpen((v) => !v)} className="flex items-center gap-2 text-left">
            {salesOpen ? <ChevronDown className="h-4 w-4 text-white/60" /> : <ChevronRight className="h-4 w-4 text-white/60" />}
            <div>
              <h2 className="font-bold text-white">Detalhamento de vendas <span className="ml-2 text-xs font-normal text-white/40">({sales.length})</span></h2>
              <p className="text-xs text-white/40">Clique para expandir o histórico. Cada venda pode ser aberta para ver a distribuição.</p>
            </div>
          </button>
          {salesOpen && (
            <div className="flex items-center gap-2">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white">
                <option value="all">Todos os status</option>
                <option value="paid">Pagas</option>
                <option value="pending">Pendentes</option>
                <option value="refunded">Recusadas/Estornadas</option>
              </select>
              <Button size="sm" onClick={exportSalesCsv} variant="outline" className="border-white/10 text-white/70 gap-2">
                <Download className="h-3 w-3" /> CSV
              </Button>
            </div>
          )}
        </div>
        {salesOpen && (
          <>
        {salesLoading ? (
          <div className="p-8 text-center text-white/40"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        ) : sales.length === 0 ? (
          <p className="p-6 text-center text-sm text-white/40">Nenhuma venda no período.</p>
        ) : (
          <div className="space-y-2">
            {sales.filter((s) => statusFilter === "all" || s.status === statusFilter).map((s) => {
              const isOpen = expanded.has(s.transactionId);
              return (
                <div key={s.transactionId} className="rounded-xl border border-white/5 bg-white/[0.02]">
                  <button onClick={() => toggle(s.transactionId)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-white/5">
                    <div className="flex min-w-0 items-center gap-2">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-white/40" /> : <ChevronRight className="h-4 w-4 text-white/40" />}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{s.studentName || "—"} · <span className="text-white/50">{s.productName || "—"}</span></p>
                        <p className="text-[10px] text-white/40">{new Date(s.paidAt || s.createdAt).toLocaleString("pt-BR")} · Vendedor: {s.sellerCoachName || "—"} · {s.pointsGenerated} pts</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.saleChannel === "store" ? "bg-sky-500/15 text-sky-300" : "bg-violet-500/15 text-violet-300"}`}>{s.saleChannelLabel}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.status === "paid" ? "bg-emerald-500/15 text-emerald-300" : s.status === "refunded" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"}`}>{s.status === "paid" ? "Paga" : s.status === "refunded" ? "Recusada" : "Pendente"}</span>
                      <span className="text-sm font-bold text-primary">{fmt(s.grossAmount)}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-white/5 px-3 py-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                        <Metric label="Bruto" value={fmt(s.grossAmount)} />
                        <Metric label="Taxa MP" value={fmt(s.paymentFee)} />
                        <Metric label="Imposto" value={fmt(s.taxAmount)} />
                        <Metric label="Líquido" value={fmt(s.netAmount)} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
                        <Metric label="Upline 1" value={s.upline1Name || "—"} />
                        <Metric label="Upline 2" value={s.upline2Name || "—"} />
                        <Metric label="Upline 3" value={s.upline3Name || "—"} />
                      </div>
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">Distribuição de slots</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="text-[10px] uppercase text-white/40">
                              <tr><th className="px-2 py-1 text-left">Slot</th><th className="px-2 py-1 text-left">Beneficiário</th><th className="px-2 py-1 text-right">%</th><th className="px-2 py-1 text-right">Valor</th><th className="px-2 py-1 text-left">Status</th></tr>
                            </thead>
                            <tbody>
                              {s.commissions.map((c, i) => (
                                <tr key={i} className="border-t border-white/5">
                                  <td className="px-2 py-1.5 text-white/70">{c.slotLabel || `Nível ${c.level}`}</td>
                                  <td className="px-2 py-1.5 text-white">{c.beneficiaryName || "—"}</td>
                                  <td className="px-2 py-1.5 text-right text-white/60">{c.percentage.toFixed(2)}%</td>
                                  <td className="px-2 py-1.5 text-right font-bold text-primary">{fmt(c.amount)}</td>
                                  <td className="px-2 py-1.5 text-white/50">{c.status}</td>
                                </tr>
                              ))}
                              <tr className="border-t border-white/10 bg-white/5">
                                <td colSpan={3} className="px-2 py-1.5 text-right font-bold text-white/70">Total distribuído</td>
                                <td className="px-2 py-1.5 text-right font-bold text-white">{fmt(s.distributedTotal)}</td>
                                <td></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </section>
    </>}
  </>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/5 p-3"><p className="text-xl font-bold text-white">{value}</p><p className="text-[10px] text-white/40">{label}</p></div>;
}
