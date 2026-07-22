import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Clock, Loader2, LogOut, UserCheck, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfessionalOnboarding } from "@/lib/professional-approvals.functions";
import { markAlreadyCoach } from "@/lib/coach-onboarding.functions";
import { getOrCreateActivationOrder } from "@/lib/activation-order.functions";
import { MercadoPagoCheckout } from "@/components/payments/MercadoPagoCheckout";
import { SubscriptionInvoicesTab } from "@/components/profile/SubscriptionInvoicesTab";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

type Info = {
  isProfessional: boolean;
  profileId: string;
  coachId: string;
  name: string;
  email: string;
  specialtyKey: string | null;
  activationPaidAt: string | null;
  activationSource: string | null;
  approvedAt: string | null;
  alreadyCoach: boolean;
};

export function ProfessionalOnboardingGate({ children }: Props) {
  const fetchInfo = useServerFn(getMyProfessionalOnboarding);
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<Info | null>(null);

  const reload = async () => {
    try {
      const res = (await fetchInfo()) as Info | null;
      setInfo(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  // Realtime: avança automaticamente quando o admin muda o coach no banco
  useEffect(() => {
    if (!info?.coachId) return;
    const channel = supabase
      .channel(`pro-stage-${info.coachId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "coaches", filter: `id=eq.${info.coachId}` },
        (payload) => {
          const n = payload.new as { approved_at?: string | null; activation_paid_at?: string | null };
          if (n?.approved_at && !info.approvedAt) {
            toast.success("🎉 Painel liberado!");
            // recarrega tudo para que o painel real do profissional seja montado
            setTimeout(() => { if (typeof window !== "undefined") window.location.reload(); }, 800);
            return;
          }
          if (n?.activation_paid_at && !info.activationPaidAt) toast.success("Ativação confirmada!");
          reload();
        }

      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [info?.coachId, info?.activationPaidAt, info?.approvedAt]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "#0A0A0A" }}>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  // Não é profissional → deixa o painel decidir (ele mesmo redireciona)
  if (!info || !info.isProfessional) return <>{children}</>;
  if (info.approvedAt) return <>{children}</>;

  return <Gate info={info} onRefresh={reload} />;
}

function Gate({ info, onRefresh }: { info: Info; onRefresh: () => void }) {
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

        <Stepper info={info} />

        {!info.activationPaidAt ? (
          <ActivationStep info={info} onPaid={onRefresh} />
        ) : (
          <WaitingApprovalStep />
        )}
      </div>
    </div>
  );
}

function Stepper({ info }: { info: Info }) {
  const steps = [
    { id: "specialty", label: "Especialidade", done: !!info.specialtyKey },
    { id: "activation", label: "Ativação", done: !!info.activationPaidAt },
    { id: "approve", label: "Aprovação", done: !!info.approvedAt },
  ];
  const currentIdx = steps.findIndex((s) => !s.done);
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.id} className="flex-1">
          <div className={`h-1.5 rounded-full ${s.done || i < currentIdx ? "bg-primary" : i === currentIdx ? "bg-amber-400" : "bg-white/10"}`} />
          <p className={`mt-1 text-[10px] text-center ${i === currentIdx ? "text-primary font-bold" : s.done ? "text-emerald-300" : "text-white/40"}`}>
            {s.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function ActivationStep({ info, onPaid }: { info: Info; onPaid: () => void }) {
  const [creating, setCreating] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState<number>(0);
  const createActivationOrder = useServerFn(getOrCreateActivationOrder);

  const startCheckout = async () => {
    setCreating(true);
    try {
      const order = await createActivationOrder({ data: { notes: "Ativação Profissional (onboarding)" } });
      setOrderId(order.orderId);
      setOrderTotal(Number(order.totalAmount || 179.9));
    } catch (e) {
      toast.error((e as Error).message || "Falha ao criar pedido");
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
        <h1 className="text-xl font-bold text-white">Ativação do Profissional</h1>
        <p className="mt-2 text-sm text-white/70">
          Sua especialidade já foi definida. Para liberar o painel de profissional é preciso
          quitar a ativação anual. Após o pagamento, o admin fará a aprovação final.
        </p>
      </div>

      {!orderId ? (
        <>
          <Button onClick={startCheckout} disabled={creating} className="w-full h-12 text-base font-bold">
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Pagar Ativação Profissional (R$ 179,90)
          </Button>
          <AlreadyPaidButton onDone={onPaid} />
        </>
      ) : (
        <MercadoPagoCheckout
          source={{ kind: "store_order", id: orderId }}
          amount={orderTotal}
          description="Ativação Profissional - Anual"
          defaultPayer={{ email: info.email, name: info.name }}
          initialMethod="pix"
          onApproved={onPaid}
        />
      )}
    </div>
  );
}

function AlreadyPaidButton({ onDone }: { onDone: () => void }) {
  const mark = useServerFn(markAlreadyCoach);
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    if (!confirm("Confirmar que você já pagou a ativação por fora? O admin será notificado para validar.")) return;
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
      Já paguei a ativação (avisar o admin)
    </Button>
  );
}

function WaitingApprovalStep() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Stethoscope className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-white">Ativação confirmada — aguardando aprovação</h1>
        <p className="mt-2 text-sm text-white/70">
          O admin fará a aprovação final do seu cadastro. Enquanto isso, adiante a mensalidade
          abaixo para começar já com tudo em dia.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white/60">
          <Clock className="h-3.5 w-3.5" />
          Mensalidade do profissional
        </h2>
        <p className="mb-4 text-xs text-white/50">
          Escolha o melhor dia de vencimento e pague a mensalidade. Assim que o admin liberar,
          seu painel já estará com tudo em dia.
        </p>
        <SubscriptionInvoicesTab walletSource="professional" />
      </div>
    </div>
  );
}
