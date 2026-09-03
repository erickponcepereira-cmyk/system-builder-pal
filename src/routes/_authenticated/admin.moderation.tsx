import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, Flag, Loader2, RefreshCw, Scale, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { processUgcMediaJobs } from "@/lib/ugc-moderation.functions";

export const Route = createFileRoute("/_authenticated/admin/moderation")({
  head: () => ({ meta: [{ title: "Moderação UGC — FitMind Club" }] }),
  component: AdminModerationPage,
});

type ReportRow = {
  id: string;
  target_kind: string;
  target_id: string;
  reason_code: string;
  details: string | null;
  evidence_snapshot: Record<string, unknown>;
  status: string;
  resolution: string | null;
  created_at: string;
};
type AppealRow = {
  id: string;
  action_id: string;
  statement: string;
  status: string;
  decision: string | null;
  created_at: string;
};

type MediaJobCounts = {
  processed: number;
  failed: number;
  remaining: number;
  dead: number;
};

const mediaJobCounts = (result: unknown): MediaJobCounts => {
  const value = result as Partial<MediaJobCounts> | null;
  return {
    processed: Number(value?.processed || 0),
    failed: Number(value?.failed || 0),
    remaining: Number(value?.remaining || 0),
    dead: Number(value?.dead || 0),
  };
};

const actionOptions = [
  ["warning", "Advertência"],
  ["hide_content", "Ocultar conteúdo"],
  ["group_mute", "Silenciar no grupo"],
  ["group_ban", "Banir do grupo"],
  ["suspend_posting", "Suspender publicações"],
  ["block_partner", "Bloquear parceiro"],
  ["deactivate_whatsapp_group", "Desativar grupo do WhatsApp"],
] as const;

