import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listAllProfessionalReleases,
  adminConfirmProfessionalEmail,
  adminSetProfessionalSpecialty,
  adminApproveProfessionalFinal,
  getProfessionalReleaseAudit,
} from "@/lib/professional-approvals.functions";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, Circle, Mail, Stethoscope, Settings2,
  History, ChevronDown, ChevronUp, ClipboardList,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/professional-releases")({
  head: () => ({ meta: [{ title: "Liberar Profissionais — Admin" }] }),
  component: ProfessionalReleasesPage,
});

type Specialty = { key: string; label: string; requires_admin_setup: boolean };

type Row = {
  id: string;
  profile_id: string;
  specialty_key: string | null;
  specialty_custom_description: string | null;
  specialty_pending_setup: boolean;
  professional_council: string | null;
  council_number: string | null;
  serves_whole_network: boolean;
  approved_at: string | null;
  onboarding_stage: string | null;
  created_at: string;
  email_confirmed: boolean;
  profile: { id: string; name?: string; email?: string; phone?: string; user_id?: string } | null;
};

type StageFilter = "all" | "email" | "specialty" | "approval" | "approved";
type StepKey = "email" | "specialty" | "approve";

type AuditEntry = { id: string; action: string; notes: string | null; created_at: string; actor_name: string };

const ACTION_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  professional_email_confirmed: { label: "E-mail confirmado", icon: Mail },
  professional_specialty_set:   { label: "Especialidade definida", icon: ClipboardList },
  professional_approved_final:  { label: "Profissional aprovado e painel liberado", icon: Stethoscope },
};

