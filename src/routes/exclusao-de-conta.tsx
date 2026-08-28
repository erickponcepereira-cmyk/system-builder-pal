import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, CheckCircle2, Loader2, LogIn, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import {
  cancelMyAccountDeletion,
  getMyAccountDeletionRequest,
  requestMyAccountDeletion,
  type AccountDeletionRequest,
} from "@/lib/account-deletion.functions";

export const Route = createFileRoute("/exclusao-de-conta")({
  head: () => ({
    meta: [
      { title: "Exclusão de conta — FitMind Club" },
      { name: "description", content: "Solicite a exclusão da sua conta FitMind Club e dos dados pessoais vinculados." },
    ],
  }),
  component: AccountDeletionPage,
});

function AccountDeletionPage() {
  const loadRequest = useServerFn(getMyAccountDeletionRequest);
  const sendRequest = useServerFn(requestMyAccountDeletion);
  const cancelRequest = useServerFn(cancelMyAccountDeletion);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [request, setRequest] = useState<AccountDeletionRequest | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setEmail(data.user?.email ?? null);
      if (data.user) {
        try {
          const current = await loadRequest();
          if (active) setRequest(current);
        } catch {
          // O envio exibe um erro caso a migration ainda não esteja publicada.
        }
      }
      if (active) setCheckingSession(false);
    })();
    return () => { active = false; };
  }, [loadRequest]);

  const handleRequest = async () => {
    if (confirmation !== "EXCLUIR" || !accepted || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await sendRequest({ data: { confirmation: "EXCLUIR" } });
      setRequest(created);
      setConfirmation("");
      setAccepted(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a solicitação.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!request || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await cancelRequest();
      setRequest(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cancelar a solicitação.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="mb-8 inline-flex items-center gap-3">
          <Logo className="h-10 w-10" />
          <span className="text-lg font-bold">FitMind Club</span>
        </Link>

        {request ? (
          <section className="rounded-3xl border border-amber-500/30 bg-card p-6 sm:p-8">
            <CheckCircle2 className="h-10 w-10 text-amber-300" />
            <h1 className="mt-4 text-2xl font-bold">Solicitação registrada</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Recebemos o pedido de exclusão da conta <strong className="text-foreground">{email}</strong>.
              O processamento será concluído até a data abaixo, após cancelar cobranças recorrentes e
              separar os registros que precisam de retenção legal.
            </p>
            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-foreground/5 p-4">
              <CalendarClock className="h-5 w-5 text-amber-300" />
              <div>
                <p className="text-xs text-muted-foreground">Prazo máximo informado</p>
                <p className="font-bold">{new Date(request.dueAt).toLocaleDateString("pt-BR")}</p>
              </div>
            </div>
            {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
            <button type="button" disabled={submitting} onClick={() => void handleCancel()} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Cancelar solicitação
            </button>
          </section>
        ) : (
          <section className="rounded-3xl border border-red-500/25 bg-card p-6 sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15">
              <Trash2 className="h-6 w-6 text-red-400" />
            </div>
            <h1 className="mt-4 text-2xl font-bold">Solicitar exclusão de conta e dados</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Esta é a página oficial para iniciar a exclusão de uma conta do FitMind Club pelo
              aplicativo ou pela web. O pedido é permanente depois de processado.
            </p>

            <div className="mt-6 rounded-2xl bg-foreground/5 p-4 text-sm">
              <p className="font-semibold">O que entra no pedido</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>login, perfil, foto, dados de saúde e preferências;</li>
                <li>vínculos de aluno, coach, profissional ou parceiro;</li>
                <li>tokens de notificação e demais dados diretamente associados à conta.</li>
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Comprovantes e registros transacionais podem ser preservados de forma restrita quando
                houver obrigação legal, fiscal, defesa de direitos ou prevenção a fraude. Eles deixam
                de ser usados para publicidade e são anonimizados quando possível.
              </p>
            </div>

            {checkingSession ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando sua sessão…
              </div>
            ) : !email ? (
              <div className="mt-6 rounded-2xl border border-border p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">Confirme a titularidade da conta</p>
                    <p className="mt-1 text-xs text-muted-foreground">Entre com a conta que deseja excluir. Depois do login você voltará para esta página.</p>
                  </div>
                </div>
                <a href="/login?next=%2Fexclusao-de-conta" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">
                  <LogIn className="h-4 w-4" /> Entrar para continuar
                </a>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <p className="rounded-xl border border-border px-4 py-3 text-sm">Conta autenticada: <strong>{email}</strong></p>
                <label className="block text-sm">
                  <span className="font-semibold">Digite EXCLUIR para confirmar</span>
                  <input value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())} autoComplete="off" className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 outline-none focus:border-red-400" placeholder="EXCLUIR" />
                </label>
                <label className="flex items-start gap-3 text-sm text-muted-foreground">
                  <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4" />
                  <span>Entendo que perderei o acesso quando o pedido for processado e que a exclusão não poderá ser desfeita.</span>
                </label>
                {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
                <button type="button" disabled={confirmation !== "EXCLUIR" || !accepted || submitting} onClick={() => void handleRequest()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {submitting ? "Registrando solicitação…" : "Solicitar exclusão da minha conta"}
                </button>
              </div>
            )}
          </section>
        )}

        <div className="mt-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link to="/privacidade" className="hover:text-foreground hover:underline">Política de Privacidade</Link>
          <Link to="/security" className="hover:text-foreground hover:underline">Segurança</Link>
          <Link to="/termos" className="hover:text-foreground hover:underline">Termos de Uso</Link>
        </div>
      </div>
    </main>
  );
}
