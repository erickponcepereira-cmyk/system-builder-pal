import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Clock, Loader2, LogOut, UserCheck, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMyPartnerOnboarding, markAlreadyPartner } from "@/lib/partner-approvals.functions";
import { ACTIVATION_PRODUCT_ID } from "@/lib/coach-onboarding.functions";
import { MercadoPagoCheckout } from "@/components/payments/MercadoPagoCheckout";
import { SubscriptionInvoicesTab } from "@/components/profile/SubscriptionInvoicesTab";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

type Info = {
  isPartner: boolean;
  profileId: string;
  partnerId: string;
  name: string;
  email: string;
  fantasyName: string;
  status: string;
  activationPaidAt: string | null;
  activationSource: string | null;
  approvedAt: string | null;
  alreadyPartner: boolean;
};

export function PartnerOnboardingGate({ children }: Props) {
  const fetchInfo = useServerFn(getMyPartnerOnboarding);
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

  useEffect(() => {
    reload(); /* eslint-disable-next-line */
  }, []);

  useEffect(() => {
    if (!info?.partnerId) return;
    const channel = supabase
      .channel(`partner-stage-${info.partnerId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "partners", filter: `id=eq.${info.partnerId}` },
        (payload) => {
          const n = payload.new as { approved_at?: string | null; activation_paid_at?: string | null; status?: string | null; blocked_at?: string | null };
          const nowApproved = (n?.approved_at || (n?.status === "approved" && !n?.blocked_at));
          if (nowApproved && !info.approvedAt) {
            toast.success("🎉 Painel do parceiro liberado!");
            setTimeout(() => {
              if (typeof window !== "undefined") window.location.reload();
            }, 800);
            return;
          }
          if (n?.activation_paid_at && !info.activationPaidAt) toast.success("Anuidade confirmada!");
          reload();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [info?.partnerId, info?.activationPaidAt, info?.approvedAt]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "#0A0A0A" }}>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!info || !info.isPartner) return <>{children}</>;
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
    { id: "signup", label: "Cadastro", done: true },
    { id: "activation", label: "Anuidade", done: !!info.activationPaidAt },
    { id: "approve", label: "Aprovação", done: !!info.approvedAt },
  ];
  const currentIdx = steps.findIndex((s) => !s.done);
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.id} className="flex-1">
          <div
            className={`h-1.5 rounded-full ${s.done || i < currentIdx ? "bg-primary" : i === currentIdx ? "bg-amber-400" : "bg-white/10"}`}
          />
          <p
            className={`mt-1 text-center text-[10px] ${i === currentIdx ? "font-bold text-primary" : s.done ? "text-emerald-300" : "text-white/40"}`}
          >
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

  const startCheckout = async () => {
    setCreating(true);
    try {
      const { data: orderIdRpc, error } = await supabase.rpc("create_store_order" as never, {
        _items: [{ kind: "digital", sourceId: ACTIVATION_PRODUCT_ID, quantity: 1 }],
        _payment_method: "pix",
        _shipping: {},
        _notes: "Ativação Parceiro (onboarding)",
      } as never);
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
      toast.error((e as Error).message || "Falha ao criar pedido");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Building2 className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-white">Anuidade do Parceiro</h1>
        <p className="mt-2 text-sm text-white/70">
          Seu cadastro foi recebido. Para liberar o painel de parceiro é preciso quitar a anuidade.
          Após o pagamento, o admin fará a aprovação final.
        </p>
      </div>

      {!orderId ? (
        <>
          <Button onClick={startCheckout} disabled={creating} className="h-12 w-full text-base font-bold">
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
            Pagar Anuidade Parceiro (R$ 179,90)
          </Button>
          <AlreadyPartnerButton onDone={onPaid} />
        </>
      ) : (
        <MercadoPagoCheckout
          source={{ kind: "store_order", id: orderId }}
          amount={orderTotal}
          description="Anuidade do Parceiro"
          defaultPayer={{ email: info.email, name: info.name }}
          initialMethod="pix"
          onApproved={onPaid}
        />
      )}
    </div>
  );
}

function AlreadyPartnerButton({ onDone }: { onDone: () => void }) {
  const mark = useServerFn(markAlreadyPartner);
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    if (!confirm("Confirmar que você já é parceiro e já pagou a anuidade por fora? O admin será notificado para validar.")) return;
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
      className="h-12 w-full gap-2 border-white/15 bg-white/5 text-white hover:bg-white/10"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
      Já sou parceiro (avisar o admin)
    </Button>
  );
}

function WaitingApprovalStep() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Building2 className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-white">Anuidade confirmada — aguardando aprovação</h1>
        <p className="mt-2 text-sm text-white/70">
          O admin fará a aprovação final do seu cadastro. Enquanto isso, adiante a mensalidade
          abaixo para começar já com tudo em dia.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white/60">
          <Clock className="h-3.5 w-3.5" />
          Mensalidade do parceiro
        </h2>
        <p className="mb-4 text-xs text-white/50">
          Escolha o melhor dia de vencimento e pague a mensalidade. Assim que o admin liberar,
          seu painel já estará com tudo em dia.
        </p>
        <SubscriptionInvoicesTab walletSource="partner" />
      </div>
    </div>
  );
}
