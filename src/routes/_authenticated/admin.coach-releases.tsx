import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listAllCoachReleases,
  adminConfirmCoachEmail,
  adminMarkActivationPaid,
  adminApproveQuiz,
  adminAssignCoachIdAndRelease,
  getCoachReleaseAudit,
} from "@/lib/coach-onboarding.functions";
import { toast } from "sonner";
import { Loader2, ExternalLink, CheckCircle2, Circle, Mail, CreditCard, FileCheck2, KeyRound, History, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/coach-releases")({
  head: () => ({ meta: [{ title: "Liberar Coaches — Admin" }] }),
  component: CoachReleasesPage,
});

type Row = {
  id: string;
  onboarding_stage: "awaiting_payment" | "awaiting_quiz_result" | "awaiting_upline_release";
  quiz_result_url: string | null;
  quiz_result_submitted_at: string | null;
  activation_paid_at: string | null;
  approved_at: string | null;
  coach_number: number | null;
  upline_coach_id: string | null;
  upline_name: string | null;
  already_coach: boolean | null;
  email_confirmed: boolean;
  profile: { id: string; name?: string; email?: string; phone?: string } | null;
};

type StepKey = "email" | "payment" | "quiz" | "release";

function Step({
  done, active, icon: Icon, label,
}: { done: boolean; active: boolean; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${done ? "text-emerald-300" : active ? "text-amber-300" : "text-white/40"}`}>
      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </div>
  );
}

type AuditEntry = {
  id: string;
  action: string;
  notes: string | null;
  created_at: string;
  actor_name: string;
};

const ACTION_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  coach_email_confirmed: { label: "E-mail confirmado", icon: Mail },
  coach_activation_paid: { label: "Ativação paga", icon: CreditCard },
  coach_quiz_approved: { label: "Quiz aprovado", icon: FileCheck2 },
  coach_id_assigned_released: { label: "ID atribuído e painel liberado", icon: KeyRound },
};

function CoachReleasesPage() {
  const fetchList = useServerFn(listAllCoachReleases);
  const confirmEmail = useServerFn(adminConfirmCoachEmail);
  const markPaid = useServerFn(adminMarkActivationPaid);
  const approveQuiz = useServerFn(adminApproveQuiz);
  const assignAndRelease = useServerFn(adminAssignCoachIdAndRelease);
  const fetchAudit = useServerFn(getCoachReleaseAudit);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<{ id: string; step: StepKey } | null>(null);
  const [idDrafts, setIdDrafts] = useState<Record<string, string>>({});
  const [openAudit, setOpenAudit] = useState<Record<string, boolean>>({});
  const [auditByCoach, setAuditByCoach] = useState<Record<string, AuditEntry[] | "loading">>({});

  const reload = async () => {
    setLoading(true);
    try {
      const data = (await fetchList()) as unknown as Row[];
      setRows(data || []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const loadAudit = async (coachId: string, profileId: string) => {
    setAuditByCoach((s) => ({ ...s, [coachId]: "loading" }));
    try {
      const data = (await fetchAudit({ data: { profileId } })) as unknown as AuditEntry[];
      setAuditByCoach((s) => ({ ...s, [coachId]: data || [] }));
    } catch (e) {
      toast.error((e as Error).message);
      setAuditByCoach((s) => ({ ...s, [coachId]: [] }));
    }
  };

  const toggleAudit = (coachId: string, profileId: string) => {
    setOpenAudit((s) => {
      const next = !s[coachId];
      if (next && !auditByCoach[coachId]) void loadAudit(coachId, profileId);
      return { ...s, [coachId]: next };
    });
  };

  const run = async (id: string, step: StepKey, fn: () => Promise<unknown>, okMsg: string, profileId?: string) => {
    setBusy({ id, step });
    try {
      await fn();
      toast.success(okMsg);
      await reload();
      if (profileId && openAudit[id]) await loadAudit(id, profileId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Liberar Coaches</h1>
        <p className="mt-1 text-sm text-white/60">
          Liberação por etapas. Cada checkpoint pode ser confirmado manualmente pelo admin.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-white/60">
          Nenhum coach pendente.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const emailDone = r.email_confirmed;
            const paymentDone = !!r.activation_paid_at;
            const quizDone = r.onboarding_stage === "awaiting_upline_release" || !!r.approved_at;
            const releaseDone = false; // se aparece aqui, ainda não está liberado
            const draftId = idDrafts[r.id] ?? "";

            return (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                {/* Cabeçalho */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-white">{r.profile?.name || "—"}</h3>
                    <p className="mt-0.5 text-xs text-white/50">{r.profile?.email} {r.profile?.phone ? `· ${r.profile.phone}` : ""}</p>
                    <p className="mt-0.5 text-xs text-white/40">Indicador: <span className="text-white/70">{r.upline_name || "—"}</span></p>
                    {r.already_coach && (
                      <span className="mt-1 inline-flex rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-300">já era coach</span>
                    )}
                  </div>
                </div>

                {/* Trilha de etapas */}
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <Step done={emailDone} active={!emailDone} icon={Mail} label="E-mail" />
                  <span className="text-white/20">›</span>
                  <Step done={paymentDone} active={emailDone && !paymentDone} icon={CreditCard} label="Ativação" />
                  <span className="text-white/20">›</span>
                  <Step done={quizDone} active={paymentDone && !quizDone} icon={FileCheck2} label="Quiz" />
                  <span className="text-white/20">›</span>
                  <Step done={releaseDone} active={quizDone} icon={KeyRound} label="ID + liberar" />
                </div>

                {/* Ações por etapa */}
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {/* 1. Confirmar e-mail */}
                  <button
                    disabled={emailDone || (busy?.id === r.id && busy?.step === "email")}
                    onClick={() => run(r.id, "email", () => confirmEmail({ data: { coachId: r.id } }), "E-mail confirmado")}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-40"
                  >
                    {busy?.id === r.id && busy?.step === "email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                    {emailDone ? "E-mail validado" : "Confirmar e-mail"}
                  </button>

                  {/* 2. Marcar pagamento */}
                  <button
                    disabled={paymentDone || (busy?.id === r.id && busy?.step === "payment")}
                    onClick={() => run(r.id, "payment", () => markPaid({ data: { coachId: r.id } }), "Ativação marcada como paga")}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-40"
                  >
                    {busy?.id === r.id && busy?.step === "payment" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                    {paymentDone ? `Pago em ${new Date(r.activation_paid_at!).toLocaleDateString("pt-BR")}` : "Marcar ativação paga"}
                  </button>

                  {/* 3. Aprovar quiz */}
                  <div className="md:col-span-2 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                    <FileCheck2 className="h-3.5 w-3.5 text-white/60" />
                    <span className="text-xs text-white/70">Quiz:</span>
                    {r.quiz_result_url ? (
                      <a href={r.quiz_result_url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        Ver resultado <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-white/40">não enviado</span>
                    )}
                    <div className="ml-auto">
                      <button
                        disabled={quizDone || (busy?.id === r.id && busy?.step === "quiz")}
                        onClick={() => run(r.id, "quiz", () => approveQuiz({ data: { coachId: r.id } }), "Quiz aprovado")}
                        className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-40"
                      >
                        {busy?.id === r.id && busy?.step === "quiz" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {quizDone ? "Quiz aprovado" : "Aprovar quiz"}
                      </button>
                    </div>
                  </div>

                  {/* 4. ID + liberar */}
                  <div className="md:col-span-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] px-3 py-2">
                    <KeyRound className="h-3.5 w-3.5 text-emerald-300" />
                    <span className="text-xs text-white/70">ID de coach:</span>
                    <input
                      inputMode="numeric"
                      placeholder={r.coach_number ? String(r.coach_number) : "ex: 1234"}
                      value={draftId}
                      onChange={(e) => setIdDrafts((s) => ({ ...s, [r.id]: e.target.value.replace(/\D/g, "") }))}
                      className="w-28 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="ml-auto">
                      <button
                        disabled={!quizDone || (busy?.id === r.id && busy?.step === "release")}
                        onClick={() => {
                          const n = Number(draftId || r.coach_number || 0);
                          if (!n) { toast.error("Informe um ID numérico válido."); return; }
                          if (!confirm(`Atribuir ID ${n} e liberar o painel de ${r.profile?.name || "este coach"}?`)) return;
                          run(r.id, "release",
                            () => assignAndRelease({ data: { coachId: r.id, coachNumber: n } }),
                            "Coach liberado!");
                        }}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                      >
                        {busy?.id === r.id && busy?.step === "release" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Liberar painel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
