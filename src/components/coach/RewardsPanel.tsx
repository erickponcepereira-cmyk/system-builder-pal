import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Trophy, Plane, Utensils, Eye, EyeOff, Loader2, X, Sparkles, Calendar, CheckCircle2 } from "lucide-react";
import { getCoachRewards, getRewardContributions, type RewardPlan, type RewardContribution } from "@/lib/coach-rewards.functions";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
const fmtMoney = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function planIcon(plan: RewardPlan) {
  return plan.planType === "monthly_challenge" ? Utensils : Plane;
}

export function RewardsPanel() {
  const fetchRewards = useServerFn(getCoachRewards);
  const [rewards, setRewards] = useState<RewardPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [selected, setSelected] = useState<RewardPlan | null>(null);

  useEffect(() => {
    let active = true;
    fetchRewards()
      .then((res) => { if (active) setRewards(res); })
      .catch(() => { if (active) setRewards([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-white/30" />
        </div>
      </div>
    );
  }

  if (rewards.length === 0) return null;

  return (
    <>
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-white">Premiações</h3>
          </div>
          <button
            onClick={() => setReveal((v) => !v)}
            className="rounded-lg bg-white/5 p-2 text-white/60 hover:bg-white/10 hover:text-white"
            title={reveal ? "Ocultar progresso" : "Mostrar progresso"}
          >
            {reveal ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {rewards.map((r) => {
            const Icon = planIcon(r);
            const pct = Math.round(r.pctComplete);
            const accent = r.planType === "monthly_challenge" ? "#F59E0B" : "#22D3EE";
            return (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className="group relative overflow-hidden rounded-2xl p-4 text-left transition-transform hover:scale-[1.01]"
                style={{ backgroundColor: "#0F0F0F", border: `1px solid ${accent}30` }}
              >
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20" style={{ backgroundColor: accent }} />
                <div className="relative">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${accent}25`, border: `1px solid ${accent}55` }}>
                      <Icon className="h-5 w-5" style={{ color: accent }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-white/40">
                        {r.planType === "monthly_challenge" ? "Mensal" : `${r.durationMonths} meses`}
                      </p>
                      <p className="truncate text-sm font-bold text-white">{r.name}</p>
                    </div>
                    {r.achieved && (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> OK
                      </span>
                    )}
                  </div>

                  {r.rewardDescription && (
                    <p className="mb-3 line-clamp-2 text-[11px] text-white/60">🎁 {r.rewardDescription}</p>
                  )}

                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-white/60">Progresso</span>
                    <span className="font-bold text-white font-mono">
                      {reveal ? `${r.currentPoints} / ${r.targetPoints} pts` : "•••"}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: "#252525" }}>
                    <div
                      className="h-full transition-all"
                      style={{ width: `${reveal ? pct : 0}%`, background: `linear-gradient(90deg, ${accent}, ${accent}aa)` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-white/40">
                    {reveal ? `${pct}% concluído` : "Toque no olho para revelar"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && <RewardDetailsModal planId={selected.id} initial={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function RewardDetailsModal({ planId, initial, onClose }: { planId: string; initial: RewardPlan; onClose: () => void }) {
  const fetchDetails = useServerFn(getRewardContributions);
  const [plan, setPlan] = useState<RewardPlan>(initial);
  const [contribs, setContribs] = useState<RewardContribution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchDetails({ data: { planId } })
      .then((res) => { if (!active) return; if (res.plan) setPlan(res.plan); setContribs(res.contributions); })
      .catch(() => { if (active) setContribs([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [planId]);

  const Icon = planIcon(plan);
  const accent = plan.planType === "monthly_challenge" ? "#F59E0B" : "#22D3EE";
  const pct = Math.round(plan.pctComplete);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/10" style={{ backgroundColor: "#0F0F0F" }}>
        <div className="relative p-5">
          <button onClick={onClose} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: `${accent}25`, border: `1px solid ${accent}55` }}>
              <Icon className="h-6 w-6" style={{ color: accent }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider font-bold text-white/40">
                {plan.planType === "monthly_challenge" ? "Premiação mensal" : `Premiação · ${plan.durationMonths} meses`}
              </p>
              <h2 className="truncate text-lg font-bold text-white">{plan.name}</h2>
            </div>
          </div>

          {plan.rewardDescription && (
            <div className="mb-4 rounded-xl p-3" style={{ backgroundColor: `${accent}10`, border: `1px solid ${accent}30` }}>
              <p className="flex items-center gap-2 text-sm font-bold text-white"><Sparkles className="h-4 w-4" style={{ color: accent }} /> {plan.rewardDescription}</p>
              {plan.rewardDetails && <p className="mt-1 text-xs text-white/60">{plan.rewardDetails}</p>}
              
            </div>
          )}

          <div className="mb-4 rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-white/60">Seu progresso</span>
              <span className="font-bold text-white font-mono">{plan.currentPoints} / {plan.targetPoints} pts</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: "#252525" }}>
              <div className="h-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}, ${accent}aa)` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-white/40">
              <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(plan.periodStartIso)} → {fmtDate(plan.periodEndIso)}</span>
              <span>{pct}%</span>
            </div>
          </div>

          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-white/50">Vendas que contribuíram</h3>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-white/30" /></div>
          ) : contribs.length === 0 ? (
            <p className="rounded-xl p-4 text-center text-xs text-white/40" style={{ backgroundColor: "#1A1A1A" }}>Nenhuma venda pontuou nesse período ainda.</p>
          ) : (
            <div className="space-y-2">
              {contribs.map((c) => (
                <div key={c.id} className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{c.productName || c.reason || "Pontuação"}</p>
                      <p className="text-[11px] text-white/50">
                        {new Date(c.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {c.studentName ? ` · ${c.studentName}` : ""}
                        {c.grossAmount != null ? ` · ${fmtMoney(c.grossAmount)}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: `${accent}20`, color: accent }}>
                      +{c.points} pts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RewardsPanel;
