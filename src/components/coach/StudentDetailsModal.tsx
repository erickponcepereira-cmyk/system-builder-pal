import { useEffect, useState } from "react";
import { X, Cake, ExternalLink, Loader2, ShoppingBag, Activity, ClipboardList, TrendingUp, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { createAssessmentShare } from "@/lib/assessment-share.functions";

type Tab = "resumo" | "avaliacoes" | "anamnese" | "evolucao" | "compras";

interface Props {
  studentId: string;
  onClose: () => void;
}

type Profile = { name: string; email: string; phone: string | null; birthdate: string | null; city: string | null; state: string | null };
type SubRow = { id: string; status: string; start_date: string; end_date: string; products: { id: string; name: string; price: number | null } | null };
type TxRow = { id: string; gross_amount: number; status: string; paid_at: string | null; created_at: string; products: { name: string } | null };
type BodyAssess = { id: string; assessment_date: string; weight: number | null; body_fat: number | null; muscle_mass: number | null; skeletal_muscle: number | null; basal_metabolism: number | null; bmi: number | null };
type BioRow = { id: string; evaluation_date: string; evaluation_type: string; weight: number | null; fat_percentage: number | null; muscle_percentage: number | null };
type AnamRow = { id: string; filled_at: string | null; objective: string | null; confirmed_at: string | null };
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

export default function StudentDetailsModal({ studentId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("resumo");
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
        supabase.from("coach_body_assessments").select("id,assessment_date,weight,body_fat,muscle_mass,basal_metabolism,bmi").eq("student_id", studentId).order("assessment_date", { ascending: false }),
        supabase.from("bioimpedance_evaluations").select("id,evaluation_date,evaluation_type,weight,fat_percentage,muscle_percentage").eq("student_id", studentId).order("evaluation_date", { ascending: false }),
        supabase.from("anamnesis_forms").select("id,filled_at,objective,confirmed_at").eq("student_id", studentId).order("filled_at", { ascending: false }),
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
    { id: "avaliacoes", label: "Avaliações", icon: Activity },
    { id: "anamnese", label: "Anamnese", icon: ClipboardList },
    { id: "evolucao", label: "Evolução", icon: TrendingUp },
    { id: "compras", label: "Compras", icon: ShoppingBag },
  ];

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
                      <Mini label="Músculo" value={lastBodyAssess.muscle_mass ? `${lastBodyAssess.muscle_mass}kg` : "—"} />
                    </div>
                  </div>
                ) : <p className="text-xs text-white/40">Sem avaliação registrada.</p>}
              </Card>

              <Card title="Anamnese mais recente" icon={<ClipboardList className="h-4 w-4 text-primary" />}>
                {lastAnam ? (
                  <p className="text-sm text-white/80">{fmtBR(lastAnam.filled_at)} {lastAnam.objective && `· ${lastAnam.objective}`} {lastAnam.confirmed_at && <span className="ml-1 rounded bg-success/15 px-1.5 py-0.5 text-[10px] text-success">assinada</span>}</p>
                ) : <p className="text-xs text-white/40">Nenhuma anamnese preenchida.</p>}
              </Card>

              <Card title="Compras pagas" icon={<ShoppingBag className="h-4 w-4 text-primary" />}>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white/80">{paidTxs.length} compras</p>
                  <p className="text-sm font-bold text-white">Total {money(totalSpent)}</p>
                </div>
              </Card>
            </div>
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
                              <Mini label="Músc" value={a.muscle_mass ? `${a.muscle_mass}kg` : "—"} />
                            </div>
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
            <div className="space-y-2">
              {anams.length === 0 ? (
                <p className="py-6 text-center text-xs text-white/40">Nenhuma anamnese.</p>
              ) : anams.map((a) => (
                <div key={a.id} className="rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">{fmtBRLong(a.filled_at)}</p>
                    {a.confirmed_at && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">Assinada</span>}
                  </div>
                  {a.objective && <p className="mt-1 text-xs text-white/60">Objetivo: <span className="text-white">{a.objective}</span></p>}
                </div>
              ))}
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
