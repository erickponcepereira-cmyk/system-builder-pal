import { useEffect, useState } from "react";
import { X, Cake, Loader2, Activity, ClipboardList, ShoppingBag, TrendingUp, EyeOff, ShieldCheck, FileText } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { getProfessionalStudentDetail, type ProfessionalStudentDetail } from "@/lib/professional-appointments.functions";

type Tab = "resumo" | "avaliacoes" | "anamnese" | "evolucao" | "compras" | "sigiloso";

type Props = {
  studentId: string;
  onClose: () => void;
};

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

export default function ProfessionalStudentDetailsModal({ studentId, onClose }: Props) {
  const fetchDetail = useServerFn(getProfessionalStudentDetail);
  const [tab, setTab] = useState<Tab>("resumo");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ProfessionalStudentDetail | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchDetail({ data: { studentId } })
      .then((data) => { if (alive) setDetail(data); })
      .catch((error) => toast.error((error as Error).message || "Erro ao carregar aluno"))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fetchDetail, studentId]);

  const profile = detail?.profile || null;
  const age = calcAge(profile?.birthdate || null);
  const activePaidSubs = (detail?.subs || []).filter((s) => s.status === "active");
  const topPlan = activePaidSubs
    .filter((s) => s.products?.price != null)
    .sort((a, b) => (Number(b.products?.price) || 0) - (Number(a.products?.price) || 0))[0]?.products || null;
  const paidTxs = (detail?.txs || []).filter((t) => t.status === "paid");
  const totalSpent = paidTxs.reduce((sum, t) => sum + Number(t.gross_amount || 0), 0);
  const lastBodyAssess = detail?.bodyAssess[0] || null;
  const lastAnam = detail?.anams[0] || null;

  const tabs: { id: Tab; label: string; icon: typeof Activity }[] = [
    { id: "resumo", label: "Resumo", icon: Activity },
    { id: "avaliacoes", label: "Avaliações", icon: Activity },
    { id: "anamnese", label: "Anamnese", icon: ClipboardList },
    { id: "evolucao", label: "Evolução", icon: TrendingUp },
    { id: "compras", label: "Compras", icon: ShoppingBag },
    { id: "sigiloso", label: "Sigiloso", icon: ShieldCheck },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10" style={{ backgroundColor: "#141414" }} onClick={(e) => e.stopPropagation()}>
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
          {loading || !detail ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-white/50" /></div>
          ) : tab === "resumo" ? (
            <div className="space-y-3">
              <Card title="Plano ativo de maior valor" icon={<FileText className="h-4 w-4 text-primary" />}>
                {topPlan ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-white">{topPlan.name}</p>
                    <p className="text-sm font-bold text-primary">{money(topPlan.price)}</p>
                  </div>
                ) : <p className="text-xs text-white/40">Nenhum plano ativo.</p>}
              </Card>
              <Card title="Última avaliação" icon={<Activity className="h-4 w-4 text-primary" />}>
                {lastBodyAssess ? (
                  <div>
                    <p className="text-sm text-white">{fmtBRLong(lastBodyAssess.assessment_date)}</p>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                      <Mini label="Peso" value={lastBodyAssess.weight ? `${lastBodyAssess.weight}kg` : "—"} />
                      <Mini label="IMC" value={lastBodyAssess.bmi ? Number(lastBodyAssess.bmi).toFixed(1) : "—"} />
                      <Mini label="% Gord" value={lastBodyAssess.body_fat ? `${lastBodyAssess.body_fat}%` : "—"} />
                      <Mini label="Músc. Esq." value={lastBodyAssess.skeletal_muscle != null ? `${lastBodyAssess.skeletal_muscle}%` : (lastBodyAssess.muscle_mass ? `${lastBodyAssess.muscle_mass}kg` : "—")} />
                    </div>
                  </div>
                ) : <p className="text-xs text-white/40">Sem avaliação registrada.</p>}
              </Card>
              <Card title="Anamnese mais recente" icon={<ClipboardList className="h-4 w-4 text-primary" />}>
                {lastAnam ? <p className="text-sm text-white/80">{fmtBR(lastAnam.filled_at)} {lastAnam.objective && `· ${lastAnam.objective}`}</p> : <p className="text-xs text-white/40">Nenhuma anamnese preenchida.</p>}
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
              {detail.bodyAssess.length === 0 && detail.bios.length === 0 ? <p className="py-6 text-center text-xs text-white/40">Nenhuma avaliação registrada.</p> : (
                <>
                  {detail.bodyAssess.map((a) => (
                    <div key={a.id} className="rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
                      <p className="text-sm font-bold text-white">{fmtBRLong(a.assessment_date)}</p>
                      <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                        <Mini label="Peso" value={a.weight ? `${a.weight}kg` : "—"} />
                        <Mini label="IMC" value={a.bmi ? Number(a.bmi).toFixed(1) : "—"} />
                        <Mini label="% Gord" value={a.body_fat ? `${a.body_fat}%` : "—"} />
                        <Mini label="Músc. Esq." value={a.skeletal_muscle != null ? `${a.skeletal_muscle}%` : (a.muscle_mass ? `${a.muscle_mass}kg` : "—")} />
                      </div>
                      {(a.client_notes || a.professional_notes) && (
                        <div className="mt-2 space-y-2 text-xs text-white/75">
                          {a.client_notes && <Info label="Observação para aluno" value={a.client_notes} />}
                          {a.professional_notes && <Info label="Observação profissional" value={a.professional_notes} />}
                        </div>
                      )}
                    </div>
                  ))}
                  {detail.bios.map((b) => (
                    <div key={b.id} className="rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
                      <p className="text-sm text-white">{fmtBR(b.evaluation_date)} <span className="ml-1 text-[10px] text-white/40">{b.evaluation_type}</span></p>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                        <Mini label="Peso" value={b.weight ? `${b.weight}kg` : "—"} />
                        <Mini label="% Gord" value={b.fat_percentage ? `${b.fat_percentage}%` : "—"} />
                        <Mini label="% Músc" value={b.muscle_percentage ? `${b.muscle_percentage}%` : "—"} />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : tab === "anamnese" ? (
            <div className="space-y-3">
              {detail.anams.length === 0 ? <p className="py-6 text-center text-xs text-white/40">Nenhuma anamnese.</p> : detail.anams.map((a, idx) => (
                <div key={a.id} className="space-y-3 rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">{fmtBRLong(a.filled_at)}</p>
                    {a.confirmed_at && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">Assinada</span>}
                  </div>
                  {idx === 0 && (a.has_diabetes || a.has_hypertension || a.has_cardiopathy || a.other_chronic_conditions) && (
                    <div className="flex flex-wrap gap-1.5">
                      {a.has_diabetes && <Badge>Diabetes</Badge>}
                      {a.has_hypertension && <Badge>Hipertensão</Badge>}
                      {a.has_cardiopathy && <Badge>Cardiopatia</Badge>}
                      {a.other_chronic_conditions && <Badge>{a.other_chronic_conditions}</Badge>}
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
                    <Info label="Observações" value={a.additional_observations} />
                  </div>
                </div>
              ))}
            </div>
          ) : tab === "evolucao" ? (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-wide text-white/40">Histórico de peso</p>
                {detail.weights.length === 0 ? <p className="text-xs text-white/40">Sem registros.</p> : (
                  <div className="overflow-x-auto rounded-xl border border-white/5">
                    <table className="w-full text-xs">
                      <thead className="bg-white/5 text-left text-white/50"><tr><th className="p-2">Data</th><th className="p-2">Peso</th><th className="p-2">Cintura</th><th className="p-2">Quadril</th></tr></thead>
                      <tbody>{detail.weights.map((w) => <tr key={w.id} className="border-t border-white/5 text-white/80"><td className="p-2">{fmtBR(w.log_date)}</td><td className="p-2">{w.weight} kg</td><td className="p-2">{w.waist_cm ? `${w.waist_cm}cm` : "—"}</td><td className="p-2">{w.hip_cm ? `${w.hip_cm}cm` : "—"}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-wide text-white/40">Fotos de evolução</p>
                {detail.photos.length === 0 ? <p className="text-xs text-white/40">Aluno ainda não enviou fotos.</p> : (
                  <div className="grid grid-cols-3 gap-2">
                    {detail.photos.map((p) => <a key={p.id} href={p.photo_url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-lg border border-white/5"><img src={p.photo_url} alt={p.caption || "Evolução"} loading="lazy" className="aspect-square w-full object-cover transition group-hover:scale-105" /><p className="bg-black/50 p-1 text-center text-[10px] text-white/70">{fmtBR(p.photo_date)}</p></a>)}
                  </div>
                )}
              </div>
            </div>
          ) : tab === "compras" ? (
            <div className="space-y-2">
              {detail.txs.length === 0 ? <p className="py-6 text-center text-xs text-white/40">Nenhuma compra registrada.</p> : detail.txs.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{t.products?.name || "Compra"}</p><p className="text-[11px] text-white/45">{fmtBR(t.paid_at || t.created_at)} · <span className={t.status === "paid" ? "text-success" : "text-white/40"}>{t.status}</span></p></div>
                  <p className="text-sm font-bold text-white">{money(t.gross_amount)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {!detail.canViewConfidentialMedicalNotes ? (
                <div className="rounded-xl border border-white/5 p-4 text-center" style={{ backgroundColor: "#0F0F0F" }}>
                  <EyeOff className="mx-auto mb-2 h-6 w-6 text-white/30" />
                  <p className="text-sm font-bold text-white">Acesso sigiloso restrito</p>
                  <p className="mt-1 text-xs text-white/45">Fichas médicas sigilosas aparecem apenas para profissionais autorizados pela especialidade.</p>
                </div>
              ) : detail.confidentialNotes.length === 0 ? (
                <p className="py-6 text-center text-xs text-white/40">Nenhuma ficha sigilosa registrada.</p>
              ) : detail.confidentialNotes.map((n) => (
                <div key={n.id} className="rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
                  <p className="text-sm font-bold text-white">{n.title}</p>
                  <p className="mt-1 text-[10px] text-white/40">{fmtBR(n.created_at)}</p>
                  <p className="mt-2 whitespace-pre-wrap text-xs text-white/80">{n.content}</p>
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
  return <div className="rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}><p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/50">{icon} {title}</p>{children}</div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white/5 p-2"><p className="text-white/40">{label}</p><p className="font-bold text-white">{value}</p></div>;
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return <div className="rounded-lg bg-white/5 p-2"><p className="text-white/40">{label}</p><p className="whitespace-pre-wrap font-medium text-white/85">{value}</p></div>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">{children}</span>;
}