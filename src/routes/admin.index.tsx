import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Users, UserCheck, DollarSign, TrendingUp, Activity, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
}

function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalCoaches: 0,
    pendingCoaches: 0,
    totalStudents: 0,
    monthRevenue: 0,
    totalProducts: 0,
    activeSubscriptions: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const firstDay = new Date();
      firstDay.setDate(1);
      firstDay.setHours(0, 0, 0, 0);

      const [coaches, pending, students, products, subs, txs] = await Promise.all([
        supabase.from("coaches").select("id", { count: "exact", head: true }).not("approved_at", "is", null),
        supabase.from("coaches").select("id", { count: "exact", head: true }).is("approved_at", null),
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("transactions").select("gross_amount").eq("status", "paid").gte("paid_at", firstDay.toISOString()),
      ]);

      const revenue = (txs.data || []).reduce((sum, t) => sum + Number(t.gross_amount || 0), 0);

      setStats({
        totalCoaches: coaches.count || 0,
        pendingCoaches: pending.count || 0,
        totalStudents: students.count || 0,
        totalProducts: products.count || 0,
        activeSubscriptions: subs.count || 0,
        monthRevenue: revenue,
      });
      setLoading(false);
    })();
  }, []);

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  const cards = [
    { label: "Faturamento do mês", value: fmt(stats.monthRevenue), icon: DollarSign, color: "text-success" },
    { label: "Coaches ativos", value: stats.totalCoaches.toString(), icon: UserCheck, color: "text-primary" },
    { label: "Alunos cadastrados", value: stats.totalStudents.toString(), icon: Users, color: "text-blue-400" },
    { label: "Assinaturas ativas", value: stats.activeSubscriptions.toString(), icon: Activity, color: "text-violet-400" },
    { label: "Produtos ativos", value: stats.totalProducts.toString(), icon: TrendingUp, color: "text-yellow-400" },
    { label: "Coaches pendentes", value: stats.pendingCoaches.toString(), icon: Clock, color: "text-orange-400" },
  ];

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard Admin</h1>
        <p className="text-sm text-white/50">Visão geral da plataforma FitChain</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      {stats.pendingCoaches > 0 && (
        <div className="mt-6 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-5">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-orange-400" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">
                {stats.pendingCoaches} coach{stats.pendingCoaches > 1 ? "es" : ""} aguardando aprovação
              </p>
              <p className="text-xs text-white/60">Acesse a aba Coaches para revisar.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
