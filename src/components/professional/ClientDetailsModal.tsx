import { useEffect, useState } from "react";
import { X, Cake, ExternalLink, Loader2, Activity, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { createAssessmentShare } from "@/lib/assessment-share.functions";

type Tab = "resumo" | "avaliacoes" | "anamnese";

interface Props {
  clientId: string;
  onClose: () => void;
}

type Client = { id: string; name: string; email: string | null; whatsapp: string | null; birth_date: string | null };
type Assess = { id: string; assessment_date: string; weight: number | null; body_fat: number | null; muscle_mass: number | null; skeletal_muscle: number | null; bmi: number | null };
type Anam = { id: string; updated_at: string; answers: Record<string, unknown> };

const fmtBR = (d: string | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
const fmtBRLong = (d: string | null) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "—";

function calcAge(birth: string | null) {
  if (!birth) return null;
  const b = new Date(birth);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export default function ClientDetailsModal({ clientId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("resumo");
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<Client | null>(null);
  const [assess, setAssess] = useState<Assess[]>([]);
  const [anam, setAnam] = useState<Anam | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [cRes, aRes, anRes] = await Promise.all([
        supabase.from("coach_evaluation_clients" as never).select("id,name,email,whatsapp,birth_date" as never).eq("id" as never, clientId as never).maybeSingle(),
        supabase.from("coach_body_assessments" as never).select("id,assessment_date,weight,body_fat,muscle_mass,skeletal_muscle,bmi" as never).eq("client_id" as never, clientId as never).order("assessment_date" as never, { ascending: false }),
        supabase.from("professional_anamnesis_external" as never).select("id,updated_at,answers" as never).eq("evaluation_client_id" as never, clientId as never).maybeSingle(),
      ]);
      setClient(((cRes.data as unknown) as Client) || null);
      setAssess(((aRes.data || []) as unknown) as Assess[]);
      setAnam(((anRes.data as unknown) as Anam) || null);
      setLoading(false);
    })();
  }, [clientId]);

  const lastAssess = assess[0] || null;
  const age = calcAge(client?.birth_date || null);

  const openShare = async (assessmentId: string) => {
    setSharing(true);
    try {
      const r = await createAssessmentShare({ data: { assessmentId, clientName: client?.name || "Cliente" } });
      window.open(`/resultado/${r.token}`, "_blank");
    } catch (e) { toast.error((e as Error).message); } finally { setSharing(false); }
  };

  const tabs: { id: Tab; label: string; icon: typeof Activity }[] = [
    { id: "resumo", label: "Resumo", icon: Activity },
    { id: "avaliacoes", label: "Avaliações", icon: Activity },
    { id: "anamnese", label: "Anamnese", icon: ClipboardList },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div className="flex w-full max-w-2xl flex-col rounded-2xl border border-white/10 max-h-[92vh] overflow-hidden" style={{ backgroundColor: "#141414" }} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b border-white/5 p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-white">{client?.name || "Cliente"}</h2>
            <p className="truncate text-xs text-white/50">{client?.email || client?.whatsapp || "—"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/60">
              {client?.birth_date && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5">
                  <Cake className="h-3 w-3" /> {fmtBR(client.birth_date)} {age != null && `· ${age}a`}
                </span>
              )}
              <WhatsAppButton phone={client?.whatsapp} size="sm" message={`Olá ${client?.name?.split(" ")[0] || ""}!`} />
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-white/60 hover:bg-white/5"><X className="h-4 w-4" /></button>
        </header>

        <nav className="flex gap-1 border-b border-white/5 px-2 py-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${tab === t.id ? "bg-primary text-primary-foreground" : "text-white/60 hover:bg-white/5"}`}>
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
              <div className="rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-white/50">Última avaliação</p>
                {lastAssess ? (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-white">{fmtBRLong(lastAssess.assessment_date)}</p>
                      <button onClick={() => openShare(lastAssess.id)} disabled={sharing} className="inline-flex items-center gap-1 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/25 disabled:opacity-50">
                        {sharing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />} Abrir
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                      <Mini label="Peso" value={lastAssess.weight ? `${lastAssess.weight}kg` : "—"} />
                      <Mini label="IMC" value={lastAssess.bmi ? Number(lastAssess.bmi).toFixed(1) : "—"} />
                      <Mini label="% Gord" value={lastAssess.body_fat ? `${lastAssess.body_fat}%` : "—"} />
                      <Mini label="Músc" value={lastAssess.muscle_mass ? `${lastAssess.muscle_mass}kg` : "—"} />
                    </div>
                  </div>
                ) : <p className="text-xs text-white/40">Sem avaliação registrada.</p>}
              </div>
              <div className="rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/50">Anamnese</p>
                <p className="text-sm text-white/80">{anam ? `Atualizada em ${fmtBR(anam.updated_at)}` : "Nenhuma anamnese preenchida."}</p>
              </div>
            </div>
          ) : tab === "avaliacoes" ? (
            <div className="space-y-2">
              {assess.length === 0 ? <p className="py-6 text-center text-xs text-white/40">Nenhuma avaliação registrada.</p> : assess.map((a) => (
                <div key={a.id} className="rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">{fmtBRLong(a.assessment_date)}</p>
                    <button onClick={() => openShare(a.id)} disabled={sharing} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline disabled:opacity-50">
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
          ) : (
            <div>
              {!anam ? <p className="py-6 text-center text-xs text-white/40">Nenhuma anamnese preenchida.</p> : (
                <div className="space-y-2">
                  <p className="text-[11px] text-white/45">Atualizada em {fmtBR(anam.updated_at)}</p>
                  <div className="space-y-1.5 rounded-xl border border-white/5 p-3 text-xs" style={{ backgroundColor: "#0F0F0F" }}>
                    {Object.entries(anam.answers || {}).map(([k, v]) => (
                      <div key={k} className="flex flex-col gap-0.5 border-b border-white/5 pb-1.5 last:border-0">
                        <p className="text-white/40">{k}</p>
                        <p className="text-white/85 whitespace-pre-wrap break-words">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
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
