import { useEffect, useState } from "react";
import { Loader2, Medal, Trophy, Lock, Crown, Users, TrendingUp } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getIndividualCareer, type IndividualCareer, type MedalRule } from "@/lib/coach-medals.functions";
import { getCareerProgress, type CareerProgress } from "@/lib/coach-career.functions";
import { AchievementMembersModal } from "@/components/coach/AchievementMembersModal";


const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const TIER_COLOR: Record<string, string> = {
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#FFD700",
  platinum: "#E5E4E2",
  crown: "#FFB300",
  club: "#FF6B35",
};

export function IndividualCareerTab() {
  const fetchData = useServerFn(getIndividualCareer);
  const fetchCareer = useServerFn(getCareerProgress);
  const [data, setData] = useState<IndividualCareer | null>(null);
  const [career, setCareer] = useState<CareerProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<
    | { kind: "patent"; key: string; title: string; subtitle?: string; color: string }
    | { kind: "medal_monthly" | "medal_cumulative"; key: string; title: string; subtitle?: string; color: string }
    | null
  >(null);

  useEffect(() => {
    let active = true;
    Promise.all([fetchData(), fetchCareer().catch(() => null)])
      .then(([r, c]) => { if (active) { setData(r); setCareer(c); } })
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
  if (!data) {
    return (
      <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: "#1A1A1A" }}>
        <Medal className="h-10 w-10 text-white/10 mx-auto mb-2" />
        <p className="text-sm text-white/40">Dados indisponíveis no momento.</p>
      </div>
    );
  }

  const { vpThisMonth, vpLifetime, monthlyRules, cumulativeRules, earned, currentMonth } = data;

  const monthlyHistory = earned.filter(
    (e) => e.medal_kind === "monthly" && !(e.period_year === currentMonth.year && e.period_month === currentMonth.month),
  );
  // referenced above via inline lookups


  return (
    <>
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-wider text-primary font-bold mb-1">Hall da Fama FitMind</p>
        <h1 className="text-2xl font-bold text-white">Produção Individual</h1>
        <p className="text-sm text-white/50">Reconhecimento pela sua produção pessoal (VP)</p>
      </div>

      {/* VP summary */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">VP do mês atual</p>
          <p className="text-xl font-bold text-white">{fmtBRL(vpThisMonth)}</p>
        </div>
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">VP acumulado</p>
          <p className="text-xl font-bold text-white">{fmtBRL(vpLifetime)}</p>
        </div>
      </div>

      {/* Patente atual + próxima — espelhando Ordem dos Construtores */}
      {career && (
        <CurrentPatentPanel
          career={career}
          onOpen={(key, title, color) =>
            setModal({ kind: "patent", key, title, subtitle: "Patente atual", color })
          }
        />
      )}


      {/* Ordem da Excelência — monthly medals */}
      <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-4">
          <h3 className="text-sm font-bold text-white">Ordem da Excelência FitMind</h3>
          <p className="text-[11px] text-white/40">Medalhas conquistadas pela produção pessoal em um único mês</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {monthlyRules.map((r) => {
            const e = earned.find(
              (x) => x.medal_kind === "monthly" && x.medal_key === r.key && x.period_year === currentMonth.year && x.period_month === currentMonth.month,
            );
            return (
              <MedalCard
                key={r.id}
                rule={r}
                current={vpThisMonth}
                earned={!!e}
                awardedAt={e?.awarded_at ?? null}
                onClick={() => setModal({ kind: "medal_monthly", key: r.key, title: r.display_name, subtitle: "Ordem da Excelência (mês atual)", color: TIER_COLOR[r.tier || ""] || "#CD7F32" })}
              />
            );

          })}
        </div>
      </div>

      {/* Clube dos Campeões — cumulative */}
      <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-4">
          <h3 className="text-sm font-bold text-white">Clube dos Campeões FitMind</h3>
          <p className="text-[11px] text-white/40">Marcos históricos de produção acumulada na carreira</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {cumulativeRules.map((r) => {
            const e = earned.find((x) => x.medal_kind === "cumulative" && x.medal_key === r.key);
            return (
              <MedalCard
                key={r.id}
                rule={r}
                current={vpLifetime}
                earned={!!e}
                awardedAt={e?.awarded_at ?? null}
              />
            );
          })}
        </div>
      </div>

      {/* Monthly history */}
      {monthlyHistory.length > 0 && (
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <h3 className="text-sm font-bold text-white mb-3">Histórico de medalhas mensais</h3>
          <div className="space-y-1.5">
            {monthlyHistory.map((e, i) => {
              const r = monthlyRules.find((x) => x.key === e.medal_key);
              return (
                <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: "#0F0F0F" }}>
                  <div className="flex items-center gap-2">
                    <Medal className="h-4 w-4" style={{ color: TIER_COLOR[r?.tier || "bronze"] || "#CD7F32" }} />
                    <span className="text-xs text-white">{r?.display_name || e.medal_key}</span>
                  </div>
                  <span className="text-[10px] text-white/40">
                    {String(e.period_month).padStart(2, "0")}/{e.period_year} · {fmtBRL(e.vp_amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function MedalCard({ rule, current, earned, awardedAt }: { rule: MedalRule; current: number; earned: boolean; awardedAt: string | null }) {
  const color = TIER_COLOR[rule.tier || ""] || "#CD7F32";
  const pct = rule.threshold > 0 ? Math.min((current / rule.threshold) * 100, 100) : 0;
  const Icon = rule.icon === "crown" ? Crown : rule.icon === "trophy" ? Trophy : Medal;
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <div
      className={`rounded-xl p-3 ${earned ? "ring-1" : ""}`}
      style={{ backgroundColor: "#0F0F0F", borderColor: color, boxShadow: earned ? `0 0 0 1px ${color}55` : undefined }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
          style={{ backgroundColor: `${color}25`, border: `1px solid ${color}55` }}
        >
          {earned ? <Icon className="h-5 w-5" style={{ color }} /> : <Lock className="h-4 w-4 text-white/30" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold" style={{ color: earned ? color : "#fff" }}>{rule.display_name}</span>
            {earned ? (
              <span className="text-[9px] font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: `${color}25`, color }}>
                CONQUISTADA
              </span>
            ) : (
              <span className="text-[9px] font-bold rounded-full px-2 py-0.5 bg-white/5 text-white/40">BLOQUEADA</span>
            )}
          </div>
          <p className="text-[10px] text-white/40">{fmtBRL(rule.threshold)}</p>
          <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ backgroundColor: "#252525" }}>
            <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
          </div>
          {earned && awardedAt && (
            <p className="text-[10px] mt-1" style={{ color }}>Conquistada em {fmtDate(awardedAt)}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default IndividualCareerTab;