function AdminModerationPage() {
  const processMediaJobs = useServerFn(processUgcMediaJobs);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "closed">("open");
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const [actionType, setActionType] = useState("hide_content");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [saving, setSaving] = useState(false);
  const [appealDecision, setAppealDecision] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const statuses = filter === "open" ? ["open", "reviewing"] : ["actioned", "dismissed"];
    const [reportsResult, appealsResult] = await Promise.all([
      supabase.rpc("admin_list_ugc_reports" as never, {
        _statuses: statuses,
        _limit: 200,
        _oldest_first: filter === "open",
      } as never),
      supabase.from("ugc_appeals" as never).select("id,action_id,statement,status,decision,created_at" as never).in("status" as never, ["pending", "reviewing"] as never).order("created_at" as never, { ascending: true }).limit(100),
    ]);
    if (reportsResult.error || appealsResult.error) toast.error("Falha ao carregar a fila de moderação.");
    setReports((reportsResult.data as unknown as ReportRow[]) || []);
    setAppeals((appealsResult.data as unknown as AppealRow[]) || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const openReport = (report: ReportRow) => {
    setSelected(report);
    setActionType(report.target_kind === "whatsapp_group" ? "deactivate_whatsapp_group" : report.target_kind === "partner" ? "block_partner" : report.target_kind === "profile" ? "warning" : "hide_content");
    setReason("");
    setNotes("");
    setExpiresInDays("7");
  };

  const resolve = async (decision: "actioned" | "dismissed") => {
    if (!selected || reason.trim().length < 3) return toast.error("Informe uma justificativa pública com pelo menos 3 caracteres.");
    const expirable = decision === "actioned" && ["group_mute", "suspend_posting"].includes(actionType);
    const days = Number(expiresInDays);
    if (expirable && (!Number.isInteger(days) || days < 1 || days > 365)) {
      return toast.error("A duração deve ser de 1 a 365 dias.");
    }
    setSaving(true);
    const expiresAt = expirable
      ? new Date(Date.now() + days * 86_400_000).toISOString()
      : null;
    const { error } = await supabase.rpc("admin_resolve_ugc_report" as never, {
      _report_id: selected.id,
      _decision: decision,
      _action_type: decision === "dismissed" ? "warning" : actionType,
      _public_reason: reason.trim(),
      _internal_notes: notes.trim() || null,
      _expires_at: expiresAt,
    } as never);
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    let mediaResult: MediaJobCounts | null = null;
    let mediaRequestFailed = false;
    if (decision === "actioned") {
      try {
        const result = await processMediaJobs({ data: { reportId: selected.id, limit: 10 } });
        mediaResult = mediaJobCounts(result);
      } catch {
        mediaRequestFailed = true;
      }
    }
    setSaving(false);
    if (mediaRequestFailed) {
      toast.warning("Medida aplicada, mas a mídia ficou na fila de remoção. Tente processar novamente.");
    } else if (mediaResult?.dead) {
      toast.error(`Medida aplicada, mas ${mediaResult.dead} tarefa(s) de mídia esgotaram as tentativas e exigem intervenção.`);
    } else if (mediaResult && (mediaResult.failed > 0 || mediaResult.remaining > 0)) {
      toast.warning(`Medida aplicada; ${mediaResult.remaining} tarefa(s) de mídia permanecem na fila (${mediaResult.failed} falha(s) nesta execução).`);
    } else {
      toast.success(decision === "dismissed" ? "Denúncia encerrada." : "Medida aplicada e registrada.");
    }
    setSelected(null);
    await load();
  };

  const resolveAppeal = async (appeal: AppealRow, accepted: boolean) => {
    const decision = appealDecision[appeal.id]?.trim();
    if (!decision) return toast.error("Registre a fundamentação da decisão do recurso.");
    setSaving(true);
    const { error } = await supabase.rpc("admin_resolve_ugc_appeal" as never, {
      _appeal_id: appeal.id,
      _accepted: accepted,
      _decision: decision,
    } as never);
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    let mediaResult: MediaJobCounts | null = null;
    let mediaRequestFailed = false;
    if (accepted) {
      try {
        const result = await processMediaJobs({ data: { appealId: appeal.id, limit: 10 } });
        mediaResult = mediaJobCounts(result);
      } catch {
        mediaRequestFailed = true;
      }
    }
    setSaving(false);
    if (mediaRequestFailed) toast.warning("Recurso aceito; a restauração da mídia continua pendente.");
    else if (mediaResult?.dead) toast.error(`Recurso aceito, mas ${mediaResult.dead} tarefa(s) de restauração esgotaram as tentativas e exigem intervenção.`);
    else if (mediaResult && (mediaResult.failed > 0 || mediaResult.remaining > 0)) toast.warning(`Recurso aceito; ${mediaResult.remaining} tarefa(s) de restauração permanecem na fila (${mediaResult.failed} falha(s) nesta execução).`);
    else toast.success(accepted ? "Recurso aceito e medida revogada." : "Recurso negado.");
    await load();
  };

  const refreshAndRetryMedia = async () => {
    try {
      const result = mediaJobCounts(await processMediaJobs({ data: { limit: 20 } }));
      if (result.processed > 0) toast.success(`${result.processed} tarefa(s) de mídia processada(s).`);
      if (result.dead > 0) toast.error(`${result.dead} tarefa(s) de mídia esgotaram as tentativas e exigem intervenção.`);
      else if (result.failed > 0 || result.remaining > 0) toast.warning(`${result.remaining} tarefa(s) permanecem na fila; ${result.failed} falharam nesta execução.`);
      else if (result.processed === 0) toast.info("A fila de mídia está em dia.");
    } catch {
      toast.warning("Não foi possível processar a fila de mídia agora.");
    }
    await load();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2"><ShieldAlert className="h-7 w-7 text-primary" /><h1 className="text-2xl font-bold text-white">Moderação da comunidade</h1></div><p className="mt-1 text-xs text-white/50">Denúncias, evidências, medidas e recursos com trilha de auditoria.</p></div>
        <button onClick={() => void refreshAndRetryMedia()} className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-white"><RefreshCw className="h-4 w-4" /> Atualizar e processar mídia</button>
      </header>

      <div className="flex gap-2">
        <button onClick={() => setFilter("open")} className={`rounded-full px-4 py-2 text-xs font-bold ${filter === "open" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60"}`}>Fila aberta</button>
        <button onClick={() => setFilter("closed")} className={`rounded-full px-4 py-2 text-xs font-bold ${filter === "closed" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60"}`}>Histórico</button>
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {reports.map((report) => (
            <button key={report.id} onClick={() => openReport(report)} className="rounded-xl bg-[#1A1A1A] p-4 text-left transition hover:ring-1 hover:ring-primary/50">
              <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1 text-xs font-bold text-white"><Flag className="h-3.5 w-3.5 text-red-400" /> {report.target_kind.replaceAll("_", " ")}</span><span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-white/50">{report.status}</span></div>
              <p className="mt-2 text-sm font-semibold text-white">{report.reason_code.replaceAll("_", " ")}</p>
              {report.details && <p className="mt-1 line-clamp-2 text-xs text-white/60">{report.details}</p>}
              <p className="mt-3 inline-flex items-center gap-1 text-[10px] text-white/40"><Clock3 className="h-3 w-3" /> {new Date(report.created_at).toLocaleString("pt-BR")}</p>
            </button>
          ))}
          {reports.length === 0 && <p className="col-span-full rounded-xl bg-[#1A1A1A] py-12 text-center text-sm text-white/40">Nenhuma denúncia nesta fila.</p>}
        </div>
      )}

      {filter === "open" && (
        <section className="rounded-2xl bg-[#111] p-4">
          <div className="mb-3 flex items-center gap-2"><Scale className="h-5 w-5 text-primary" /><h2 className="font-bold text-white">Recursos pendentes ({appeals.length})</h2></div>
          <div className="space-y-3">
            {appeals.map((appeal) => (
              <div key={appeal.id} className="rounded-xl bg-[#1A1A1A] p-4">
                <p className="text-xs text-white/50">Medida {appeal.action_id.slice(0, 8)} · {new Date(appeal.created_at).toLocaleString("pt-BR")}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-white">{appeal.statement}</p>
                <textarea value={appealDecision[appeal.id] || ""} onChange={(event) => setAppealDecision((current) => ({ ...current, [appeal.id]: event.target.value }))} placeholder="Fundamentação da decisão" maxLength={3000} className="mt-3 min-h-20 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white" />
                <div className="mt-2 flex gap-2"><button disabled={saving} onClick={() => resolveAppeal(appeal, false)} className="inline-flex items-center gap-1 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-300"><XCircle className="h-4 w-4" /> Negar</button><button disabled={saving} onClick={() => resolveAppeal(appeal, true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Aceitar e revogar</button></div>
              </div>
            ))}
            {appeals.length === 0 && <p className="py-6 text-center text-xs text-white/40">Nenhum recurso aguardando análise.</p>}
          </div>
        </section>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 sm:items-center">
          <div className="w-full max-w-2xl rounded-2xl bg-[#111] p-5 text-white">
            <div className="flex items-center justify-between gap-3"><h2 className="font-bold">Analisar denúncia</h2><button onClick={() => setSelected(null)} className="text-white/50">Fechar</button></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><Info label="Alvo" value={selected.target_kind} /><Info label="Motivo" value={selected.reason_code} /></div>
            {selected.details && <div className="mt-3 rounded-xl bg-white/5 p-3 text-sm"><p className="mb-1 text-[10px] uppercase text-white/40">Relato</p>{selected.details}</div>}
            <div className="mt-3 rounded-xl bg-black/30 p-3"><p className="mb-2 text-[10px] uppercase text-white/40">Evidência capturada no servidor</p><pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all text-[11px] text-white/70">{JSON.stringify(selected.evidence_snapshot, null, 2)}</pre></div>
            {selected.status === "open" || selected.status === "reviewing" ? (
              <div className="mt-4 space-y-3">
                <label className="block text-xs text-white/60">Medida<select value={actionType} onChange={(event) => setActionType(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1A1A] px-3 py-2 text-sm text-white">{actionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                {["group_mute", "suspend_posting"].includes(actionType) && <label className="block text-xs text-white/60">Duração em dias<input type="number" min="1" max="365" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1A1A] px-3 py-2 text-sm text-white" /></label>}
                <label className="block text-xs text-white/60">Justificativa visível ao usuário<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} className="mt-1 min-h-20 w-full rounded-lg border border-white/10 bg-[#1A1A1A] p-3 text-sm text-white" /></label>
                <label className="block text-xs text-white/60">Notas internas (opcional)<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={3000} className="mt-1 min-h-16 w-full rounded-lg border border-white/10 bg-[#1A1A1A] p-3 text-sm text-white" /></label>
                <div className="flex flex-wrap gap-2"><button disabled={saving} onClick={() => resolve("dismissed")} className="rounded-lg bg-white/10 px-4 py-2 text-xs font-bold">Encerrar sem medida</button><button disabled={saving} onClick={() => resolve("actioned")} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Aplicar medida</button></div>
              </div>
            ) : <p className="mt-4 rounded-lg bg-white/5 p-3 text-sm">Decisão: {selected.resolution}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white/5 p-3"><p className="text-[10px] uppercase text-white/40">{label}</p><p className="mt-1 text-sm font-semibold">{value.replaceAll("_", " ")}</p></div>;
}
