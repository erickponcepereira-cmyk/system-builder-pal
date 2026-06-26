import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listAllPartnerReleases,
  adminConfirmPartnerEmail,
  adminGrantPartnerActivation,
  adminReviewPartnerDocuments,
  adminApprovePartnerFinal,
  getPartnerReleaseAudit,
} from "@/lib/partner-approvals.functions";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, Circle, Mail, CreditCard, FileCheck2, Building2,
  History, ChevronDown, ChevronUp,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/partner-releases")({
  head: () => ({ meta: [{ title: "Liberar Parceiros — Admin" }] }),
  component: PartnerReleasesPage,
});

type MonthlyStatus = "paid" | "exempt" | "pending" | "overdue" | "blocked" | "cancelled" | "none";

type Row = {
  id: string;
  fantasy_name: string;
  document: string | null;
  whatsapp: string | null;
  city: string | null;
  state: string | null;
  status: string;
  photo_url: string | null;
  business_area: string | null;
  specialty: string | null;
  approved_at: string | null;
  activation_paid_at: string | null;
  activation_source: string | null;
  activation_note: string | null;
  documents_reviewed_at: string | null;
  email_confirmed: boolean;
  profile: { id: string; name?: string; email?: string; phone?: string } | null;
  monthly: { status: MonthlyStatus; paid_until: string | null; last_invoice_status: string | null; last_invoice_month: string | null };
};

type StageFilter = "all" | "email" | "activation" | "documents" | "approval" | "approved";
type MonthlyFilter = "all" | MonthlyStatus;
type StepKey = "email" | "activation" | "documents" | "approve";

type AuditEntry = { id: string; action: string; notes: string | null; created_at: string; actor_name: string };

const ACTION_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  partner_email_confirmed:    { label: "E-mail confirmado", icon: Mail },
  partner_activation_paid:    { label: "Anuidade concedida pelo admin", icon: CreditCard },
  partner_documents_reviewed: { label: "Documentos / perfil revisados", icon: FileCheck2 },
  partner_approved_final:     { label: "Parceiro aprovado e painel liberado", icon: Building2 },
};

const ACTIVATION_SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  admin_grant:      { label: "Concedida pelo admin",   cls: "bg-amber-500/15 text-amber-300" },
  partner_approved: { label: "Liberada na aprovação",  cls: "bg-cyan-500/15 text-cyan-300" },
  purchased:        { label: "Comprou na loja",        cls: "bg-emerald-500/15 text-emerald-300" },
  mercadopago:      { label: "Pago no Mercado Pago",   cls: "bg-emerald-500/15 text-emerald-300" },
};

