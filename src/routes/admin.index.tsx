import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Users, UserCheck, DollarSign, TrendingUp, Activity, Clock, Wallet, Trophy, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BirthdaysCard } from "@/components/BirthdaysCard";
import { WhatsAppGroupCard } from "@/components/WhatsAppGroupCard";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

interface Stats {
  totalCoaches: number;
  pendingCoaches: number;
  totalStudents: number;
  monthRevenue: number;
  totalProducts: number;
  activeSubscriptions: number;
  pendingCommissions: number;
  paidCommissions: number;
  pendingWithdrawals: number;
}

interface MonthRevenue { month: string; revenue: number; }
interface TopCoach { id: string; name: string; students: number; revenue: number; }
interface RecentTx { id: string; amount: number; student_name: string; product_name: string; paid_at: string; }

function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalCoaches: 0, pendingCoaches: 0, totalStudents: 0, monthRevenue: 0,
    totalProducts: 0, activeSubscriptions: 0, pendingCommissions: 0,
    paidCommissions: 0, pendingWithdrawals: 0,
  });
  const [monthsData, setMonthsData] = useState<MonthRevenue[]>([]);
  const [topCoaches, setTopCoaches] = useState<TopCoach[]>([]);
  const [recentTxs, setRecentTxs] = useState<RecentTx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

      const [coaches, pending, students, products, subs, txsMonth, txs6m, commPending, commAvail, withdrawals, recent] = await Promise.all([
        supabase.from("coaches").select("id", { count: "exact", head: true }).not("approved_at", "is", null),
        supabase.from("coaches").select("id", { count: "exact", head: true }).is("approved_at", null),
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("transactions").select("gross_amount").eq("status", "paid").gte("paid_at", firstDay.toISOString()),
        supabase.from("transactions").select("gross_amount, paid_at, student_id, product_id").eq("status", "paid").gte("paid_at", sixMonthsAgo.toISOString()),
        supabase.from("commissions").select("amount").eq("status", "pending"),
        supabase.from("commissions").select("amount").eq("status", "available"),
        supabase.from("withdrawal_requests").select("amount").in("status", ["requested", "approved", "processing"]),
        supabase.from("transactions").select("id, gross_amount, paid_at, student_id, product_id").eq("status", "paid").order("paid_at", { ascending: false }).limit(5),
      ]);

      // Revenue by month (last 6)
      const buckets = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
      }
      (txs6m.data || []).forEach((t) => {
        if (!t.paid_at) return;
        const d = new Date(t.paid_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + Number(t.gross_amount));
      });
      const months: MonthRevenue[] = Array.from(buckets.entries()).map(([k, v]) => {
        const [, m] = k.split("-");
        const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        return { month: monthNames[Number(m) - 1], revenue: v };
      });
      setMonthsData(months);

      // Top coaches: aggregate paid transactions by coach via students join
      const coachAgg = new Map<string, { revenue: number; students: Set<string> }>();
      const studentIds = Array.from(new Set((txs6m.data || []).map((t) => t.student_id).filter(Boolean)));
      if (studentIds.length) {
        const { data: studentsData } = await supabase.from("students").select("id, coach_id, profile_id").in("id", studentIds);
        const studentToCoach = new Map((studentsData || []).map((s) => [s.id, s.coach_id]));
        (txs6m.data || []).forEach((t) => {
          const coachId = studentToCoach.get(t.student_id);
          if (!coachId) return;
          const cur = coachAgg.get(coachId) || { revenue: 0, students: new Set() };
          cur.revenue += Number(t.gross_amount);
          cur.students.add(t.student_id);
          coachAgg.set(coachId, cur);
        });
        const topIds = Array.from(coachAgg.entries()).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5).map(([id]) => id);
        if (topIds.length) {
          const { data: topCoachesData } = await supabase.from("coaches").select("id, profile_id").in("id", topIds);
          const profileIds = (topCoachesData || []).map((c) => c.profile_id);
          const { data: profs } = await supabase.from("profiles").select("id, name").in("id", profileIds);
          const profMap = new Map((profs || []).map((p) => [p.id, p.name]));
          const top: TopCoach[] = (topCoachesData || []).map((c) => {
            const agg = coachAgg.get(c.id)!;
            return { id: c.id, name: profMap.get(c.profile_id) || "—", students: agg.students.size, revenue: agg.revenue };
          }).sort((a, b) => b.revenue - a.revenue);
          setTopCoaches(top);
        }
      }

      // Recent transactions enrich
      const recentData = recent.data || [];
      const sIds = Array.from(new Set(recentData.map((t) => t.student_id)));
      const pIds = Array.from(new Set(recentData.map((t) => t.product_id)));
      const [sRes, pRes] = await Promise.all([
        sIds.length ? supabase.from("students").select("id, profile_id").in("id", sIds) : Promise.resolve({ data: [] as Array<{ id: string; profile_id: string }> }),
        pIds.length ? supabase.from("products").select("id, name").in("id", pIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      ]);
      const sProfileIds = (sRes.data || []).map((s) => s.profile_id);
      const { data: sProfs } = sProfileIds.length
        ? await supabase.from("profiles").select("id, name").in("id", sProfileIds)
        : { data: [] as Array<{ id: string; name: string }> };
      const studentNameMap = new Map<string, string>();
      (sRes.data || []).forEach((s) => {
        const name = (sProfs || []).find((p) => p.id === s.profile_id)?.name || "—";
        studentNameMap.set(s.id, name);
      });
      const productNameMap = new Map((pRes.data || []).map((p) => [p.id, p.name]));
      setRecentTxs(recentData.map((t) => ({
        id: t.id,
        amount: Number(t.gross_amount),
        paid_at: t.paid_at || "",
        student_name: studentNameMap.get(t.student_id) || "—",
        product_name: productNameMap.get(t.product_id) || "—",
      })));

      const sumAmt = (arr: Array<{ amount: number | null }> | null) =>
        (arr || []).reduce((s, x) => s + Number(x.amount || 0), 0);

      setStats({
        totalCoaches: coaches.count || 0,
        pendingCoaches: pending.count || 0,
        totalStudents: students.count || 0,
        totalProducts: products.count || 0,
        activeSubscriptions: subs.count || 0,
        monthRevenue: (txsMonth.data || []).reduce((s, t) => s + Number(t.gross_amount || 0), 0),
        pendingCommissions: sumAmt(commPending.data),
        paidCommissions: sumAmt(commAvail.data),
        pendingWithdrawals: sumAmt(withdrawals.data),
      });
      setLoading(false);
    })();
  }, []);

  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const fmtFull = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const cards = [
    { label: "Faturamento do mês", value: fmt(stats.monthRevenue), icon: DollarSign, color: "text-success" },
    { label: "Comissões a pagar", value: fmt(stats.paidCommissions), icon: Wallet, color: "text-primary" },
    { label: "Comissões pendentes", value: fmt(stats.pendingCommissions), icon: Clock, color: "text-red-400" },
    { label: "Saques solicitados", value: fmt(stats.pendingWithdrawals), icon: ArrowUpRight, color: "text-red-400" },
    { label: "Coaches ativos", value: stats.totalCoaches.toString(), icon: UserCheck, color: "text-blue-400" },
    { label: "Alunos cadastrados", value: stats.totalStudents.toString(), icon: Users, color: "text-violet-400" },
    { label: "Assinaturas ativas", value: stats.activeSubscriptions.toString(), icon: Activity, color: "text-emerald-400" },
    { label: "Produtos ativos", value: stats.totalProducts.toString(), icon: TrendingUp, color: "text-pink-400" },
  ];

  const maxRevenue = Math.max(1, ...monthsData.map((m) => m.revenue));

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard Admin</h1>
        <p className="text-sm text-white/50">Visão geral da plataforma FitMind Club</p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs text-white/50">{c.label}</p>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{loading ? "—" : c.value}</p>
          </div>
        ))}
      </div>

      {/* Pending coaches alert */}
      {stats.pendingCoaches > 0 && (
        <Link to="/admin/coaches" className="block mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 hover:bg-red-500/15 transition-colors">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-red-400" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">
                {stats.pendingCoaches} coach{stats.pendingCoaches > 1 ? "es" : ""} aguardando aprovação
              </p>
              <p className="text-xs text-white/60">Clique para revisar →</p>
            </div>
          </div>
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue chart */}
        <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <h2 className="text-sm font-bold text-white mb-1">Faturamento (últimos 6 meses)</h2>
          <p className="text-xs text-white/40 mb-5">Soma das transações pagas por mês</p>
          <div className="flex items-end gap-3 h-40">
            {monthsData.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-t-lg bg-primary/80 hover:bg-primary transition-colors relative group"
                    style={{ height: `${(m.revenue / maxRevenue) * 100}%`, minHeight: m.revenue > 0 ? "4px" : "2px" }}
                  >
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">
                      {fmt(m.revenue)}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] text-white/50">{m.month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top coaches */}
        <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <h2 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-red-400" /> Top 5 coaches
          </h2>
          <p className="text-xs text-white/40 mb-5">Receita gerada nos últimos 6 meses</p>
          {topCoaches.length === 0 ? (
            <p className="text-xs text-white/40 text-center py-8">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {topCoaches.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    i === 0 ? "bg-red-500/20 text-red-400" : i === 1 ? "bg-white/10 text-white/70" : i === 2 ? "bg-red-500/20 text-red-400" : "bg-white/5 text-white/50"
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{c.name}</p>
                    <p className="text-[11px] text-white/50">{c.students} aluno{c.students !== 1 ? "s" : ""}</p>
                  </div>
                  <p className="text-sm font-bold text-success">{fmt(c.revenue)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="mt-6 rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h2 className="text-sm font-bold text-white mb-1">Vendas recentes</h2>
        <p className="text-xs text-white/40 mb-4">Últimas 5 transações pagas</p>
        {recentTxs.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-6">Nenhuma venda registrada</p>
        ) : (
          <div className="divide-y divide-white/5">
            {recentTxs.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{t.student_name}</p>
                  <p className="text-[11px] text-white/50 truncate">{t.product_name} · {t.paid_at ? new Date(t.paid_at).toLocaleDateString("pt-BR") : "—"}</p>
                </div>
                <p className="text-sm font-bold text-success">{fmtFull(t.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Aniversariantes globais — prioriza semana */}
      <div className="mt-6">
        <BirthdaysCard scope="admin-global" />
      </div>
    </>
  );
}
