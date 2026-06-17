import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, ClipboardCheck, Clock, ExternalLink, KeyRound, Loader2, LogOut, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyOnboardingStage,
  submitQuizResult,
  unlockCoachWithId,
  markAlreadyCoach,
  QUIZ_URL,
  ACTIVATION_PRODUCT_ID,
} from "@/lib/coach-onboarding.functions";
import { MercadoPagoCheckout } from "@/components/payments/MercadoPagoCheckout";
import { SubscriptionInvoicesTab } from "@/components/profile/SubscriptionInvoicesTab";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

type Stage = "awaiting_payment" | "awaiting_quiz_result" | "awaiting_upline_release" | "released";

interface Props {
  children: ReactNode;
}

export function CoachOnboardingGate({ children }: Props) {
  const fetchStage = useServerFn(getMyOnboardingStage);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<Stage | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [alreadyCoach, setAlreadyCoach] = useState(false);

  const reload = async () => {
    try {
      const res = await fetchStage();
      if (!res || !res.isCoach) {
        setStage("released");
        return;
      }
      setStage(res.stage);
      setProfileId(res.profileId);
      setCoachId(res.coachId);
      setEmail(res.email || "");
      setName(res.name || "");
      setAlreadyCoach(Boolean((res as { alreadyCoach?: boolean }).alreadyCoach));
    } catch (e) {
      console.error(e);
      setStage("released");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: avança o gate automaticamente quando o estado muda no banco
  useEffect(() => {
    if (!coachId) return;
    const channel = supabase
      .channel(`coach-stage-${coachId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "coaches", filter: `id=eq.${coachId}` },
        (payload) => {
          const newStage = (payload.new as { onboarding_stage?: Stage } | null)?.onboarding_stage;
          if (newStage && newStage !== stage) {
            setStage(newStage);
            if (newStage === "released") toast.success("🎉 Painel liberado!");
            else if (newStage === "awaiting_quiz_result") toast.success("Pagamento confirmado!");
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coachId, stage]);

  if (loading || !stage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  if (stage === "released") return <>{children}</>;

  return (
    <GateShell stage={stage} email={email} name={name} profileId={profileId} alreadyCoach={alreadyCoach} onRefresh={reload} />
  );
}

function GateShell({
  stage,
  email,
  name,
  profileId,
  alreadyCoach,
  onRefresh,
}: {
  stage: Stage;
  email: string;
  name: string;
  profileId: string | null;
  alreadyCoach: boolean;
  onRefresh: () => void;
}) {
  const navigate = useNavigate();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo className="h-9 w-9 object-contain" />
            <span className="text-lg font-bold text-white">FitMind Club</span>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white/50 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </header>

        <Stepper stage={stage} alreadyCoach={alreadyCoach} />

        {stage === "awaiting_payment" && (
          <PaymentStep email={email} name={name} profileId={profileId} onPaid={onRefresh} />
        )}
        {stage === "awaiting_quiz_result" && <QuizStep onSubmitted={onRefresh} />}
        {stage === "awaiting_upline_release" && (
          alreadyCoach
            ? <AlreadyCoachWaitingStep />
            : <WaitingReleaseStep onReleased={onRefresh} />
        )}
      </div>
    </div>
  );
}

function Stepper({ stage, alreadyCoach }: { stage: Stage; alreadyCoach?: boolean }) {
  const steps: { id: Stage; label: string }[] = alreadyCoach
    ? [
        { id: "awaiting_quiz_result", label: "Quiz comportamental" },
        { id: "awaiting_upline_release", label: "Aguardando admin" },
      ]
    : [
        { id: "awaiting_payment", label: "Pagar curso" },
        { id: "awaiting_quiz_result", label: "Concluir & enviar resultado" },
        { id: "awaiting_upline_release", label: "Liberar ID" },
      ];
  const currentIdx = steps.findIndex((s) => s.id === stage);
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.id} className="flex-1">
          <div
            className={`h-1.5 rounded-full ${i <= currentIdx ? "bg-primary" : "bg-white/10"}`}
          />
          <p
            className={`mt-1 text-[10px] text-center ${
              i === currentIdx ? "text-primary font-bold" : "text-white/40"
            }`}
          >
            {s.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function PaymentStep({
  email,
  name,
  profileId,
  onPaid,
}: {
  email: string;
  name: string;
  profileId: string | null;
  onPaid: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState<number>(0);

  const startCheckout = async () => {
    if (!profileId) return;
    setCreating(true);
    try {
      // Busca/cria pedido com o produto de ativação
      const { data: orderIdRpc, error } = await supabase.rpc(
        "create_store_order" as never,
        {
          _items: [{ kind: "digital", sourceId: ACTIVATION_PRODUCT_ID, quantity: 1 }],
          _payment_method: "pix",
          _shipping: {},
          _notes: "Ativação Coach (onboarding)",
        } as never
      );
      if (error) throw new Error(error.message);
      const { data: order } = await supabase
        .from("store_orders" as never)
        .select("id,total_amount" as never)
        .eq("id" as never, orderIdRpc as never)
        .maybeSingle();
      const od = order as unknown as { id: string; total_amount: number } | null;
      setOrderId(od?.id || String(orderIdRpc));
      setOrderTotal(Number(od?.total_amount || 179.9));
    } catch (e) {
      const err = e as Error;
      toast.error(err.message || "Falha ao criar pedido");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <CreditCard className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-white">Faça o curso de Formação de Coachs</h1>
        <p className="mt-2 text-sm text-white/70">
          Inicie sua trajetória conosco. Para liberar o painel de coach, é necessário concluir o
          curso de formação. Comece pelo pagamento da ativação.
        </p>
      </div>

      {!orderId ? (
        <>
          <Button
            onClick={startCheckout}
            disabled={creating}
            className="w-full h-12 text-base font-bold"
          >
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Pagar Ativação Coach (R$ 179,90)
          </Button>
          <AlreadyCoachButton onDone={onPaid} />
        </>
      ) : (
        <MercadoPagoCheckout
          source={{ kind: "store_order", id: orderId }}
          amount={orderTotal}
          description="Ativação Coach - Anual"
          defaultPayer={{ email, name }}
          initialMethod="pix"
          onApproved={onPaid}
        />
      )}
    </div>
  );
}

function AlreadyCoachButton({ onDone }: { onDone: () => void }) {
  const mark = useServerFn(markAlreadyCoach);
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    if (!confirm("Confirmar que você já fez o curso e já pagou a ativação? O admin será notificado para liberar seu acesso.")) return;
    setBusy(true);
    try {
      await mark();
      toast.success("Solicitação enviada ao admin!");
      onDone();
    } catch (e) {
      toast.error((e as Error).message || "Falha ao enviar solicitação");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      onClick={handle}
      disabled={busy}
      variant="outline"
      className="w-full h-12 border-white/15 bg-white/5 text-white hover:bg-white/10 gap-2"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
      Já sou coach (já fiz o curso e paguei)
    </Button>
  );
}

function AlreadyCoachWaitingStep() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Clock className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-white">Em breve o admin irá liberar seu acesso</h1>
        <p className="mt-2 text-sm text-white/70">
          Sua solicitação foi enviada. Converse com o seu coach para agilizar a liberação.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-white/60">
          Mensalidade do coach
        </h2>
        <p className="mb-4 text-xs text-white/50">
          Escolha o melhor dia de vencimento e pague a mensalidade abaixo. Assim que o admin liberar seu acesso, sua carteirinha já estará ativa.
        </p>
        <SubscriptionInvoicesTab walletSource="coach" />
      </div>
    </div>
  );
}

function QuizStep({ onSubmitted }: { onSubmitted: () => void }) {
  const submit = useServerFn(submitQuizResult);
  const [url, setUrl] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!url.trim()) {
      toast.error("Cole o link do resultado.");
      return;
    }
    setSending(true);
    try {
      await submit({ data: { url: url.trim() } });
      toast.success("Resultado enviado!");
      onSubmitted();
    } catch (e) {
      const err = e as Error;
      toast.error(err.message || "Não foi possível enviar o link");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <ClipboardCheck className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-white">Pagamento confirmado! ✅</h1>
        <p className="mt-2 text-sm text-white/70">
          Agora acesse o quiz de formação. Ao concluir, copie o link da página de resultado e cole
          abaixo para avançar.
        </p>
      </div>

      <a
        href={QUIZ_URL}
        target="_blank"
        rel="noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-3 text-sm font-bold text-white hover:bg-white/10"
      >
        Abrir quiz de formação <ExternalLink className="h-4 w-4" />
      </a>

      <div className="space-y-2 rounded-2xl border border-white/10 p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <label className="text-xs font-bold uppercase text-white/60">
          Cole aqui o link do resultado
        </label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://diagnostic-quiz-craft.lovable.app/..."
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary"
        />
        <Button onClick={handleSubmit} disabled={sending} className="w-full h-11 font-bold">
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Enviar resultado
        </Button>
      </div>
    </div>
  );
}

function WaitingReleaseStep({ onReleased }: { onReleased: () => void }) {
  const unlock = useServerFn(unlockCoachWithId);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<{
    coachNumber: number | null;
    approvedAt: string | null;
  } | null>(null);

  const validate = (raw: string): { ok: true; num: number } | { ok: false; msg: string } => {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, msg: "Digite o seu ID de coach." };
    if (!/^\d+$/.test(trimmed))
      return { ok: false, msg: "Apenas números são aceitos (inteiro positivo)." };
    const num = parseInt(trimmed, 10);
    if (!Number.isFinite(num) || num < 1)
      return { ok: false, msg: "O ID deve ser um número inteiro maior que zero." };
    if (num > 9999999) return { ok: false, msg: "ID muito longo. Verifique o número." };
    return { ok: true, num };
  };

  const submit = async () => {
    setError(null);
    const v = validate(value);
    if (!v.ok) {
      setError(v.msg);
      toast.error(v.msg);
      return;
    }
    setSending(true);
    try {
      const res = await unlock({ data: { coachNumber: v.num } });
      setSuccess({
        coachNumber: res?.coachNumber ?? v.num,
        approvedAt: res?.approvedAt ?? new Date().toISOString(),
      });
      toast.success("🎉 Painel liberado!");
    } catch (e) {
      const msg = (e as Error).message || "Falha ao liberar";
      setError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  if (success) {
    const when = success.approvedAt
      ? new Date(success.approvedAt).toLocaleString("pt-BR")
      : null;
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
          <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
            <KeyRound className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-white">ID validado com sucesso 🎉</h1>
          <p className="mt-2 text-sm text-white/70">
            Seu painel de coach foi liberado e está pronto para uso.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-left">
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Seu ID</p>
              <p className="mt-1 text-lg font-bold text-white">#{success.coachNumber ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Liberado em</p>
              <p className="mt-1 text-xs font-semibold text-white">{when || "—"}</p>
            </div>
          </div>
        </div>
        <Button onClick={onReleased} className="w-full h-12 text-base font-bold">
          Acessar meu painel
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Clock className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-white">Faça o curso de coach e libere seu ID</h1>
        <p className="mt-3 text-sm text-white/70">
          Ao concluir o curso de formação, você receberá um <strong className="text-white">ID único</strong>{" "}
          junto com seu certificado. Insira esse número abaixo para liberar o seu painel.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-white">
          <KeyRound className="h-4 w-4 text-primary" />
          Seu ID de coach
        </label>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/\D/g, ""));
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !sending) submit();
          }}
          placeholder="Ex: 42"
          aria-invalid={!!error}
          className={`w-full rounded-lg border bg-white/5 px-3 py-3 text-center text-2xl font-bold tracking-widest text-white placeholder:text-white/20 focus:outline-none ${
            error ? "border-red-500/60 focus:border-red-400" : "border-white/10 focus:border-primary"
          }`}
        />
        {error && (
          <p className="text-xs font-semibold text-red-400" role="alert">
            {error}
          </p>
        )}
        <Button onClick={submit} disabled={sending || !value} className="w-full h-11 font-bold">
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
          Liberar painel
        </Button>
        <p className="text-[11px] text-white/40 text-center">
          O ID está vinculado à sua conta — só funciona com o número certo. Após 10 tentativas
          inválidas, será necessário contatar o suporte.
        </p>
      </div>
    </div>
  );
}
