import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, FlaskConical, Loader2, Search, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PushResult = {
  tokensFound?: number;
  sent?: number;
  errors?: unknown[];
  cleanedInvalidTokens?: number;
};

export const Route = createFileRoute("/admin/push-notifications")({
  component: PushNotificationsPage,
});

type UserResult = {
  user_id: string;
  name: string | null;
  email: string | null;
  device_count: number;
};

function PushNotificationsPage() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserResult[]>([]);
  const [selected, setSelected] = useState<UserResult | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<PushResult | null>(null);

  const search = async () => {
    const term = query.trim();
    if (term.length < 2) {
      toast.error("Informe ao menos 2 caracteres");
      return;
    }
    setSearching(true);
    setResults([]);
    setSelected(null);

    const { data: profiles, error } = await supabase
      .from("profiles" as never)
      .select("user_id,name,email" as never)
      .or(`name.ilike.%${term}%,email.ilike.%${term}%` as never)
      .limit(20);

    if (error) {
      toast.error(error.message);
      setSearching(false);
      return;
    }

    const rows = (profiles as unknown as Array<{ user_id: string; name: string | null; email: string | null }>) || [];
    if (rows.length === 0) {
      setSearching(false);
      return;
    }

    const ids = rows.map((r) => r.user_id);
    const { data: tokens } = await supabase
      .from("device_tokens" as never)
      .select("user_id" as never)
      .in("user_id" as never, ids as never);

    const counts = new Map<string, number>();
    ((tokens as unknown as Array<{ user_id: string }>) || []).forEach((t) => {
      counts.set(t.user_id, (counts.get(t.user_id) || 0) + 1);
    });

    setResults(
      rows.map((r) => ({
        user_id: r.user_id,
        name: r.name,
        email: r.email,
        device_count: counts.get(r.user_id) || 0,
      })),
    );
    setSearching(false);
  };

  const send = async () => {
    if (!selected) return;
    if (!title.trim() || !body.trim()) {
      toast.error("Preencha título e mensagem");
      return;
    }
    if (selected.device_count === 0) {
      toast.error("Usuário não possui dispositivos registrados");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-push-notification", {
        body: {
          userId: selected.user_id,
          title: title.trim(),
          body: body.trim(),
        },
      });

      if (error) {
        toast.error(`Erro ao enviar: ${error.message}`);
        return;
      }

      const result = data as { tokensFound?: number; sent?: number; errors?: unknown[] };
      const sent = result?.sent ?? 0;
      const found = result?.tokensFound ?? 0;
      const errs = result?.errors?.length ?? 0;

      if (sent > 0) {
        toast.success(`Notificação enviada para ${sent}/${found} dispositivo(s)${errs ? ` · ${errs} erro(s)` : ""}`);
        setTitle("");
        setBody("");
      } else {
        toast.error(`Nenhuma notificação entregue (${found} dispositivo(s) encontrados, ${errs} erro(s))`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setSending(false);
    }
  };

  const sendTestPush = async () => {
    setTestSending(true);
    setTestResult(null);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        toast.error("Você precisa estar logado para enviar um push de teste");
        return;
      }

      const { data, error } = await supabase.functions.invoke("send-push-notification", {
        body: {
          userId: userData.user.id,
          title: "FitMind Teste",
          body: "Seu sistema de notificações está funcionando corretamente.",
        },
      });

      if (error) {
        toast.error(`Erro ao enviar push de teste: ${error.message}`);
        setTestResult({ errors: [error.message] });
        return;
      }

      const result = data as PushResult;
      setTestResult(result);

      const sent = result?.sent ?? 0;
      const found = result?.tokensFound ?? 0;
      const errs = result?.errors?.length ?? 0;

      if (sent > 0) {
        toast.success(`Push de teste enviado para ${sent}/${found} dispositivo(s)${errs ? ` · ${errs} erro(s)` : ""}`);
      } else {
        toast.error(`Nenhum push de teste entregue (${found} dispositivo(s) encontrados, ${errs} erro(s))`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(message);
      setTestResult({ errors: [message] });
    } finally {
      setTestSending(false);
    }
  };

  const renderResult = (result: PushResult | null) => {
    if (!result) return null;
    const found = result.tokensFound ?? 0;
    const sent = result.sent ?? 0;
    const errs = result.errors?.length ?? 0;
    const cleaned = result.cleanedInvalidTokens ?? 0;

    return (
      <div className="mt-4 rounded-xl border border-white/5 bg-white/5 p-3 text-xs">
        <p className="mb-1 font-semibold text-white/80">Resultado do envio</p>
        <div className="grid grid-cols-2 gap-2 text-white/60 sm:grid-cols-4">
          <div>
            <span className="block text-[10px] uppercase text-white/40">Encontrados</span>
            <span className="font-bold text-white">{found}</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase text-white/40">Enviados</span>
            <span className="font-bold text-primary">{sent}</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase text-white/40">Erros</span>
            <span className={`font-bold ${errs > 0 ? "text-red-400" : "text-white"}`}>{errs}</span>
          </div>
          {cleaned > 0 && (
            <div>
              <span className="block text-[10px] uppercase text-white/40">Limpados</span>
              <span className="font-bold text-white">{cleaned}</span>
            </div>
          )}
        </div>
        {result.errors && result.errors.length > 0 && (
          <div className="mt-2 max-h-32 overflow-auto rounded bg-black/30 p-2 font-mono text-[10px] text-red-300">
            {result.errors.map((e, i) => (
              <div key={i}>{typeof e === "string" ? e : JSON.stringify(e)}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" /> Push Notifications
        </h1>
        <p className="text-sm text-white/50">Envie notificações para usuários específicos via Firebase Cloud Messaging</p>
      </div>

      {/* Teste rápido */}
      <div className="rounded-2xl border border-white/5 p-5 mb-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Enviar Push de Teste</p>
              <p className="text-xs text-white/50">
                Envia uma notificação de teste para o usuário logado: <strong className="text-white/80">FitMind Teste</strong>
              </p>
            </div>
          </div>
          <Button onClick={sendTestPush} disabled={testSending} variant="outline" className="gap-2 shrink-0 border-white/10 hover:bg-white/5">
            {testSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar Push de Teste
          </Button>
        </div>
        {renderResult(testResult)}
      </div>

      {/* Busca */}
      <div className="rounded-2xl border border-white/5 p-5 mb-5" style={{ backgroundColor: "#1A1A1A" }}>
        <p className="mb-3 text-xs font-bold uppercase text-white/40">Buscar usuário</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Nome ou email..."
            className="field-control flex-1"
          />
          <Button onClick={search} disabled={searching} className="gap-2">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </Button>
        </div>

        {results.length > 0 && (
          <div className="mt-4 space-y-2">
            {results.map((r) => {
              const active = selected?.user_id === r.user_id;
              return (
                <button
                  key={r.user_id}
                  onClick={() => setSelected(r)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    active ? "border-primary bg-primary/10" : "border-white/5 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{r.name || "Sem nome"}</p>
                      <p className="truncate text-xs text-white/45">{r.email || "—"}</p>
                    </div>
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                        r.device_count > 0 ? "bg-primary/15 text-primary" : "bg-white/10 text-white/40"
                      }`}
                    >
                      <Smartphone className="h-3 w-3" />
                      {r.device_count} disp.
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {!searching && results.length === 0 && query && (
          <p className="mt-4 text-center text-xs text-white/40">Nenhum usuário encontrado</p>
        )}
      </div>

      {/* Composição */}
      <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <p className="mb-3 text-xs font-bold uppercase text-white/40">Mensagem</p>

        {selected ? (
          <div className="mb-4 rounded-xl bg-primary/10 border border-primary/20 p-3">
            <p className="text-xs text-white/50">Destinatário</p>
            <p className="font-semibold text-white">{selected.name || "Sem nome"}</p>
            <p className="text-xs text-white/50">{selected.email}</p>
            <p className="mt-1 text-xs text-primary flex items-center gap-1">
              <Smartphone className="h-3 w-3" /> {selected.device_count} dispositivo(s) registrados
            </p>
          </div>
        ) : (
          <p className="mb-4 rounded-xl bg-white/5 p-3 text-xs text-white/40">Selecione um usuário acima</p>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/60">Título</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Ex.: Lembrete de treino"
              className="field-control"
              disabled={!selected}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/60">Mensagem</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={300}
              rows={4}
              placeholder="Conteúdo da notificação..."
              className="field-control"
              disabled={!selected}
            />
            <p className="mt-1 text-right text-[10px] text-white/35">{body.length}/300</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={send} disabled={sending || !selected || !title.trim() || !body.trim()} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar Notificação
          </Button>
        </div>
      </div>
    </>
  );
}
