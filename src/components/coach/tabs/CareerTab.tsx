import { useEffect, useState } from "react";
import { Loader2, Trophy, Check, Lock, Star, TrendingUp, Users, Clock } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getCareerProgress, type PatentRule, type CareerProgress } from "@/lib/coach-career.functions";

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function CareerTab() {
  const fetchProgress = useServerFn(getCareerProgress);
  const [data, setData] = useState<CareerProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchProgress()
      .then((res) => { if (active) setData(res); })
      .catch(() => { if (active) setData(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" />
      </div>
    );
  }

  if (!data || data.patents.length === 0) {
    return (
      <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: "#1A1A1A" }}>
        <Trophy className="h-10 w-10 text-white/10 mx-auto mb-2" />
        <p className="text-sm text-white/40">Nenhuma patente configurada ainda.</p>
      </div>
    );
  }

  const { patents, windows, currentPatentKey, nextPatentKey } = data;
  const current = patents.find((p) => p.key === currentPatentKey) ?? null;
  const next = patents.find((p) => p.key === nextPatentKey) ?? null;
  const nextWindow = next ? windows[next.time_window_months] : null;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Plano de Carreira</h1>
        <p className="text-sm text-white/50">Sua jornada na FitMind Club</p>
      </div>

      {/* Current patent */}
      <div className="rounded-2xl p-5 mb-4 relative overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full" style={{ backgroundColor: `${current?.badge_color || "#FF4230"}20` }} />
        <div className="relative">
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Patente atual</p>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl flex-shrink-0"
              style={{ backgroundColor: `${current?.badge_color || "#9CA3AF"}25`, border: `1px solid ${current?.badge_color || "#9CA3AF"}55` }}>
              <Trophy className="h-7 w-7" style={{ color: current?.badge_color || "#9CA3AF" }} />
            </div>
            <div className="flex-1">
              <p className="text-xl font-bold text-white">{current?.display_name || "Sem patente"}</p>
              <p className="text-xs text-white/50">{current?.description || "Comece movimentando suas primeiras vendas."}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Next patent progress */}
      {next && nextWindow && (
        <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Próxima patente</p>
              <p className="text-base font-bold text-white">{next.display_name}</p>
            </div>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-bold"
              style={{ backgroundColor: `${next.badge_color || "#FF4230"}20`, color: next.badge_color || "#FF4230" }}>
              Nível {next.level}
            </span>
          </div>

          <RevenueRow
            label="Faturamento total"
            current={nextWindow.totalRevenue}
            target={next.required_revenue}
            windowMonths={next.time_window_months}
            color={next.badge_color || "#FF4230"}
          />
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <Stat icon={Users} label="Vendas próprias" value={fmtBRL(nextWindow.ownRevenue)} hint={`${nextWindow.ownPct.toFixed(0)}%`} />
            <Stat icon={TrendingUp} label="Vendas da equipe" value={fmtBRL(nextWindow.teamRevenue)} hint={`${(100 - nextWindow.ownPct).toFixed(0)}%`} />
          </div>
          <div className="mt-3 rounded-lg px-2.5 py-2 text-[11px]"
            style={{
              backgroundColor: nextWindow.ownPct >= next.min_own_sales_pct ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)",
              color: nextWindow.ownPct >= next.min_own_sales_pct ? "#34d399" : "#fca5a5",
            }}>
            Mínimo de {next.min_own_sales_pct}% em vendas próprias · Você está em {nextWindow.ownPct.toFixed(0)}%
          </div>
        </div>
      )}

      {/* All patents */}
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="text-sm font-bold text-white mb-4">Todas as patentes</h3>
        <div className="space-y-2">
          {patents.map((p) => {
            const w = windows[p.time_window_months];
            const meetsRevenue = p.required_revenue === 0 || (w && w.totalRevenue >= p.required_revenue);
            const meetsOwn = w ? w.ownPct >= p.min_own_sales_pct : false;
            const achieved = meetsRevenue && (p.required_revenue === 0 || meetsOwn);
            const isCurrent = p.key === currentPatentKey;
            return (
              <PatentRow key={p.id} p={p} achieved={achieved} isCurrent={isCurrent} window={w} />
            );
          })}
        </div>
      </div>
    </>
  );
}

function RevenueRow({ label, current, target, windowMonths, color }: {
  label: string; current: number; target: number; windowMonths: number; color: string;
}) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-white/70">{label} <span className="text-white/40">({windowMonths === 1 ? "mês atual" : `últimos ${windowMonths} meses`})</span></span>
        <span className="text-xs font-bold text-white">{fmtBRL(current)} / {fmtBRL(target)}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#252525" }}>
        <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Users; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg p-2.5" style={{ backgroundColor: "#0F0F0F" }}>
      <div className="flex items-center gap-1.5 text-white/40 mb-0.5">
        <Icon className="h-3 w-3" />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-bold text-white">{value}</p>
      {hint && <p className="text-[10px] text-white/40">{hint}</p>}
    </div>
  );
}

function PatentRow({ p, achieved, isCurrent, window: w }: {
  p: PatentRule; achieved: boolean; isCurrent: boolean;
  window: { ownRevenue: number; teamRevenue: number; totalRevenue: number; ownPct: number } | undefined;
}) {
  return (
    <div className={`rounded-xl p-3 ${isCurrent ? "ring-1 ring-primary/40" : ""}`}
      style={{ backgroundColor: isCurrent ? "rgba(255,66,48,0.06)" : "#0F0F0F" }}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
          style={{ backgroundColor: `${p.badge_color || "#9CA3AF"}25`, border: `1px solid ${p.badge_color || "#9CA3AF"}55` }}>
          {achieved ? <Check className="h-5 w-5" style={{ color: p.badge_color || "#9CA3AF" }} />
            : <Lock className="h-4 w-4 text-white/30" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold" style={{ color: p.badge_color || "#fff" }}>{p.display_name}</span>
            <span className="text-[9px] font-bold rounded-full bg-white/5 px-2 py-0.5 text-white/60">N{p.level}</span>
            {isCurrent && (
              <span className="text-[9px] font-bold rounded-full bg-primary/20 px-2 py-0.5 text-primary">ATUAL</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-white/50">
            <span className="inline-flex items-center gap-1"><Star className="h-2.5 w-2.5" />{p.required_revenue > 0 ? fmtBRL(p.required_revenue) : "Cadastro"}</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{p.time_window_months === 1 ? "mensal" : `${p.time_window_months} meses`}</span>
            {p.min_own_sales_pct > 0 && (
              <span>mín {p.min_own_sales_pct}% próprias</span>
            )}
          </div>
          {p.description && <p className="text-[10px] text-white/40 mt-1">{p.description}</p>}
          {p.benefits && <p className="text-[10px] text-emerald-400/70 mt-0.5">🎁 {p.benefits}</p>}
        </div>
        {w && p.required_revenue > 0 && (
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] text-white/40">progresso</p>
            <p className="text-xs font-bold text-white">{Math.min(100, Math.round((w.totalRevenue / p.required_revenue) * 100))}%</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default CareerTab;
