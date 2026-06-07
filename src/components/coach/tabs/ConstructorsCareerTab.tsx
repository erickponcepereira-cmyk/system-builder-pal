import { useEffect, useState } from "react";
import { Loader2, Trophy, Check, Lock, Star, TrendingUp, Users, Clock } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getCareerProgress, type PatentRule, type CareerProgress } from "@/lib/coach-career.functions";
import { AchievementMembersModal } from "@/components/coach/AchievementMembersModal";
import { BadgeImage } from "@/components/coach/BadgeImage";


const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const PHASE_LABELS: Record<number, { title: string; subtitle: string }> = {
  1: { title: "Fase 1 — Desenvolvimento Pessoal", subtitle: "Aprenda o sistema e construa seus primeiros resultados" },
  2: { title: "Fase 2 — Resultados e Liderança", subtitle: "Venda, influencie e inicie sua equipe" },
  3: { title: "Fase 3 — Expansão", subtitle: "Construa organizações e desenvolva novos líderes" },
  4: { title: "Fase 4 — Legado", subtitle: "Grandes organizações dentro do ecossistema FitMind" },
};

export function ConstructorsCareerTab() {
  const fetchProgress = useServerFn(getCareerProgress);
  const [data, setData] = useState<CareerProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalPatent, setModalPatent] = useState<PatentRule | null>(null);


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

  const { patents, windows, currentPatentKey, nextPatentKey, achievements } = data;
  const current = patents.find((p) => p.key === currentPatentKey) ?? null;
  const next = patents.find((p) => p.key === nextPatentKey) ?? null;
  const nextWindow = next ? windows[next.time_window_months] : null;
  const achievedAtByKey = new Map<string, string>(
    (achievements || []).map((a) => [a.patent_key, a.achieved_at]),
  );

  // Group patents by phase
  const phases = new Map<number, PatentRule[]>();
  patents.forEach((p) => {
    const ph = p.phase ?? 0;
    const arr = phases.get(ph) || [];
    arr.push(p);
    phases.set(ph, arr);
  });
  const phaseKeys = Array.from(phases.keys()).sort((a, b) => a - b);

  return (
    <>
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-wider text-primary font-bold mb-1">Carreira com equipe (VP + VE)</p>
        <h1 className="text-2xl font-bold text-white">Ordem dos Construtores FitMind</h1>
        <p className="text-sm text-white/50">Sua jornada de produção pessoal somada à força da sua organização</p>
      </div>

      {/* Current patent */}
      <div className="rounded-2xl p-5 mb-4 relative overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full" style={{ backgroundColor: `${current?.badge_color || "#FF4230"}20` }} />
        <div className="relative">
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Patente atual</p>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl flex-shrink-0 overflow-hidden"
              style={{ backgroundColor: `${current?.badge_color || "#9CA3AF"}25`, border: `1px solid ${current?.badge_color || "#9CA3AF"}55` }}>
              {current?.image_url ? (
                <BadgeImage path={current.image_url} alt={current.display_name} className="h-full w-full object-contain p-1" />
              ) : (
                <Trophy className="h-7 w-7" style={{ color: current?.badge_color || "#9CA3AF" }} />
              )}
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
            label="Faturamento total (VP + VE)"
            current={nextWindow.totalRevenue}
            target={next.required_revenue}
            windowMonths={next.time_window_months}
            color={next.badge_color || "#FF4230"}
          />
          {(() => {
            const vpPct = next.vp_max_pct != null ? next.vp_max_pct : (next.min_own_sales_pct || 100);
            const vePct = next.ve_max_pct != null ? next.ve_max_pct : Math.max(0, 100 - vpPct);
            const vpReq = (next.required_revenue * vpPct) / 100;
            const veReq = (next.required_revenue * vePct) / 100;
            const vpOk = nextWindow.ownRevenue >= vpReq - 0.001;
            const veOk = veReq === 0 || nextWindow.teamRevenue >= veReq - 0.001;
            return (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Stat icon={Users} label={`VP (mín. ${fmtBRL(vpReq)})`} value={fmtBRL(nextWindow.ownRevenue)} hint={vpOk ? "✓ atingido" : `faltam ${fmtBRL(Math.max(0, vpReq - nextWindow.ownRevenue))}`} />
                  <Stat icon={TrendingUp} label={`VE (mín. ${fmtBRL(veReq)})`} value={fmtBRL(nextWindow.teamRevenue)} hint={veOk ? "✓ atingido" : `faltam ${fmtBRL(Math.max(0, veReq - nextWindow.teamRevenue))}`} />
                </div>
                <div className="mt-3 rounded-lg px-2.5 py-2 text-[11px] bg-white/5 text-white/60">
                  Regra: é obrigatório bater <strong>ambos</strong> os mínimos — {vpPct}% em VP ({fmtBRL(vpReq)}) <strong>E</strong> {vePct}% em VE ({fmtBRL(veReq)}).
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* All patents grouped by phase */}
      <div className="space-y-4">
        {phaseKeys.map((ph) => {
          const list = phases.get(ph) || [];
          const meta = PHASE_LABELS[ph];
          return (
            <div key={ph} className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
              {meta && (
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-white">{meta.title}</h3>
                  <p className="text-[11px] text-white/40">{meta.subtitle}</p>
                </div>
              )}
              <div className="space-y-2">
                {list.map((p) => {
                  const w = windows[p.time_window_months];
                  const isCurrent = p.key === currentPatentKey;
                  const vpMax = p.vp_max_pct != null ? p.vp_max_pct : (p.min_own_sales_pct || 100);
                  const veMax = p.ve_max_pct != null ? p.ve_max_pct : Math.max(0, 100 - vpMax);
                  const vpCap = (p.required_revenue * vpMax) / 100;
                  const veCap = (p.required_revenue * veMax) / 100;
                  const cappedOwn = w ? Math.min(w.ownRevenue, vpCap) : 0;
                  const cappedTeam = w ? Math.min(w.teamRevenue, veCap) : 0;
                  const qualifying = cappedOwn + cappedTeam;
                  const achievedAt = achievedAtByKey.get(p.key) ?? null;
                  const achieved = !!achievedAt || p.required_revenue === 0 || qualifying >= p.required_revenue - 0.001;
                  return <PatentRow key={p.id} p={p} achieved={achieved} isCurrent={isCurrent} qualifying={qualifying} achievedAt={achievedAt} onClick={() => setModalPatent(p)} />;
                })}

              </div>
            </div>
          );
        })}
      </div>

      {modalPatent && (
        <AchievementMembersModal
          open={!!modalPatent}
          onClose={() => setModalPatent(null)}
          kind="patent"
          achievementKey={modalPatent.key}
          title={modalPatent.display_name}
          subtitle={`Patente · Nível ${modalPatent.level}`}
          accentColor={modalPatent.badge_color || "#FF4230"}
        />
      )}
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

function PatentRow({ p, achieved, isCurrent, qualifying, achievedAt, onClick }: {
  p: PatentRule; achieved: boolean; isCurrent: boolean; qualifying: number; achievedAt: string | null; onClick?: () => void;
}) {
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl p-3 transition hover:bg-white/[0.03] ${isCurrent ? "ring-1 ring-primary/40" : ""}`}
      style={{ backgroundColor: isCurrent ? "rgba(255,66,48,0.06)" : "#0F0F0F" }}>

      <div className="flex items-center gap-3">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 overflow-hidden"
          style={{ backgroundColor: `${p.badge_color || "#9CA3AF"}25`, border: `1px solid ${p.badge_color || "#9CA3AF"}55` }}>
          {p.image_url ? (
            <BadgeImage
              path={p.image_url}
              alt={p.display_name}
              className={`h-full w-full object-contain p-1 ${achieved ? "" : "grayscale"}`}
            />
          ) : (
            achieved
              ? <Check className="h-5 w-5" style={{ color: p.badge_color || "#9CA3AF" }} />
              : <Lock className="h-4 w-4 text-white/30" />
          )}
          {!achieved && p.image_url && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Lock className="h-4 w-4 text-white/90" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold" style={{ color: p.badge_color || "#fff" }}>{p.display_name}</span>
            <span className="text-[9px] font-bold rounded-full bg-white/5 px-2 py-0.5 text-white/60">N{p.level}</span>
            {isCurrent && (
              <span className="text-[9px] font-bold rounded-full bg-primary/20 px-2 py-0.5 text-primary">ATUAL</span>
            )}
            {achieved && !isCurrent && (
              <span className="text-[9px] font-bold rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">CONQUISTADA</span>
            )}
            {!achieved && (
              <span className="text-[9px] font-bold rounded-full bg-white/5 px-2 py-0.5 text-white/40">BLOQUEADA</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-white/50">
            <span className="inline-flex items-center gap-1"><Star className="h-2.5 w-2.5" />{p.required_revenue > 0 ? fmtBRL(p.required_revenue) : "Cadastro"}</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{p.time_window_months === 1 ? "mensal" : `${p.time_window_months} meses`}</span>
            {p.vp_max_pct != null && p.vp_max_pct < 100 && (
              <span>VP até {p.vp_max_pct}% · VE {(100 - p.vp_max_pct).toFixed(1)}%</span>
            )}
            {achievedAt && (
              <span className="inline-flex items-center gap-1 text-emerald-400/80">
                <Check className="h-2.5 w-2.5" /> Conquistada em {fmtDate(achievedAt)}
              </span>
            )}
          </div>
          {p.description && <p className="text-[10px] text-white/40 mt-1">{p.description}</p>}
          {p.benefits && <p className="text-[10px] text-emerald-400/70 mt-0.5">🎁 {p.benefits}</p>}
        </div>
        {p.required_revenue > 0 && (
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] text-white/40">progresso</p>
            <p className="text-xs font-bold text-white">{Math.min(100, Math.round((qualifying / p.required_revenue) * 100))}%</p>
          </div>
        )}
      </div>
    </button>

  );
}

export default ConstructorsCareerTab;
