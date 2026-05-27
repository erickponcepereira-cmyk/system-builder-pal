import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, CalendarCheck, ChevronDown, ChevronRight, Download, Loader2, ShoppingBag, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { listDetailedSales, type DetailedSale } from "@/lib/admin-reports.functions";

export const Route = createFileRoute("/admin/reports")({ component: AdminReports });

type AttendanceRow = { student_id: string; log_date: string; attended: boolean | null; students: { profiles: { name: string; email: string } | null } | null };
type OrderRow = { id: string; order_number: string; status: string; total_amount: number; created_at: string | null; students: { profiles: { name: string; email: string } | null } | null };

function AdminReports() {
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<DetailedSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const fetchSales = useServerFn(listDetailedSales);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const [attendanceRes, ordersRes] = await Promise.all([
      supabase.from("attendance_logs").select("student_id,log_date,attended,students!attendance_logs_student_id_fkey(profiles!students_profile_id_fkey(name,email))").gte("log_date", since).order("log_date", { ascending: false }),
      supabase.from("store_orders" as never).select("id,order_number,status,total_amount,created_at,students!store_orders_student_id_fkey(profiles!students_profile_id_fkey(name,email))" as never).order("created_at" as never, { ascending: false }).limit(100),
    ]);
    if (attendanceRes.error || ordersRes.error) toast.error(attendanceRes.error?.message || ordersRes.error?.message || "Erro ao carregar relatórios");
    setAttendance((attendanceRes.data as unknown as AttendanceRow[]) || []);
    setOrders((ordersRes.data as unknown as OrderRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const studentSummary = useMemo(() => {
    const map = new Map<string, { name: string; email: string; count: number; last: string }>();
    attendance.filter((row) => row.attended).forEach((row) => {
      const current = map.get(row.student_id) || { name: row.students?.profiles?.name || "Aluno", email: row.students?.profiles?.email || "", count: 0, last: row.log_date };
      current.count += 1;
      if (row.log_date > current.last) current.last = row.log_date;
      map.set(row.student_id, current);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [attendance]);

  const revenue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const paidOrders = orders.filter((order) => ["paid", "preparing", "shipped", "delivered"].includes(order.status)).length;
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const exportCsv = () => {
    const lines = [["Aluno", "Email", "Check-ins 30 dias", "Último check-in"], ...studentSummary.map((row) => [row.name, row.email, String(row.count), row.last])];
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
      <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}><h2 className="mb-3 font-bold text-white">Frequência dos alunos</h2><div className="space-y-2">{studentSummary.slice(0, 12).map((row) => <div key={row.email} className="rounded-xl bg-white/5 p-3"><div className="flex items-center justify-between"><div className="min-w-0"><p className="truncate text-sm font-medium text-white">{row.name}</p><p className="truncate text-[10px] text-white/40">{row.email}</p></div><span className="text-sm font-bold text-primary">{Math.round((row.count / 30) * 100)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((row.count / 30) * 100))}%` }} /></div></div>)}</div></section><section className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}><h2 className="mb-3 font-bold text-white">Resumo de pedidos</h2><div className="mb-3 grid grid-cols-2 gap-2"><Metric label="Pagos/em separação" value={String(paidOrders)} /><Metric label="Pendentes" value={String(orders.length - paidOrders)} /></div><div className="space-y-2">{orders.slice(0, 10).map((order) => <div key={order.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs"><div><p className="font-bold text-white">{order.order_number}</p><p className="text-white/40">{order.students?.profiles?.name || "Aluno"} · {order.status}</p></div><b className="text-primary">{fmt(Number(order.total_amount || 0))}</b></div>)}</div></section></div>
    </>}
  </>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/5 p-3"><p className="text-xl font-bold text-white">{value}</p><p className="text-[10px] text-white/40">{label}</p></div>;
}
