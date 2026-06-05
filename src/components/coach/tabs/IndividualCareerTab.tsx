import { useEffect, useState } from "react";
import { Loader2, Medal, Trophy, Lock, Crown, Users, TrendingUp } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getIndividualCareer, type IndividualCareer, type MedalRule } from "@/lib/coach-medals.functions";
import { getCareerProgress, type CareerProgress } from "@/lib/coach-career.functions";
import { AchievementMembersModal } from "@/components/coach/AchievementMembersModal";
import { resolveBadgeUrl } from "@/lib/badge-url";


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

      {/* Medalha atual + próxima (mensal — Ordem da Excelência) */}
      <CurrentMedalPanel
        title="mensal"
        currentLabel="VP do mês"
        rules={data.monthlyRules}
        current={vpThisMonth}
        onOpen={(key, title, color) =>
          setModal({ kind: "medal_monthly", key, title, subtitle: "Ordem da Excelência (mês atual)", color })
        }
      />

      {/* Medalha atual + próxima (acumulado — Clube dos Campeões) */}
      <CurrentMedalPanel
        title="acumulado"
        currentLabel="VP acumulado"
        rules={data.cumulativeRules}
        current={vpLifetime}
        onOpen={(key, title, color) =>
          setModal({ kind: "medal_cumulative", key, title, subtitle: "Clube dos Campeões", color })
        }
      />




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
                onClick={() => setModal({ kind: "medal_cumulative", key: r.key, title: r.display_name, subtitle: "Clube dos Campeões", color: TIER_COLOR[r.tier || ""] || "#CD7F32" })}
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

      {modal && (
        <AchievementMembersModal
          open={!!modal}
          onClose={() => setModal(null)}
          kind={modal.kind}
          achievementKey={modal.key}
          title={modal.title}
          subtitle={modal.subtitle}
          accentColor={modal.color}
        />
      )}
    </>
  );
}


function MedalCard({ rule, current, earned, awardedAt, onClick }: { rule: MedalRule; current: number; earned: boolean; awardedAt: string | null; onClick?: () => void }) {
  const color = TIER_COLOR[rule.tier || ""] || "#CD7F32";
  const pct = rule.threshold > 0 ? Math.min((current / rule.threshold) * 100, 100) : 0;
  const Icon = rule.icon === "crown" ? Crown : rule.icon === "trophy" ? Trophy : Medal;
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl p-3 transition hover:bg-white/[0.03] ${earned ? "ring-1" : ""}`}
      style={{ backgroundColor: "#0F0F0F", borderColor: color, boxShadow: earned ? `0 0 0 1px ${color}55` : undefined }}
    >

      <div className="flex items-center gap-3">
        <div
          className="relative flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 overflow-hidden"
          style={{ backgroundColor: `${color}25`, border: `1px solid ${color}55` }}
        >
          {rule.image_url ? (
            <img
              src={resolveBadgeUrl(rule.image_url) || ""}
              alt={rule.display_name}
              className={`h-full w-full object-contain p-1 ${earned ? "" : "grayscale"}`}
            />
          ) : earned ? (
            <Icon className="h-5 w-5" style={{ color }} />
          ) : (
            <Lock className="h-4 w-4 text-white/30" />
          )}
          {!earned && rule.image_url && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Lock className="h-4 w-4 text-white/90" />
            </div>
          )}
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
          <p className="text-[10px] text-white/40">{fmtBRL(rule.threshold)} · {pct.toFixed(0)}% concluído</p>
          <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ backgroundColor: "#252525" }}>
            <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
          </div>
          {earned && awardedAt && (
            <p className="text-[10px] mt-1" style={{ color }}>Conquistada em {fmtDate(awardedAt)}</p>
          )}
        </div>
      </div>
    </button>
  );
}

function CurrentMedalPanel({
  rules,
  current,
  onOpen,
  title = "acumulado",
  currentLabel = "VP acumulado",
}: {
  rules: MedalRule[];
  current: number;
  onOpen: (key: string, title: string, color: string) => void;
  title?: string;
  currentLabel?: string;
}) {
  const sorted = [...rules].sort((a, b) => a.threshold - b.threshold);
  const earnedList = sorted.filter((r) => current >= r.threshold);
  const currentMedal = earnedList[earnedList.length - 1] ?? null;
  const nextMedal = sorted.find((r) => r.threshold > current) ?? null;
  const color = currentMedal ? (TIER_COLOR[currentMedal.tier || ""] || "#CD7F32") : "#9CA3AF";
  const nextColor = nextMedal ? (TIER_COLOR[nextMedal.tier || ""] || "#CD7F32") : "#FF4230";
  if (!currentMedal && !nextMedal) return null;




  const prevThreshold = currentMedal ? currentMedal.threshold : 0;
  const nextThreshold = nextMedal ? nextMedal.threshold : prevThreshold;
  const span = Math.max(1, nextThreshold - prevThreshold);
  const progressInSpan = Math.max(0, Math.min(span, current - prevThreshold));
  const pct = nextMedal ? (progressInSpan / span) * 100 : 100;
  const remaining = nextMedal ? Math.max(0, nextMedal.threshold - current) : 0;

  return (
    <>
      {currentMedal && (
        <button
          type="button"
          onClick={() => onOpen(currentMedal.key, currentMedal.display_name, color)}
          className="w-full text-left rounded-2xl p-5 mb-4 relative overflow-hidden transition hover:bg-white/[0.02]"
          style={{ backgroundColor: "#1A1A1A" }}
        >
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full" style={{ backgroundColor: `${color}20` }} />
          <div className="relative">
            <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Medalha atual ({title})</p>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl flex-shrink-0 overflow-hidden"
                style={{ backgroundColor: `${color}25`, border: `1px solid ${color}55` }}>
                {currentMedal.image_url ? (
                  <img src={currentMedal.image_url} alt={currentMedal.display_name} className="h-full w-full object-cover" />
                ) : (
                  <Medal className="h-7 w-7" style={{ color }} />
                )}
              </div>
              <div className="flex-1">
                <p className="text-xl font-bold text-white">{currentMedal.display_name}</p>
                <p className="text-xs text-white/50">{fmtBRL(currentMedal.threshold)} {title}</p>
              </div>
            </div>

          </div>
        </button>
      )}

      {nextMedal && (
        <div className="rounded-2xl p-5 mb-6" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Próxima medalha</p>
              <p className="text-base font-bold text-white">{nextMedal.display_name}</p>
            </div>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-bold"
              style={{ backgroundColor: `${nextColor}20`, color: nextColor }}>
              {pct.toFixed(0)}%
            </span>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-white/70">{currentLabel}</span>
              <span className="text-xs font-bold text-white">
                {fmtBRL(current)} / {fmtBRL(nextMedal.threshold)}
              </span>
            </div>

            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#252525" }}>
              <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: nextColor }} />
            </div>
            <p className="text-[11px] text-white/50 mt-2">
              Falta <span className="font-bold text-white">{fmtBRL(remaining)}</span> para conquistar.
            </p>
          </div>
        </div>
      )}
    </>
  );
}



export default IndividualCareerTab;