const MONTHLY_BADGE: Record<MonthlyStatus, { label: string; cls: string }> = {
  paid:      { label: "Mensalidade paga",     cls: "bg-emerald-500/15 text-emerald-300" },
  exempt:    { label: "Mensalidade isenta",   cls: "bg-blue-500/15 text-blue-300" },
  pending:   { label: "Mensalidade pendente", cls: "bg-amber-500/15 text-amber-300" },
  overdue:   { label: "Mensalidade atrasada", cls: "bg-orange-500/15 text-orange-300" },
  blocked:   { label: "Mensalidade bloqueada",cls: "bg-red-500/15 text-red-300" },
  cancelled: { label: "Mensalidade cancelada",cls: "bg-white/10 text-white/60" },
  none:      { label: "Sem mensalidade",      cls: "bg-white/5 text-white/50" },
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

function PartnerReleasesPage() {
  const fetchList = useServerFn(listAllPartnerReleases);
  const confirmEmail = useServerFn(adminConfirmPartnerEmail);
  const grantActivation = useServerFn(adminGrantPartnerActivation);
  const reviewDocs = useServerFn(adminReviewPartnerDocuments);
  const approveFinal = useServerFn(adminApprovePartnerFinal);
  const fetchAudit = useServerFn(getPartnerReleaseAudit);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<{ id: string; step: StepKey } | null>(null);
  const [openAudit, setOpenAudit] = useState<Record<string, boolean>>({});
  const [auditByPartner, setAuditByPartner] = useState<Record<string, AuditEntry[] | "loading">>({});
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [monthlyFilter, setMonthlyFilter] = useState<MonthlyFilter>("all");
  const [includeApproved, setIncludeApproved] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const data = (await fetchList({ data: { includeApproved } })) as unknown as Row[];
      setRows(data || []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [includeApproved]);

  const loadAudit = async (partnerId: string, profileId: string) => {
    setAuditByPartner((s) => ({ ...s, [partnerId]: "loading" }));
    try {
      const data = (await fetchAudit({ data: { profileId } })) as unknown as AuditEntry[];
      setAuditByPartner((s) => ({ ...s, [partnerId]: data || [] }));
    } catch (e) {
      toast.error((e as Error).message);
      setAuditByPartner((s) => ({ ...s, [partnerId]: [] }));
    }
  };

  const toggleAudit = (partnerId: string, profileId: string) => {
    setOpenAudit((s) => {
      const next = !s[partnerId];
      if (next && !auditByPartner[partnerId]) void loadAudit(partnerId, profileId);
      return { ...s, [partnerId]: next };
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
    if (monthlyFilter !== "all" && (r.monthly?.status ?? "none") !== monthlyFilter) return false;
    if (stageFilter !== "all") {
      const emailDone = r.email_confirmed;
      const activationDone = !!r.activation_paid_at;
      const docsDone = !!r.documents_reviewed_at;
      const approved = r.status === "approved";
      if (stageFilter === "approved" && !approved) return false;
      if (stageFilter === "email" && emailDone) return false;
      if (stageFilter === "activation" && (!emailDone || activationDone)) return false;
      if (stageFilter === "documents" && (!activationDone || docsDone)) return false;
      if (stageFilter === "approval" && (!docsDone || approved)) return false;
    }
    if (q) {
      const hay = [r.fantasy_name, r.document, r.whatsapp, r.profile?.name, r.profile?.email, r.profile?.phone].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Liberar Parceiros</h1>
        <p className="mt-1 text-sm text-white/60">
          Liberação por etapas. Cada checkpoint pode ser confirmado manualmente pelo admin.
        </p>
      </div>

      <div className="mb-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 md:grid-cols-[1fr_auto_auto_auto]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por empresa, documento, responsável, e-mail ou telefone"
          className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as StageFilter)}
          className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
          <option value="all">Todas as etapas</option>
          <option value="email">Aguardando e-mail</option>
          <option value="activation">Aguardando anuidade</option>
          <option value="documents">Aguardando revisão</option>
          <option value="approval">Aguardando aprovação</option>
          <option value="approved">Já aprovados</option>
        </select>
        <select value={monthlyFilter} onChange={(e) => setMonthlyFilter(e.target.value as MonthlyFilter)}
          className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
          <option value="all">Mensalidade: todas</option>
          <option value="paid">Paga</option>
          <option value="exempt">Isenta</option>
          <option value="pending">Pendente</option>
          <option value="overdue">Atrasada</option>
          <option value="blocked">Bloqueada</option>
          <option value="cancelled">Cancelada</option>
          <option value="none">Sem mensalidade</option>
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
          Nenhum parceiro encontrado com os filtros atuais.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const emailDone = r.email_confirmed;
            const activationDone = !!r.activation_paid_at;
            const docsDone = !!r.documents_reviewed_at;
            const approved = r.status === "approved";
            const monthly = r.monthly ?? { status: "none" as MonthlyStatus, paid_until: null, last_invoice_status: null, last_invoice_month: null };
            const mb = MONTHLY_BADGE[monthly.status];

            return (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-white">{r.fantasy_name || "—"}</h3>
                    <p className="mt-0.5 text-xs text-white/50">
                      {r.profile?.name || "—"} · {r.profile?.email || "—"} {r.profile?.phone ? `· ${r.profile.phone}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {r.document || "—"} · {r.city || "—"}/{r.state || "—"} {r.business_area ? `· ${r.business_area}` : ""}
                    </p>
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
                  <Step done={activationDone} active={emailDone && !activationDone} icon={CreditCard} label="Anuidade" />
                  <span className="text-white/20">›</span>
                  <Step done={docsDone} active={activationDone && !docsDone} icon={FileCheck2} label="Documentos" />
                  <span className="text-white/20">›</span>
                  <Step done={approved} active={docsDone && !approved} icon={Building2} label="Aprovar" />
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {/* 1. E-mail */}
                  <button
                    disabled={emailDone || (busy?.id === r.id && busy?.step === "email")}
                    onClick={() => run(r.id, "email", () => confirmEmail({ data: { partnerId: r.id } }), "E-mail confirmado", r.profile?.id)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-40"
                  >
                    {busy?.id === r.id && busy?.step === "email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                    {emailDone ? "E-mail validado" : "Confirmar e-mail"}
                  </button>

                  {/* 2. Anuidade */}
                  <div className="flex flex-col gap-1">
                    <button
                      disabled={activationDone || (busy?.id === r.id && busy?.step === "activation")}
                      onClick={() => {
                        const note = window.prompt(
                          "Justifique a concessão da anuidade R$179,90 (mín. 5 caracteres).\nEx: 'isenção combinada via WhatsApp em 26/06'."
                        );
                        if (!note || note.trim().length < 5) { toast.error("Justificativa obrigatória."); return; }
                        run(r.id, "activation", () => grantActivation({ data: { partnerId: r.id, note: note.trim() } }), "Anuidade concedida", r.profile?.id);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-40"
                    >
                      {busy?.id === r.id && busy?.step === "activation" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                      {activationDone ? `Paga em ${new Date(r.activation_paid_at!).toLocaleDateString("pt-BR")}` : "Conceder anuidade"}
                    </button>
                    {activationDone && r.activation_source && (() => {
                      const b = ACTIVATION_SOURCE_BADGE[r.activation_source];
                      return (
                        <span className={`self-start inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${b?.cls ?? "bg-white/10 text-white/60"}`}>
                          Origem: {b?.label ?? r.activation_source}
                          {r.activation_note ? ` · ${r.activation_note}` : ""}
                        </span>
                      );
                    })()}
                  </div>

                  {/* 3. Documentos */}
                  <button
                    disabled={docsDone || (busy?.id === r.id && busy?.step === "documents")}
                    onClick={() => run(r.id, "documents", () => reviewDocs({ data: { partnerId: r.id } }), "Documentos revisados", r.profile?.id)}
                    className="md:col-span-1 inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-40"
                  >
                    {busy?.id === r.id && busy?.step === "documents" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCheck2 className="h-3.5 w-3.5" />}
                    {docsDone ? `Revisado em ${new Date(r.documents_reviewed_at!).toLocaleDateString("pt-BR")}` : "Marcar revisado"}
                  </button>

                  {/* 4. Aprovar final + Mensalidade */}
                  <div className="md:col-span-1 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] px-3 py-2">
                    <Building2 className="h-3.5 w-3.5 text-emerald-300" />
                    <span
                      title={[
                        monthly.paid_until ? `Paga até ${new Date(monthly.paid_until).toLocaleDateString("pt-BR")}` : null,
                        monthly.last_invoice_month ? `Última fatura: ${monthly.last_invoice_month}${monthly.last_invoice_status ? ` (${monthly.last_invoice_status})` : ""}` : null,
                      ].filter(Boolean).join(" · ")}
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${mb.cls}`}
                    >
                      {mb.label}
                    </span>
                    <div className="ml-auto">
                      <button
                        disabled={approved || (busy?.id === r.id && busy?.step === "approve")}
                        onClick={() => {
                          if (!confirm(`Aprovar definitivamente ${r.fantasy_name}?`)) return;
                          run(r.id, "approve", () => approveFinal({ data: { partnerId: r.id } }), "Parceiro aprovado!", r.profile?.id);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                      >
                        {busy?.id === r.id && busy?.step === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {approved ? "Aprovado" : "Aprovar parceiro"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Histórico */}
                {r.profile?.id && (
                  <div className="mt-3 rounded-lg border border-white/10 bg-black/20">
                    <button
                      onClick={() => toggleAudit(r.id, r.profile!.id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-white/70 hover:text-white"
                    >
                      <span className="inline-flex items-center gap-2"><History className="h-3.5 w-3.5" /> Histórico de aprovações</span>
                      {openAudit[r.id] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    {openAudit[r.id] && (
                      <div className="border-t border-white/10 p-3">
                        {auditByPartner[r.id] === "loading" ? (
                          <div className="flex items-center gap-2 text-xs text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...</div>
                        ) : !auditByPartner[r.id] || (auditByPartner[r.id] as AuditEntry[]).length === 0 ? (
                          <p className="text-xs text-white/40">Nenhuma ação registrada ainda.</p>
                        ) : (
                          <ol className="relative space-y-3 border-l border-white/10 pl-4">
                            {(auditByPartner[r.id] as AuditEntry[]).map((entry) => {
                              const meta = ACTION_LABELS[entry.action] || { label: entry.action, icon: CheckCircle2 };
                              const Icon = meta.icon;
                              return (
                                <li key={entry.id} className="relative">
                                  <span className="absolute -left-[21px] top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary/80 text-primary-foreground">
                                    <Icon className="h-2.5 w-2.5" />
                                  </span>
                                  <div className="text-xs font-semibold text-white">{meta.label}</div>
                                  <div className="mt-0.5 text-[11px] text-white/50">
                                    por <span className="text-white/80">{entry.actor_name}</span> · {new Date(entry.created_at).toLocaleString("pt-BR")}
                                  </div>
                                  {entry.notes && <div className="mt-0.5 text-[11px] text-white/40">{entry.notes}</div>}
                                </li>
                              );
                            })}
                          </ol>
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
