import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, FileWarning, Flag, Loader2, RotateCcw, Scale, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/student/safety")({
  head: () => ({ meta: [{ title: "Central de Segurança — FitMind Club" }] }),
  component: StudentSafetyPage,
});

type BlockRow = {
  id: string;
  blocked_profile_id: string | null;
  blocked_partner_id: string | null;
  blocked_whatsapp_group_id: string | null;
  created_at: string;
};
type ReportRow = { id: string; target_kind: string; reason_code: string; status: string; resolution: string | null; created_at: string };
type ActionRow = { id: string; action_type: string; public_reason: string; expires_at: string | null; revoked_at: string | null; created_at: string };
type AppealRow = { id: string; action_id: string; status: string; decision: string | null; created_at: string };

const statusLabel: Record<string, string> = {
  open: "Recebida",
  reviewing: "Em análise",
  actioned: "Medida aplicada",
  dismissed: "Encerrada",
  pending: "Aguardando análise",
  accepted: "Recurso aceito",
  rejected: "Recurso negado",
};

function StudentSafetyPage() {
  const [loading, setLoading] = useState(true);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [appealFor, setAppealFor] = useState<string | null>(null);
  const [statement, setStatement] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [blockResult, reportResult, actionResult, appealResult] = await Promise.all([
      supabase.from("ugc_blocks" as never).select("id,blocked_profile_id,blocked_partner_id,blocked_whatsapp_group_id,created_at" as never).order("created_at" as never, { ascending: false }),
      supabase.from("ugc_reports" as never).select("id,target_kind,reason_code,status,resolution,created_at" as never).order("created_at" as never, { ascending: false }).limit(50),
      supabase.from("ugc_moderation_actions" as never).select("id,action_type,public_reason,expires_at,revoked_at,created_at" as never).order("created_at" as never, { ascending: false }).limit(50),
      supabase.from("ugc_appeals" as never).select("id,action_id,status,decision,created_at" as never).order("created_at" as never, { ascending: false }).limit(50),
    ]);
    const firstError = blockResult.error || reportResult.error || actionResult.error || appealResult.error;
    if (firstError) toast.error("Não foi possível carregar a Central de Segurança.");
    setBlocks((blockResult.data as unknown as BlockRow[]) || []);
    setReports((reportResult.data as unknown as ReportRow[]) || []);
    setActions((actionResult.data as unknown as ActionRow[]) || []);
    setAppeals((appealResult.data as unknown as AppealRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  const appealsByAction = useMemo(() => new Map(appeals.map((appeal) => [appeal.action_id, appeal])), [appeals]);

  const unblock = async (block: BlockRow) => {
    const kind = block.blocked_profile_id ? "profile" : block.blocked_partner_id ? "partner" : "whatsapp_group";
    const id = block.blocked_profile_id || block.blocked_partner_id || block.blocked_whatsapp_group_id;
    if (!id) return;
    const { error } = await supabase.rpc("ugc_set_block" as never, {
      _target_kind: kind,
      _target_id: id,
      _blocked: false,
    } as never);
    if (error) return toast.error("Não foi possível desfazer o bloqueio.");
    toast.success("Bloqueio removido.");
    setBlocks((current) => current.filter((item) => item.id !== block.id));
  };

  const appeal = async () => {
    if (!appealFor || statement.trim().length < 20) {
      toast.error("Explique o recurso em pelo menos 20 caracteres.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("ugc_create_appeal" as never, {
      _action_id: appealFor,
      _statement: statement.trim(),
    } as never);
    setSaving(false);
    if (error) return toast.error(error.message.includes("duplicate") ? "Já existe um recurso para esta medida." : "Não foi possível enviar o recurso.");
    toast.success("Recurso enviado.");
    setAppealFor(null);
    setStatement("");
    await load();
  };

  if (loading) return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5 p-4 pb-24">
      <header className="pt-2">
        <div className="flex items-center gap-2"><ShieldCheck className="h-7 w-7 text-primary" /><h1 className="text-2xl font-bold">Central de Segurança</h1></div>
        <p className="mt-1 text-xs text-muted-foreground">Acompanhe denúncias, bloqueios, medidas de moderação e recursos.</p>
        <Link to="/diretrizes-da-comunidade" target="_blank" className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">Ler Diretrizes da Comunidade</Link>
      </header>

      <Panel icon={<Ban />} title={`Bloqueios (${blocks.length})`}>
        {blocks.length === 0 ? <Empty text="Você não bloqueou ninguém ou nenhum conteúdo." /> : blocks.map((block) => {
          const label = block.blocked_profile_id ? "Participante" : block.blocked_partner_id ? "Parceiro" : "Grupo do WhatsApp";
          return (
            <div key={block.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted p-3 text-sm">
              <div><p className="font-semibold">{label}</p><p className="text-[10px] text-muted-foreground">Bloqueado em {new Date(block.created_at).toLocaleDateString("pt-BR")}</p></div>
              <button onClick={() => unblock(block)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs"><RotateCcw className="h-3.5 w-3.5" /> Desbloquear</button>
            </div>
          );
        })}
      </Panel>

      <Panel icon={<Flag />} title={`Minhas denúncias (${reports.length})`}>
        {reports.length === 0 ? <Empty text="Nenhuma denúncia enviada." /> : reports.map((report) => (
          <div key={report.id} className="rounded-xl bg-muted p-3 text-sm">
            <div className="flex items-center justify-between gap-2"><p className="font-semibold">{report.target_kind.replaceAll("_", " ")}</p><span className="rounded-full bg-background px-2 py-1 text-[10px]">{statusLabel[report.status] || report.status}</span></div>
            <p className="mt-1 text-xs text-muted-foreground">Motivo: {report.reason_code.replaceAll("_", " ")}</p>
            {report.resolution && <p className="mt-2 text-xs">Decisão: {report.resolution}</p>}
          </div>
        ))}
      </Panel>

      <Panel icon={<FileWarning />} title={`Medidas na minha conta (${actions.length})`}>
        {actions.length === 0 ? <Empty text="Nenhuma medida de moderação aplicada à sua conta." /> : actions.map((action) => {
          const existingAppeal = appealsByAction.get(action.id);
          const appealWindowOpen = Date.now() - new Date(action.created_at).getTime() <= 90 * 24 * 60 * 60 * 1000;
          return (
            <div key={action.id} className="rounded-xl bg-muted p-3 text-sm">
              <div className="flex items-center justify-between gap-2"><p className="font-semibold">{action.action_type.replaceAll("_", " ")}</p>{action.revoked_at && <span className="text-[10px] text-emerald-500">Revogada</span>}</div>
              <p className="mt-1 text-xs">{action.public_reason}</p>
              {action.expires_at && <p className="mt-1 text-[10px] text-muted-foreground">Até {new Date(action.expires_at).toLocaleString("pt-BR")}</p>}
              {existingAppeal ? (
                <div className="mt-2 rounded-lg bg-background p-2 text-xs">
                  <p className="font-semibold">{statusLabel[existingAppeal.status] || existingAppeal.status}</p>
                  {existingAppeal.decision && <p className="mt-1 text-muted-foreground">{existingAppeal.decision}</p>}
                </div>
              ) : !action.revoked_at && appealWindowOpen ? (
                <button onClick={() => setAppealFor(action.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary"><Scale className="h-3.5 w-3.5" /> Recorrer</button>
              ) : !action.revoked_at ? (
                <p className="mt-2 text-[10px] text-muted-foreground">Prazo de 90 dias para recurso encerrado.</p>
              ) : null}
            </div>
          );
        })}
      </Panel>

      {appealFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-5 text-card-foreground">
            <h2 className="font-bold">Enviar recurso</h2>
            <p className="mt-1 text-xs text-muted-foreground">Explique por que a medida deve ser revista. Outro administrador fará a análise.</p>
            <textarea value={statement} onChange={(event) => setStatement(event.target.value)} maxLength={3000} className="mt-3 min-h-32 w-full rounded-xl border border-border bg-background p-3 text-sm" />
            <div className="mt-3 flex gap-2"><button onClick={() => setAppealFor(null)} className="flex-1 rounded-xl border border-border py-2 text-sm">Cancelar</button><button disabled={saving} onClick={appeal} className="flex-1 rounded-xl bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">Enviar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl bg-card p-4"><div className="mb-3 flex items-center gap-2 text-primary"><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span><h2 className="text-sm font-bold text-foreground">{title}</h2></div><div className="space-y-2">{children}</div></section>;
}

function Empty({ text }: { text: string }) {
  return <p className="py-3 text-center text-xs text-muted-foreground">{text}</p>;
}
