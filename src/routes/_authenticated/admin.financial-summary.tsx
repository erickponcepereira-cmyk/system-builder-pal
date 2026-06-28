import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Wallet, Users, GraduationCap, Stethoscope, BadgeDollarSign, Clock, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { getFinancialSummary, type FinancialSummary } from "@/lib/partner-orders.functions";

export const Route = createFileRoute("/_authenticated/admin/financial-summary")({
  head: () => ({ meta: [{ title: "Resumo Financeiro — Admin" }] }),
  component: FinancialSummaryPage,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function FinancialSummaryPage() {
  const fetchSummary = useServerFn(getFinancialSummary);
  const [data, setData] = useState<FinancialSummary | null>(null);

  useEffect(() => {
    fetchSummary().then(setData).catch((e) => toast.error(e?.message || "Erro ao carregar"));
  }, [fetchSummary]);

  if (!data) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const totalAvailable =
    data.adminWallet.available +
    data.coachWalletsTotal.available +
    data.studentWalletsTotal.available +
    data.nutritionistTotal.available +
    data.professorTotal.available;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" /> Resumo Financeiro
        </h1>
        <p className="text-sm text-white/50 mt-1">
          Consolidação de todas as carteiras e fluxos financeiros do sistema.
        </p>
      </header>

      {/* Total geral */}
      <div className="rounded-2xl p-6" style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.15), transparent)" }}>
        <p className="text-xs text-white/50 uppercase tracking-wider">Saldo total disponível no sistema</p>
        <p className="text-4xl font-bold text-primary font-mono mt-1">{brl(totalAvailable)}</p>
        <p className="text-xs text-white/40 mt-2">
          Somatório das carteiras de admin, coaches, alunos e nutricionistas.
        </p>
      </div>

      {/* Carteiras */}
      <section>
        <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider mb-3">Carteiras</h2>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          <Card
            icon={Wallet}
            title="Admin (sistema)"
            available={data.adminWallet.available}
            earned={data.adminWallet.totalEarned}
            withdrawn={data.adminWallet.totalWithdrawn}
            href="/admin/admin-wallet"
          />
          <Card
            icon={Users}
            title={`Coaches (${data.coachWalletsTotal.count})`}
            available={data.coachWalletsTotal.available}
            earned={data.coachWalletsTotal.totalEarned}
            withdrawn={data.coachWalletsTotal.totalWithdrawn}
            href="/admin/financeiro"
          />
          <Card
            icon={GraduationCap}
            title={`Alunos (${data.studentWalletsTotal.count})`}
            available={data.studentWalletsTotal.available}
            earned={data.studentWalletsTotal.totalEarned}
            withdrawn={data.studentWalletsTotal.totalWithdrawn}
            href="/admin/financeiro"
          />
          <Card
            icon={Stethoscope}
            title={`Nutricionistas (${data.nutritionistTotal.count})`}
            available={data.nutritionistTotal.available}
            earned={data.nutritionistTotal.totalEarned}
            extra={`Bloqueado: ${brl(data.nutritionistTotal.blocked)}`}
            href="/admin/nutritionist-wallet"
          />
          <Card
            icon={GraduationCap}
            title={`Professores (${data.professorTotal.count})`}
            available={data.professorTotal.available}
            earned={data.professorTotal.totalEarned}
            extra={`Bloqueado: ${brl(data.professorTotal.blocked)}`}
            href="/admin/professor-wallet"
          />
        </div>
      </section>

      {/* Pedidos de parceiros */}
      <section>
        <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider mb-3">Pedidos de Parceiros (empresas)</h2>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          <Stat icon={BadgeDollarSign} label="Pedidos pagos" value={String(data.partnerOrders.paidCount)} />
          <Stat icon={TrendingUp} label="Bruto faturado" value={brl(data.partnerOrders.paidGross)} />
          <Stat icon={Stethoscope} label="Parceiros receberam" value={brl(data.partnerOrders.partnerNet)} highlight />
          <Stat icon={Wallet} label="Sistema arrecadou" value={brl(data.partnerOrders.systemFee)} />
        </div>
        <Link
          to="/admin/partner-orders"
          className="inline-flex mt-3 items-center gap-1 text-xs text-primary hover:underline"
        >
          Gerenciar pedidos →
        </Link>
      </section>

      {/* Pedidos de profissional */}
      <section>
        <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider mb-3">Pedidos Profissionais</h2>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          <Stat icon={BadgeDollarSign} label="Pedidos pagos" value={String(data.professionalOrders.paidCount)} />
          <Stat icon={TrendingUp} label="Bruto faturado" value={brl(data.professionalOrders.paidGross)} />
          <Stat icon={Stethoscope} label="Profissionais receberam" value={brl(data.professionalOrders.professionalNet)} highlight />
          <Stat icon={Wallet} label="Sistema arrecadou" value={brl(data.professionalOrders.systemFee)} />
        </div>
        <Link
          to="/admin/partner-orders"
          className="inline-flex mt-3 items-center gap-1 text-xs text-primary hover:underline"
        >
          Gerenciar pedidos →
        </Link>
      </section>

      {/* Saques pendentes */}
      <section>
        <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider mb-3">Saques pendentes</h2>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          <div className="rounded-xl p-4 border border-amber-500/20" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="flex items-center gap-2 text-amber-300 mb-1">
              <Clock className="h-4 w-4" />
              <p className="text-xs uppercase tracking-wider">Coaches</p>
            </div>
            <p className="text-2xl font-bold text-white font-mono">{brl(data.pendingWithdrawals.coachAmount)}</p>
            <p className="text-xs text-white/40 mt-1">{data.pendingWithdrawals.coachCount} solicitação(ões)</p>
          </div>
          <div className="rounded-xl p-4 border border-amber-500/20" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="flex items-center gap-2 text-amber-300 mb-1">
              <Clock className="h-4 w-4" />
              <p className="text-xs uppercase tracking-wider">Alunos</p>
            </div>
            <p className="text-2xl font-bold text-white font-mono">{brl(data.pendingWithdrawals.studentAmount)}</p>
            <p className="text-xs text-white/40 mt-1">{data.pendingWithdrawals.studentCount} solicitação(ões)</p>
          </div>
        </div>
      </section>

      {/* Atalhos */}
      <section>
        <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider mb-3">Atalhos</h2>
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
          {[
            { to: "/admin/financeiro", label: "Financeiro coaches/alunos" },
            { to: "/admin/admin-wallet", label: "Carteira do Admin" },
            { to: "/admin/nutritionist-wallet", label: "Carteira Nutricionista" },
            { to: "/admin/partner-orders", label: "Pedidos de Parceiros" },
            { to: "/admin/payments", label: "Pagamentos" },
            { to: "/admin/orders", label: "Pedidos (loja)" },
            { to: "/admin/product-orders", label: "Pedidos físicos" },
            { to: "/admin/store-reports", label: "Relatórios da Loja" },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-lg bg-white/5 hover:bg-white/10 px-3 py-3 text-xs text-white/80 transition"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Card({
  icon: Icon, title, available, earned, withdrawn, extra, href,
}: { icon: typeof Wallet; title: string; available: number; earned: number; withdrawn?: number; extra?: string; href: string }) {
  return (
    <Link to={href} className="rounded-2xl p-4 block hover:bg-white/[0.03] transition" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-xs text-white/50 uppercase tracking-wider">{title}</p>
      </div>
      <p className="text-2xl font-bold text-primary font-mono">{brl(available)}</p>
      <p className="text-[11px] text-white/40 mt-2">Total recebido: <span className="text-white/70">{brl(earned)}</span></p>
      {withdrawn !== undefined && (
        <p className="text-[11px] text-white/40">Total sacado: <span className="text-white/70">{brl(withdrawn)}</span></p>
      )}
      {extra && <p className="text-[11px] text-white/40">{extra}</p>}
    </Link>
  );
}

function Stat({ icon: Icon, label, value, highlight }: { icon: typeof Wallet; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-xs text-white/50 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-xl font-bold font-mono ${highlight ? "text-primary" : "text-white"}`}>{value}</p>
    </div>
  );
}
