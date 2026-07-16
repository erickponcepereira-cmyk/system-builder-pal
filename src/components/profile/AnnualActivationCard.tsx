import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, CheckCircle2, CreditCard, Loader2, XCircle, TestTube2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MercadoPagoCheckout } from "@/components/payments/MercadoPagoCheckout";
import { getMyAnnualActivation } from "@/lib/annual-activation.functions";
import { ACTIVATION_PRODUCT_ID } from "@/lib/coach-onboarding.functions";
import { getIsTestUser, simulateTestPayAnnual } from "@/lib/test-accounts.functions";

const fmt = (n: number) => `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export function AnnualActivationCard() {
  const fnAnnual = useServerFn(getMyAnnualActivation);
  const fnIsTest = useServerFn(getIsTestUser);
  const fnPayAnnual = useServerFn(simulateTestPayAnnual);
  const [annual, setAnnual] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isTest, setIsTest] = useState(false);
  const [busyTest, setBusyTest] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fnAnnual();
      setAnnual(r);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    (async () => {
      try {
        const t = await fnIsTest();
        setIsTest(Boolean(t?.isTest));
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-white/60">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando anuidade…
      </div>
    );
  }

  if (!annual?.product) {
    return <p className="p-6 text-center text-white/60">Produto de anuidade não configurado.</p>;
  }

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl border p-5 ${annual.active ? "border-emerald-500/40 bg-emerald-500/10" : "border-orange-500/40 bg-orange-500/10"}`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase text-white/50">{annual.product.name}</p>
            <h2 className="text-2xl font-bold text-white">{fmt(annual.product.price)}</h2>
            <p className="mt-1 text-xs text-white/60">
              Renovação anual única — vale para todas as plataformas.
            </p>
          </div>
          {annual.active ? (
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          ) : (
            <XCircle className="h-8 w-8 text-orange-400" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm text-white">
          <div className="rounded-lg bg-black/30 p-3">
            <p className="text-xs uppercase text-white/40">Status</p>
            <p className="font-bold">
              {!annual.active
                ? annual.source === "none"
                  ? "Não iniciada"
                  : "Vencida"
                : annual.source === "purchased"
                  ? "Ativa (paga)"
                  : annual.source === "already_coach"
                    ? "Ativa (já era coach/parceiro)"
                    : annual.source === "admin_grant"
                      ? "Ativa (concedida)"
                      : "Ativa (isenta)"}
            </p>
          </div>
          <div className="rounded-lg bg-black/30 p-3">
            <p className="flex items-center gap-1 text-xs uppercase text-white/40">
              <Calendar className="h-3 w-3" /> Válida até
            </p>
            <p className="font-bold">{fmtDate(annual.validUntil)}</p>
          </div>
        </div>

        {annual.active && annual.daysRemaining <= 30 && (
          <p className="mt-3 rounded-lg bg-orange-500/20 px-3 py-2 text-xs text-orange-200">
            Faltam {annual.daysRemaining} dias para a renovação.
          </p>
        )}
      </div>

      {isTest && !annual.active && (
        <button
          disabled={busyTest}
          onClick={async () => {
            setBusyTest(true);
            try {
              await fnPayAnnual();
              toast.success("Anuidade marcada como paga (teste)");
              await load();
            } catch (e: any) {
              toast.error(e.message);
            } finally {
              setBusyTest(false);
            }
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-yellow-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-40"
        >
          <TestTube2 className="h-4 w-4" /> Simular pagamento de anuidade (teste)
        </button>
      )}

      {!annual.active && !isTest && (annual.isCoach || annual.isPartner) && (
        <AnnualPaymentBlock
          productName={annual.product.name}
          productPrice={annual.product.price}
          onPaid={load}
        />
      )}
    </div>
  );
}

function AnnualPaymentBlock({
  productName,
  productPrice,
  onPaid,
}: {
  productName: string;
  productPrice: number;
  onPaid: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState<number>(0);
  const [payer, setPayer] = useState<{ email: string; name: string }>({ email: "", name: "" });

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("name, email")
        .eq("user_id", uid)
        .maybeSingle();
      setPayer({
        email: (prof as any)?.email || userData.user?.email || "",
        name: (prof as any)?.name || "",
      });
    })();
  }, []);

  const startCheckout = async () => {
    setCreating(true);
    try {
      const { data: orderIdRpc, error } = await supabase.rpc("create_store_order" as never, {
        _items: [{ kind: "digital", sourceId: ACTIVATION_PRODUCT_ID, quantity: 1 }],
        _payment_method: "pix",
        _shipping: {},
        _notes: "Ativação Anual (assinatura)",
      } as never);
      if (error) throw new Error(error.message);
      const { data: order } = await supabase
        .from("store_orders" as never)
        .select("id,total_amount" as never)
        .eq("id" as never, orderIdRpc as never)
        .maybeSingle();
      const od = order as unknown as { id: string; total_amount: number } | null;
      setOrderId(od?.id || String(orderIdRpc));
      setOrderTotal(Number(od?.total_amount || productPrice || 179.9));
    } catch (e) {
      toast.error((e as Error).message || "Falha ao criar pedido");
    } finally {
      setCreating(false);
    }
  };

  if (!orderId) {
    return (
      <button
        onClick={startCheckout}
        disabled={creating}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-black disabled:opacity-40"
      >
        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        Pagar anuidade ({`R$ ${Number(productPrice || 0).toFixed(2).replace(".", ",")}`})
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <MercadoPagoCheckout
        source={{ kind: "store_order", id: orderId }}
        amount={orderTotal}
        description={productName}
        defaultPayer={{ email: payer.email, name: payer.name }}
        initialMethod="pix"
        onApproved={() => {
          toast.success("Anuidade paga com sucesso!");
          onPaid();
        }}
      />
    </div>
  );
}