function Step({ done, active, icon: Icon, label }: { done: boolean; active: boolean; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${done ? "text-emerald-300" : active ? "text-amber-300" : "text-white/40"}`}>
      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </div>
  );
}

function ProfessionalReleasesPage() {
  const fetchList = useServerFn(listAllProfessionalReleases);
  const confirmEmail = useServerFn(adminConfirmProfessionalEmail);
  const setSpecialty = useServerFn(adminSetProfessionalSpecialty);
  const approveFinal = useServerFn(adminApproveProfessionalFinal);
  const fetchAudit = useServerFn(getProfessionalReleaseAudit);

  const [rows, setRows] = useState<Row[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<{ id: string; step: StepKey } | null>(null);
  const [openAudit, setOpenAudit] = useState<Record<string, boolean>>({});
  const [auditByPro, setAuditByPro] = useState<Record<string, AuditEntry[] | "loading">>({});
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [includeApproved, setIncludeApproved] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const data = (await fetchList({ data: { includeApproved } })) as unknown as {
        specialties: Specialty[];
        professionals: Row[];
      };
      setRows(data?.professionals || []);
      setSpecialties(data?.specialties || []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [includeApproved]);

  const loadAudit = async (proId: string, profileId: string) => {
    setAuditByPro((s) => ({ ...s, [proId]: "loading" }));
    try {
      const data = (await fetchAudit({ data: { profileId } })) as unknown as AuditEntry[];
      setAuditByPro((s) => ({ ...s, [proId]: data || [] }));
    } catch (e) {
      toast.error((e as Error).message);
      setAuditByPro((s) => ({ ...s, [proId]: [] }));
    }
  };

  const toggleAudit = (proId: string, profileId: string) => {
    setOpenAudit((s) => {
      const next = !s[proId];
      if (next && !auditByPro[proId]) void loadAudit(proId, profileId);
      return { ...s, [proId]: next };
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

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (stageFilter !== "all") {
      const emailDone = r.email_confirmed;
      const specDone = !!r.specialty_key;
      const approved = !!r.approved_at;
      if (stageFilter === "approved" && !approved) return false;
      if (stageFilter === "email" && emailDone) return false;
      if (stageFilter === "specialty" && (!emailDone || specDone)) return false;
      if (stageFilter === "approval" && (!specDone || approved)) return false;
    }
    if (q) {
      const hay = [r.profile?.name, r.profile?.email, r.profile?.phone, r.professional_council, r.council_number, r.specialty_custom_description].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Liberar Profissionais</h1>
        <p className="mt-1 text-sm text-white/60">
          Liberação por etapas. Confirme e-mail, defina especialidade e libere o painel do profissional.
        </p>
      </div>

      <div className="mb-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 md:grid-cols-[1fr_auto_auto]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, e-mail, telefone ou conselho"
          className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as StageFilter)}
          className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
          <option value="all">Todas as etapas</option>
          <option value="email">Aguardando e-mail</option>
          <option value="specialty">Aguardando especialidade</option>
          <option value="approval">Aguardando aprovação</option>
          <option value="approved">Já aprovados</option>
        </select>
        <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80">
          <input type="checkbox" checked={includeApproved} onChange={(e) => setIncludeApproved(e.target.checked)} />
          Incluir aprovados
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-white/60">
          Nenhum profissional encontrado com os filtros atuais.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const emailDone = r.email_confirmed;
            const specDone = !!r.specialty_key;
            const approved = !!r.approved_at;
            const spec = specialties.find((s) => s.key === r.specialty_key);

            return (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-white">{r.profile?.name || "—"}</h3>
                    <p className="mt-0.5 text-xs text-white/50">
                      {r.profile?.email || "—"} {r.profile?.phone ? `· ${r.profile.phone}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {r.professional_council ? `${r.professional_council} ${r.council_number || ""}` : "Sem conselho informado"}
                    </p>
                    {r.specialty_custom_description && (
                      <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-wide text-amber-400/80 font-semibold">Área informada pelo profissional</p>
                        <p className="text-xs text-amber-200 mt-0.5">{r.specialty_custom_description}</p>
                      </div>
                    )}
                    {approved && (
                      <span className="mt-1 inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        Aprovado{r.approved_at ? ` · ${new Date(r.approved_at).toLocaleDateString("pt-BR")}` : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Trilha */}
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <Step done={emailDone} active={!emailDone} icon={Mail} label="E-mail" />
                  <span className="text-white/20">›</span>
                  <Step done={specDone} active={emailDone && !specDone} icon={ClipboardList} label="Especialidade" />
                  <span className="text-white/20">›</span>
                  <Step done={approved} active={specDone && !approved} icon={Stethoscope} label="Aprovar" />
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {/* 1. E-mail */}
                  <button
                    disabled={emailDone || (busy?.id === r.id && busy?.step === "email")}
                    onClick={() => run(r.id, "email", () => confirmEmail({ data: { coachId: r.id } }), "E-mail confirmado", r.profile?.id)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-40"
                  >
                    {busy?.id === r.id && busy?.step === "email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                    {emailDone ? "E-mail validado" : "Confirmar e-mail"}
                  </button>

                  {/* 2. Especialidade */}
                  <div className="flex flex-col gap-1">
                    <Select
                      value={r.specialty_key || ""}
                      onValueChange={(v) => run(r.id, "specialty", () => setSpecialty({ data: { coachId: r.id, specialtyKey: v } }), "Especialidade atualizada", r.profile?.id)}
                    >
                      <SelectTrigger className="h-9 bg-white/5 border-white/10 text-white text-xs">
                        <SelectValue placeholder="Definir especialidade" />
                      </SelectTrigger>
                      <SelectContent>
                        {specialties.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {spec?.requires_admin_setup && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
                        <Settings2 className="h-3 w-3" /> Precisa configuração customizada
                      </span>
                    )}
                  </div>

                  {/* 3. Aprovar final */}
                  <div className="md:col-span-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] px-3 py-2">
                    <Stethoscope className="h-3.5 w-3.5 text-emerald-300" />
                    <span className="text-xs text-white/70">
                      {spec ? `Especialidade: ${spec.label}` : "Selecione uma especialidade para liberar"}
                    </span>
                    <div className="ml-auto">
                      <button
                        disabled={approved || !specDone || (busy?.id === r.id && busy?.step === "approve")}
                        onClick={() => {
                          if (!confirm(`Aprovar definitivamente ${r.profile?.name || "este profissional"}? Isso também confirma o e-mail e libera o painel.`)) return;
                          run(r.id, "approve", () => approveFinal({ data: { coachId: r.id } }), "Profissional aprovado!", r.profile?.id);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                      >
                        {busy?.id === r.id && busy?.step === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {approved ? "Aprovado" : "Aprovar profissional"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Histórico */}
                {r.profile?.id && (
                  <div className="mt-3">
                    <button
                      onClick={() => toggleAudit(r.id, r.profile!.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/60 hover:text-white"
                    >
                      <History className="h-3.5 w-3.5" />
                      Histórico
                      {openAudit[r.id] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    {openAudit[r.id] && (
                      <div className="mt-2 rounded-lg border border-white/10 bg-black/30 p-3">
                        {auditByPro[r.id] === "loading" ? (
                          <div className="flex items-center gap-2 text-white/50 text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...</div>
                        ) : ((auditByPro[r.id] as AuditEntry[])?.length ?? 0) === 0 ? (
                          <p className="text-xs text-white/40">Sem eventos registrados ainda.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {(auditByPro[r.id] as AuditEntry[]).map((entry) => {
                              const meta = ACTION_LABELS[entry.action] ?? { label: entry.action, icon: History };
                              const Icon = meta.icon;
                              return (
                                <li key={entry.id} className="flex items-start gap-2 text-[11px] text-white/70">
                                  <Icon className="h-3.5 w-3.5 mt-0.5 text-primary/70 shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-white/90">{meta.label}</p>
                                    <p className="text-white/40">
                                      {new Date(entry.created_at).toLocaleString("pt-BR")} · {entry.actor_name}
                                      {entry.notes ? ` · ${entry.notes}` : ""}
                                    </p>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
