import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, Search, Link2Off, History, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/evaluation-links")({
  head: () => ({ meta: [{ title: "Vinculações de Avaliação — Admin" }] }),
  component: EvaluationLinksPage,
});

type LinkRow = {
  id: string;
  coach_id: string;
  name: string;
  email: string | null;
  student_id: string;
  updated_at: string;
  coach?: { profiles?: { name: string | null; email: string | null } | null } | null;
  student?: { profile?: { name: string | null; email: string | null } | null } | null;
};

type AuditRow = {
  id: string;
  action: string;
  created_at: string;
  performed_by_role: string | null;
  reason: string | null;
  metadata: any;
  new_student_id: string | null;
  previous_student_id: string | null;
};

function EvaluationLinksPage() {
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [historyClientId, setHistoryClientId] = useState<string | null>(null);
  const [history, setHistory] = useState<AuditRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState<LinkRow | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      // Paginação para suportar contas com > 1000 vinculações
      const PAGE = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("coach_evaluation_clients" as never)
          .select(
            "id, coach_id, name, email, student_id, updated_at, coach:coach_id(profiles:profile_id(name,email)), student:student_id(profile:profile_id(name,email))" as never,
          )
          .not("student_id" as never, "is" as never, null as never)
          .order("updated_at" as never, { ascending: false } as never)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const page = (data as any[]) || [];
        all.push(...page);
        if (page.length < PAGE) break;
        from += PAGE;
      }
      setRows(all as LinkRow[]);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar vinculações");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => {
      const parts = [
        r.name,
        r.email,
        r.coach?.profiles?.name,
        r.coach?.profiles?.email,
        r.student?.profile?.name,
        r.student?.profile?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return parts.includes(t);
    });
  }, [q, rows]);

  const openHistory = async (clientId: string) => {
    setHistoryClientId(clientId);
    setHistoryLoading(true);
    setHistory([]);
    const { data, error } = await supabase
      .from("evaluation_link_audit" as never)
      .select("id,action,created_at,performed_by_role,reason,metadata,new_student_id,previous_student_id" as never)
      .eq("client_id" as never, clientId as never)
      .order("created_at" as never, { ascending: false } as never);
    if (!error) setHistory(((data as any[]) || []) as AuditRow[]);
    setHistoryLoading(false);
  };

  const doUnlink = async (row: LinkRow) => {
    setBusy(row.id);
    try {
      const previousStudentId = row.student_id;

      // 1) desliga student_id do cliente
      const { error: e1 } = await supabase
        .from("coach_evaluation_clients" as never)
        .update({ student_id: null } as never)
        .eq("id" as never, row.id as never);
      if (e1) throw e1;

      // 2) desliga student_id de todas avaliações desse cliente
      const { error: e2 } = await supabase
        .from("coach_body_assessments" as never)
        .update({ student_id: null } as never)
        .eq("client_id" as never, row.id as never);
      if (e2) throw e2;

      // 3) audit
      const { data: sess } = await supabase.auth.getUser();
      await supabase.from("evaluation_link_audit" as never).insert({
        coach_id: row.coach_id,
        client_id: row.id,
        previous_student_id: previousStudentId,
        new_student_id: null,
        action: "unlink",
        performed_by: sess.user?.id ?? null,
        performed_by_role: "admin",
        reason: "Admin desfez vinculação",
        metadata: {
          client_name: row.name,
          student_name: row.student?.profile?.name ?? null,
        },
      } as never);

      toast.success("Vinculação desfeita");
      setConfirmUnlink(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao desvincular");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Vinculações de Avaliação</h1>
            <p className="text-sm text-white/60 mt-1">
              Cadastros importados/manuais vinculados a alunos do sistema. Desfaça vinculações incorretas e veja o histórico completo.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-white/5 hover:bg-white/10 border border-white/10"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Recarregar
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por coach, aluno ou cadastro..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-black/40 border border-white/10 placeholder:text-white/30 focus:outline-none focus:border-primary/60"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-950 overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-2 text-[11px] uppercase tracking-wider text-white/50 bg-white/[0.03] border-b border-white/10">
            <div className="col-span-3">Coach</div>
            <div className="col-span-3">Cadastro (cliente)</div>
            <div className="col-span-3">Aluno vinculado</div>
            <div className="col-span-2">Última atualização</div>
            <div className="col-span-1 text-right">Ações</div>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-white/60">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-white/60">Nenhuma vinculação encontrada.</div>
          ) : (
            filtered.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-12 px-4 py-3 text-sm border-b border-white/5 items-center hover:bg-white/[0.02]"
              >
                <div className="col-span-3 min-w-0">
                  <div className="truncate font-medium">{r.coach?.profiles?.name || "—"}</div>
                  <div className="truncate text-[11px] text-white/40">{r.coach?.profiles?.email}</div>
                </div>
                <div className="col-span-3 min-w-0">
                  <div className="truncate">{r.name}</div>
                  {r.email && <div className="truncate text-[11px] text-white/40">{r.email}</div>}
                </div>
                <div className="col-span-3 min-w-0">
                  <div className="truncate font-medium text-primary/90">
                    {r.student?.profile?.name || "—"}
                  </div>
                  <div className="truncate text-[11px] text-white/40">{r.student?.profile?.email}</div>
                </div>
                <div className="col-span-2 text-[11px] text-white/50">
                  {new Date(r.updated_at).toLocaleString("pt-BR")}
                </div>
                <div className="col-span-1 flex justify-end gap-1">
                  <button
                    title="Ver histórico"
                    onClick={() => openHistory(r.id)}
                    className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white"
                  >
                    <History className="w-4 h-4" />
                  </button>
                  <button
                    title="Desvincular"
                    onClick={() => setConfirmUnlink(r)}
                    disabled={busy === r.id}
                    className="p-1.5 rounded hover:bg-red-500/20 text-red-300 hover:text-red-200 disabled:opacity-40"
                  >
                    <Link2Off className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-white/40">
          Total: {filtered.length} de {rows.length} vinculação(ões) ativa(s).
        </p>
      </div>

      {confirmUnlink && (
        <div
          className="fixed inset-0 z-[110] flex items-start sm:items-center justify-center bg-black/80 p-4 overflow-y-auto overscroll-contain modal-safe"
          onClick={() => busy !== confirmUnlink.id && setConfirmUnlink(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-red-500/40 bg-zinc-950 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h3 className="text-base font-bold">Desfazer vinculação</h3>
            </div>
            <p className="text-sm text-white/80 mb-2">
              Cadastro <b>{confirmUnlink.name}</b> deixará de estar vinculado ao aluno{" "}
              <b>{confirmUnlink.student?.profile?.name || "—"}</b>.
            </p>
            <p className="text-xs text-white/50 mb-4">
              As avaliações continuam existindo, apenas param de aparecer no perfil do aluno. A ação é registrada no histórico.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmUnlink(null)}
                disabled={busy === confirmUnlink.id}
                className="px-3 py-2 text-sm text-white/70 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={() => doUnlink(confirmUnlink)}
                disabled={busy === confirmUnlink.id}
                className="px-4 py-2 text-sm font-bold rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-40"
              >
                {busy === confirmUnlink.id ? "Desvinculando..." : "Confirmar desvinculação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyClientId && (
        <div
          className="fixed inset-0 z-[110] flex items-start sm:items-center justify-center bg-black/80 p-4 overflow-y-auto overscroll-contain modal-safe"
          onClick={() => setHistoryClientId(null)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold">Histórico de vinculações</h3>
              <button onClick={() => setHistoryClientId(null)} className="text-white/60 hover:text-white text-sm">
                ✕
              </button>
            </div>
            {historyLoading ? (
              <div className="p-6 text-center text-sm text-white/60">Carregando...</div>
            ) : history.length === 0 ? (
              <div className="p-6 text-center text-sm text-white/60">Sem eventos registrados.</div>
            ) : (
              <div className="divide-y divide-white/5">
                {history.map((h) => (
                  <div key={h.id} className="py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold uppercase text-xs tracking-wider text-primary/90">
                        {h.action}
                      </span>
                      <span className="text-[11px] text-white/40">
                        {new Date(h.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div className="text-xs text-white/60 mt-1">
                      {h.metadata?.student_name && (
                        <span>Aluno: <b className="text-white/80">{h.metadata.student_name}</b> · </span>
                      )}
                      Por: {h.performed_by_role || "—"}
                    </div>
                    {h.reason && <div className="text-[11px] text-white/50 mt-0.5">{h.reason}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
