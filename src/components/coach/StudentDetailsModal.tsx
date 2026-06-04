import { useEffect, useState } from "react";
import { X, Cake, ExternalLink, Loader2, ShoppingBag, Activity, ClipboardList, TrendingUp, Crown, CalendarCheck, Coins, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { createAssessmentShare } from "@/lib/assessment-share.functions";
import { useServerFn } from "@tanstack/react-start";
import { getStudentAttendanceDetail, type StudentCheckin, type StudentPurchase } from "@/lib/coach-attendance.functions";
import { WindowMethod } from "@/components/student/WindowMethod";
import { WindowMethodHistory } from "@/components/student/WindowMethodHistory";

type Tab = "resumo" | "frequencia" | "avaliacoes" | "anamnese" | "evolucao" | "compras" | "janelas";

interface Props {
  studentId: string;
  onClose: () => void;
  initialTab?: Tab;
}

type Profile = { name: string; email: string; phone: string | null; birthdate: string | null; city: string | null; state: string | null };
type SubRow = { id: string; status: string; start_date: string; end_date: string; products: { id: string; name: string; price: number | null } | null };
type TxRow = { id: string; gross_amount: number; status: string; paid_at: string | null; created_at: string; products: { name: string } | null };
type BodyAssess = { id: string; assessment_date: string; weight: number | null; body_fat: number | null; muscle_mass: number | null; skeletal_muscle: number | null; basal_metabolism: number | null; bmi: number | null; client_notes: string | null; professional_notes: string | null };
type BioRow = { id: string; evaluation_date: string; evaluation_type: string; weight: number | null; fat_percentage: number | null; muscle_percentage: number | null };
type AnamRow = {
  id: string;
  filled_at: string | null;
  objective: string | null;
  confirmed_at: string | null;
  gender: string | null;
  height: number | null;
  protocol_reason: string | null;
  preexisting_conditions: string | null;
  current_medications: string | null;
  food_allergies: string | null;
  sleep_hours: string | null;
  stress_level: string | null;
  exercises_regularly: boolean | null;
  additional_observations: string | null;
  blood_type: string | null;
  food_intolerances: string | null;
  has_diabetes: boolean | null;
  has_hypertension: boolean | null;
  has_cardiopathy: boolean | null;
  other_chronic_conditions: string | null;
  surgical_history: string | null;
  supplements_used: string | null;
};
type WeightRow = { id: string; log_date: string; weight: number; waist_cm: number | null; hip_cm: number | null };
type PhotoRow = { id: string; photo_url: string; photo_date: string; caption: string | null };

const fmtBR = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
const fmtBRLong = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "—";
const money = (v: number | null | undefined) => v != null ? `R$ ${Number(v).toFixed(2).replace(".", ",")}` : "—";

function calcAge(birth: string | null) {
  if (!birth) return null;
  const b = new Date(birth);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export default function StudentDetailsModal({ studentId, onClose, initialTab = "resumo" }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const fetchAttendance = useServerFn(getStudentAttendanceDetail);
  const [attData, setAttData] = useState<{ checkins: StudentCheckin[]; purchases: StudentPurchase[]; last_sign_in_at: string | null } | null>(null);
  const [attLoading, setAttLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [bodyAssess, setBodyAssess] = useState<BodyAssess[]>([]);
  const [bios, setBios] = useState<BioRow[]>([]);
  const [anams, setAnams] = useState<AnamRow[]>([]);
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [sharing, setSharing] = useState(false);
  const [tokenStats, setTokenStats] = useState<{ balance: number; earned: number; consumed: number }>({ balance: 0, earned: 0, consumed: 0 });
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [showProNotes, setShowProNotes] = useState<Set<string>>(new Set());
  const [classifications, setClassifications] = useState<string[]>([]);


  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: student } = await supabase
        .from("students")
        .select("profile_id, profiles!students_profile_id_fkey(name,email,phone,birthdate,city,state)")
        .eq("id", studentId)
        .maybeSingle();
      setProfile(((student as unknown as { profiles: Profile })?.profiles) || null);

      const [subRes, txRes, bodyRes, bioRes, anamRes, wRes, pRes] = await Promise.all([
        supabase.from("subscriptions").select("id,status,start_date,end_date,products!subscriptions_product_id_fkey(id,name,price)").eq("student_id", studentId).order("end_date", { ascending: false }),
        supabase.from("transactions").select("id,gross_amount,status,paid_at,created_at,products!transactions_product_id_fkey(name)").eq("student_id", studentId).order("created_at", { ascending: false }).limit(50),
        supabase.from("coach_body_assessments").select("id,assessment_date,weight,body_fat,muscle_mass,skeletal_muscle,basal_metabolism,bmi,client_notes,professional_notes").eq("student_id", studentId).order("assessment_date", { ascending: false }),
        supabase.from("bioimpedance_evaluations").select("id,evaluation_date,evaluation_type,weight,fat_percentage,muscle_percentage").eq("student_id", studentId).order("evaluation_date", { ascending: false }),
        supabase.from("anamnesis_forms").select("id,filled_at,objective,confirmed_at,gender,height,protocol_reason,preexisting_conditions,current_medications,food_allergies,sleep_hours,stress_level,exercises_regularly,additional_observations,blood_type,food_intolerances,has_diabetes,has_hypertension,has_cardiopathy,other_chronic_conditions,surgical_history,supplements_used").eq("student_id", studentId).order("filled_at", { ascending: false }),
        supabase.from("weight_logs").select("id,log_date,weight,waist_cm,hip_cm").eq("student_id", studentId).order("log_date", { ascending: false }).limit(60),
        supabase.from("evolution_photos").select("id,photo_url,photo_date,caption").eq("student_id", studentId).order("photo_date", { ascending: false }).limit(24),
      ]);
      setSubs(((subRes.data || []) as unknown) as SubRow[]);
      setTxs(((txRes.data || []) as unknown) as TxRow[]);
      setBodyAssess(((bodyRes.data || []) as unknown) as BodyAssess[]);
      setBios(((bioRes.data || []) as unknown) as BioRow[]);
      setAnams(((anamRes.data || []) as unknown) as AnamRow[]);
      setWeights(((wRes.data || []) as unknown) as WeightRow[]);
      setPhotos(((pRes.data || []) as unknown) as PhotoRow[]);

      // Saldo de moedas de desafio
      try {
        const { data: toks } = await supabase
          .from("student_challenge_tokens")
          .select("id, consumed_at")
          .eq("student_id", studentId);
        const rows = (toks as { id: string; consumed_at: string | null }[] | null) || [];
        const consumed = rows.filter((r) => !!r.consumed_at).length;
        setTokenStats({ earned: rows.length, consumed, balance: rows.length - consumed });
      } catch (e) { console.warn("tokens fetch failed", e); }

      setLoading(false);
    })();
  }, [studentId]);

  const age = calcAge(profile?.birthdate || null);
  const activePaidSubs = subs.filter((s) => s.status === "active");
  const mostExpensivePlan = activePaidSubs
    .filter((s) => s.products?.price != null)
    .sort((a, b) => (Number(b.products?.price) || 0) - (Number(a.products?.price) || 0))[0]?.products || null;
  const paidTxs = txs.filter((t) => t.status === "paid");
  const totalSpent = paidTxs.reduce((sum, t) => sum + Number(t.gross_amount || 0), 0);
  const lastBodyAssess = bodyAssess[0] || null;
  const lastBio = bios[0] || null;
  const lastAnam = anams[0] || null;

  const openLastAssessment = async () => {
    if (!lastBodyAssess) {
      toast.error("Sem avaliação cadastrada");
      return;
    }
    setSharing(true);
    try {
      const res = await createAssessmentShare({ data: { assessmentId: lastBodyAssess.id, clientName: profile?.name || "Aluno" } });
      window.open(`/resultado/${res.token}`, "_blank");
    } catch (e) {
      toast.error((e as Error).message || "Erro ao abrir avaliação");
    } finally {
      setSharing(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof Activity }[] = [
    { id: "resumo", label: "Resumo", icon: Crown },
    { id: "frequencia", label: "Frequência", icon: CalendarCheck },
    { id: "avaliacoes", label: "Avaliações", icon: Activity },
    { id: "anamnese", label: "Anamnese", icon: ClipboardList },
    { id: "janelas", label: "Janelas", icon: ClipboardList },
    { id: "evolucao", label: "Evolução", icon: TrendingUp },
    { id: "compras", label: "Compras", icon: ShoppingBag },
  ];

  // Lazy-load attendance detail when tab opens
  useEffect(() => {
    if (tab !== "frequencia" || attData || attLoading) return;
    setAttLoading(true);
    fetchAttendance({ data: { studentId } })
      .then((d) => setAttData(d))
      .catch((e) => toast.error((e as Error).message || "Erro ao carregar frequência"))
      .finally(() => setAttLoading(false));
  }, [tab, attData, attLoading, fetchAttendance, studentId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div className="flex w-full max-w-3xl flex-col rounded-2xl border border-white/10 max-h-[92vh] overflow-hidden" style={{ backgroundColor: "#141414" }} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b border-white/5 p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-white">{profile?.name || "Aluno"}</h2>
            <p className="truncate text-xs text-white/50">{profile?.email || "—"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/60">
              {profile?.birthdate && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5">
                  <Cake className="h-3 w-3" /> {fmtBR(profile.birthdate)} {age != null && `· ${age}a`}
                </span>
              )}
              {profile?.city && <span className="rounded-full bg-white/5 px-2 py-0.5">{profile.city}/{profile.state || ""}</span>}
              <WhatsAppButton phone={profile?.phone} size="sm" message={`Olá ${profile?.name?.split(" ")[0] || ""}!`} />
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-white/60 hover:bg-white/5"><X className="h-4 w-4" /></button>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-white/5 px-2 py-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${tab === t.id ? "bg-primary text-primary-foreground" : "text-white/60 hover:bg-white/5"}`}>
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-white/50" /></div>
          ) : tab === "resumo" ? (
            <div className="space-y-3">
              <Card title="Plano ativo de maior valor" icon={<Crown className="h-4 w-4 text-primary" />}>
                {mostExpensivePlan ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-white">{mostExpensivePlan.name}</p>
                    <p className="text-sm font-bold text-primary">{money(mostExpensivePlan.price)}</p>
                  </div>
                ) : <p className="text-xs text-white/40">Nenhum plano ativo.</p>}
              </Card>

              <Card title="Última avaliação física" icon={<Activity className="h-4 w-4 text-primary" />}>
                {lastBodyAssess ? (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-white">{fmtBRLong(lastBodyAssess.assessment_date)}</p>
                      <button onClick={openLastAssessment} disabled={sharing} className="inline-flex items-center gap-1 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/25 disabled:opacity-50">
                        {sharing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />} Abrir avaliação
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                      <Mini label="Peso" value={lastBodyAssess.weight ? `${lastBodyAssess.weight}kg` : "—"} />
                      <Mini label="IMC" value={lastBodyAssess.bmi ? Number(lastBodyAssess.bmi).toFixed(1) : "—"} />
                      <Mini label="% Gordura" value={lastBodyAssess.body_fat ? `${lastBodyAssess.body_fat}%` : "—"} />
                      <Mini label="Músc. Esquelético" value={lastBodyAssess.skeletal_muscle != null ? `${lastBodyAssess.skeletal_muscle}%` : (lastBodyAssess.muscle_mass ? `${lastBodyAssess.muscle_mass}kg` : "—")} />
                    </div>
                  </div>
                ) : <p className="text-xs text-white/40">Sem avaliação registrada.</p>}
              </Card>

              <Card title="Anamnese mais recente" icon={<ClipboardList className="h-4 w-4 text-primary" />}>
                {lastAnam ? (
                  <p className="text-sm text-white/80">{fmtBR(lastAnam.filled_at)} {lastAnam.objective && `· ${lastAnam.objective}`} {lastAnam.confirmed_at && <span className="ml-1 rounded bg-success/15 px-1.5 py-0.5 text-[10px] text-success">assinada</span>}</p>
                ) : <p className="text-xs text-white/40">Nenhuma anamnese preenchida.</p>}
              </Card>

              <Card title="Moedas de Desafio" icon={<Coins className="h-4 w-4 text-primary" />}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-white/50">Cada moeda = 1 entrada em 1 desafio</p>
                    <p className="text-[10px] text-white/40">Ganhas: {tokenStats.earned} · Usadas: {tokenStats.consumed}</p>
                  </div>
                  <p className="text-2xl font-bold text-primary">{tokenStats.balance}</p>
                </div>
              </Card>

              <Card title="Compras pagas" icon={<ShoppingBag className="h-4 w-4 text-primary" />}>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white/80">{paidTxs.length} compras</p>
                  <p className="text-sm font-bold text-white">Total {money(totalSpent)}</p>
                </div>
              </Card>
            </div>
          ) : tab === "frequencia" ? (
            attLoading || !attData ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-white/50" /></div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <Mini label="Último acesso" value={attData.last_sign_in_at ? fmtBR(attData.last_sign_in_at) : "—"} />
                  <Mini label="Check-ins (180d)" value={String(attData.checkins.length)} />
                  <Mini label="Compras pagas (180d)" value={String(attData.purchases.length)} />
                </div>
                <div>
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-white/40">Histórico de check-ins</p>
                  {attData.checkins.length === 0 ? (
                    <p className="text-xs text-white/40">Nenhum check-in registrado nos últimos 180 dias.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {attData.checkins.map((c) => (
                        <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 p-2" style={{ backgroundColor: "#0F0F0F" }}>
                          <div className="min-w-0 flex items-center gap-2">
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${c.source === "freebie" ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                              {c.source === "freebie" ? "Gratuito" : "App"}
                            </span>
                            <p className="truncate text-xs text-white/80">{c.label}</p>
                          </div>
                          <p className="shrink-0 text-[11px] text-white/50">{fmtBR(c.at)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-white/40">Linha do tempo de compras pagas</p>
                  {attData.purchases.length === 0 ? (
                    <p className="text-xs text-white/40">Nenhuma compra paga registrada nos últimos 180 dias.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {attData.purchases.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 p-2" style={{ backgroundColor: "#0F0F0F" }}>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-white">{p.label}</p>
                            <p className="text-[10px] text-white/40">{fmtBR(p.at)} {p.method && `· ${p.method}`}</p>
                          </div>
                          <p className="shrink-0 text-sm font-bold text-white">{money(p.amount)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          ) : tab === "avaliacoes" ? (
            <div className="space-y-2">
              {bodyAssess.length === 0 && bios.length === 0 ? (
                <p className="py-6 text-center text-xs text-white/40">Nenhuma avaliação registrada.</p>
              ) : (
                <>
                  {bodyAssess.length > 0 && (
                    <div>
                      <p className="mb-2 text-[10px] uppercase tracking-wide text-white/40">FitMindShape / Bioimpedância (coach)</p>
                      <div className="space-y-2">
                        {bodyAssess.map((a) => (
                          <div key={a.id} className="rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-bold text-white">{fmtBRLong(a.assessment_date)}</p>
                              <button onClick={async () => {
                                setSharing(true);
                                try {
                                  const r = await createAssessmentShare({ data: { assessmentId: a.id, clientName: profile?.name || "Aluno" } });
                                  window.open(`/resultado/${r.token}`, "_blank");
                                } catch (e) { toast.error((e as Error).message); } finally { setSharing(false); }
                              }} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
                                <ExternalLink className="h-3 w-3" /> Abrir
                              </button>
                            </div>
                            <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                              <Mini label="Peso" value={a.weight ? `${a.weight}kg` : "—"} />
                              <Mini label="IMC" value={a.bmi ? Number(a.bmi).toFixed(1) : "—"} />
                              <Mini label="% Gord" value={a.body_fat ? `${a.body_fat}%` : "—"} />
                              <Mini label="Músc. Esq." value={a.skeletal_muscle != null ? `${a.skeletal_muscle}%` : (a.muscle_mass ? `${a.muscle_mass}kg` : "—")} />
                            </div>
                            {(a.client_notes || a.professional_notes) && (() => {
                              const isOpen = expandedNotes.has(a.id);
                              const showPro = showProNotes.has(a.id);
                              return (
                                <div className="mt-2">
                                  <button
                                    onClick={() => setExpandedNotes((prev) => { const n = new Set(prev); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-white/60 hover:text-white"
                                  >
                                    {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Observações
                                  </button>
                                  {isOpen && (
                                    <div className="mt-2 space-y-2">
                                      {a.client_notes && (
                                        <div className="rounded-lg border border-white/5 bg-black/30 p-2">
                                          <p className="mb-1 text-[10px] uppercase tracking-wide text-white/40">Para o aluno</p>
                                          <p className="whitespace-pre-wrap text-xs text-white/80">{a.client_notes}</p>
                                        </div>
                                      )}
                                      {a.professional_notes && (
                                        <div className="rounded-lg border border-white/5 bg-black/30 p-2">
                                          <div className="mb-1 flex items-center justify-between gap-2">
                                            <p className="text-[10px] uppercase tracking-wide text-white/40">Do profissional</p>
                                            <button
                                              onClick={() => setShowProNotes((prev) => { const n = new Set(prev); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })}
                                              className="text-white/60 hover:text-white"
                                              aria-label={showPro ? "Ocultar" : "Mostrar"}
                                            >
                                              {showPro ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                            </button>
                                          </div>
                                          <p
                                            className="whitespace-pre-wrap text-xs text-white/80 transition-[filter]"
                                            style={{ filter: showPro ? "none" : "blur(4px)", userSelect: showPro ? "auto" : "none" }}
                                          >
                                            {a.professional_notes}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {bios.length > 0 && (
                    <div className="pt-2">
                      <p className="mb-2 text-[10px] uppercase tracking-wide text-white/40">Bioimpedância (legado)</p>
                      <div className="space-y-2">
                        {bios.map((b) => (
                          <div key={b.id} className="rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
                            <p className="text-sm text-white">{fmtBR(b.evaluation_date)} <span className="ml-1 text-[10px] text-white/40">{b.evaluation_type}</span></p>
                            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                              <Mini label="Peso" value={b.weight ? `${b.weight}kg` : "—"} />
                              <Mini label="% Gord" value={b.fat_percentage ? `${b.fat_percentage}%` : "—"} />
                              <Mini label="% Músc" value={b.muscle_percentage ? `${b.muscle_percentage}%` : "—"} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : tab === "anamnese" ? (
            <div className="space-y-3">
              {anams.length === 0 ? (
                <p className="py-6 text-center text-xs text-white/40">Nenhuma anamnese.</p>
              ) : anams.map((a, idx) => (
                <div key={a.id} className="rounded-xl border border-white/5 p-3 space-y-3" style={{ backgroundColor: "#0F0F0F" }}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">{fmtBRLong(a.filled_at)}</p>
                    {a.confirmed_at && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">Assinada</span>}
                  </div>

                  {idx === 0 && (a.has_diabetes || a.has_hypertension || a.has_cardiopathy || a.other_chronic_conditions) && (
                    <div className="flex flex-wrap gap-1.5">
                      {a.has_diabetes && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">Diabetes</span>}
                      {a.has_hypertension && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">Hipertensão</span>}
                      {a.has_cardiopathy && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">Cardiopatia</span>}
                      {a.other_chronic_conditions && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">{a.other_chronic_conditions}</span>}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Info label="Objetivo" value={a.objective || a.protocol_reason} />
                    <Info label="Gênero" value={a.gender} />
                    <Info label="Tipo sanguíneo" value={a.blood_type} />
                    <Info label="Altura" value={a.height ? `${a.height} cm` : null} />
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-xs">
                    <Info label="Alergias alimentares" value={a.food_allergies} />
                    <Info label="Intolerâncias alimentares" value={a.food_intolerances} />
                    <Info label="Condições preexistentes" value={a.preexisting_conditions} />
                    <Info label="Medicamentos contínuos" value={a.current_medications} />
                    <Info label="Suplementos em uso" value={a.supplements_used} />
                    <Info label="Histórico cirúrgico" value={a.surgical_history} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Info label="Sono" value={a.sleep_hours} />
                    <Info label="Estresse" value={a.stress_level} />
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-xs">
                    <Info label="Pratica exercícios" value={a.exercises_regularly == null ? null : a.exercises_regularly ? "Sim" : "Não"} />
                    <Info label="Observações" value={a.additional_observations} />
                  </div>

                  <p className="text-[10px] text-white/30">Dados sigilosos médicos não aparecem aqui — apenas para médicos autorizados.</p>
                </div>
              ))}
            </div>
          ) : tab === "janelas" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-bold text-primary mb-1">Método das Janelas — Registro do dia</p>
                <p className="text-[11px] text-white/60">Preencha o registro de hoje. Ele fica vinculado automaticamente ao protocolo do aluno (Meu Protocolo → Método das Janelas).</p>
              </div>
              <WindowMethod studentId={studentId} hideExplanation />
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-wide text-white/40">Histórico</p>
                <WindowMethodHistory studentId={studentId} />
              </div>
            </div>
          ) : tab === "evolucao" ? (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-wide text-white/40">Histórico de peso</p>
                {weights.length === 0 ? (
                  <p className="text-xs text-white/40">Sem registros.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/5">
                    <table className="w-full text-xs">
                      <thead className="bg-white/5 text-left text-white/50">
                        <tr><th className="p-2">Data</th><th className="p-2">Peso</th><th className="p-2">Cintura</th><th className="p-2">Quadril</th></tr>
                      </thead>
                      <tbody>
                        {weights.map((w) => (
                          <tr key={w.id} className="border-t border-white/5 text-white/80"><td className="p-2">{fmtBR(w.log_date)}</td><td className="p-2">{w.weight} kg</td><td className="p-2">{w.waist_cm ? `${w.waist_cm}cm` : "—"}</td><td className="p-2">{w.hip_cm ? `${w.hip_cm}cm` : "—"}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-wide text-white/40">Fotos de evolução</p>
                {photos.length === 0 ? (
                  <p className="text-xs text-white/40">Aluno ainda não enviou fotos.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((p) => (
                      <a key={p.id} href={p.photo_url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-lg border border-white/5">
                        <img src={p.photo_url} alt={p.caption || ""} loading="lazy" className="aspect-square w-full object-cover transition group-hover:scale-105" />
                        <p className="bg-black/50 p-1 text-center text-[10px] text-white/70">{fmtBR(p.photo_date)}</p>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {txs.length === 0 ? (
                <p className="py-6 text-center text-xs text-white/40">Nenhuma compra registrada.</p>
              ) : txs.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{t.products?.name || "Compra"}</p>
                    <p className="text-[11px] text-white/45">{fmtBR(t.paid_at || t.created_at)} · <span className={t.status === "paid" ? "text-success" : "text-white/40"}>{t.status}</span></p>
                  </div>
                  <p className="text-sm font-bold text-white">{money(t.gross_amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/50">{icon} {title}</p>
      {children}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-2">
      <p className="text-white/40">{label}</p>
      <p className="font-bold text-white">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="rounded-lg bg-white/5 p-2">
      <p className="text-[10px] uppercase tracking-wide text-white/40">{label}</p>
      <p className="text-xs text-white">{value}</p>
    </div>
  );
}
