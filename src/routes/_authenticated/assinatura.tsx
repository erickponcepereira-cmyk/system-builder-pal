import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Calendar, CheckCircle2, CreditCard, Loader2, Wallet as WalletIcon, XCircle, TestTube2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SubscriptionInvoicesTab } from "@/components/profile/SubscriptionInvoicesTab";
import { MercadoPagoCheckout } from "@/components/payments/MercadoPagoCheckout";
import { getMySubscription } from "@/lib/subscriptions.functions";
import { getMyAnnualActivation } from "@/lib/annual-activation.functions";
import { ACTIVATION_PRODUCT_ID } from "@/lib/coach-onboarding.functions";
import { getIsTestUser, simulateTestPayAnnual } from "@/lib/test-accounts.functions";
import { isNativeAndroid, NATIVE_ANDROID_PURCHASE_MESSAGE } from "@/lib/native-platform";

export const Route = createFileRoute("/_authenticated/assinatura")({
  head: () => ({
    meta: [
      { title: "Assinatura — FitMind Club" },
      { name: "description", content: "Sua mensalidade e anuidade FitMind." },
    ],
  }),
  component: AssinaturaPage,
});

type TabKey = "monthly" | "annual";
type Role = "coach" | "professional" | "partner";

const fmt = (n: number) => `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";

function AssinaturaPage() {
  const initialTab: TabKey = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "annual" ? "annual" : "monthly";
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [walletSource, setWalletSource] = useState<Role>("coach");
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const [annual, setAnnual] = useState<any>(null);
  const [annualLoading, setAnnualLoading] = useState(true);
  const [isTest, setIsTest] = useState(false);
  const [busyTest, setBusyTest] = useState(false);

  const fnGet = useServerFn(getMySubscription);
  const fnAnnual = useServerFn(getMyAnnualActivation);
  const fnIsTest = useServerFn(getIsTestUser);
  const fnPayAnnual = useServerFn(simulateTestPayAnnual);

  useEffect(() => {
    (async () => {
      try {
        const r = await fnGet();
        const wallets = r?.wallets ?? {};
        const roles: Role[] = [];
        // Mostra apenas papéis com saldo > 0 (ou pelo menos coach se nada existir)
        (["coach", "professional", "partner"] as Role[]).forEach((k) => {
          if ((wallets as any)[k] !== undefined && (wallets as any)[k] !== null) roles.push(k);
        });
        const effective = roles.length ? roles : (["coach"] as Role[]);
        setAvailableRoles(effective);
        // padrão: papel com maior saldo
        let best: Role = effective[0];
        let bestVal = -1;
        effective.forEach((k) => {
          const v = Number((wallets as any)[k] || 0);
          if (v > bestVal) { bestVal = v; best = k; }
        });
        setWalletSource(best);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadAnnual = async () => {
    setAnnualLoading(true);
    try {
      const r = await fnAnnual();
      setAnnual(r);
    } finally {
      setAnnualLoading(false);
    }
  };

  useEffect(() => {
    loadAnnual();
    (async () => { try { const t = await fnIsTest(); setIsTest(Boolean(t?.isTest)); } catch { /* ignore */ } })();
  }, []);

  return (
    <div className="min-h-screen bg-[#0b0707] text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0707]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link to="/portal-selector" className="rounded-lg p-2 hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold">Assinatura</h1>
        </div>

        <div className="mx-auto flex max-w-3xl gap-1 px-4 pb-2">
          <button
            onClick={() => setTab("monthly")}
            className={`flex-1 rounded-t-lg px-4 py-2 text-sm font-bold ${tab === "monthly" ? "bg-primary text-black" : "bg-white/5 text-white/60"}`}
          >
            Mensalidade
          </button>
          <button
            onClick={() => setTab("annual")}
            className={`flex-1 rounded-t-lg px-4 py-2 text-sm font-bold ${tab === "annual" ? "bg-primary text-black" : "bg-white/5 text-white/60"}`}
          >
            Anuidade
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {tab === "monthly" && (
          <>
            {availableRoles.length > 1 && (
              <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="mb-2 flex items-center gap-2 text-xs uppercase text-white/60">
                  <WalletIcon className="h-3 w-3" /> Carteira para débito
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableRoles.map((r) => (
                    <button
                      key={r}
                      onClick={() => setWalletSource(r)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize ${walletSource === r ? "bg-primary text-black" : "bg-white/10 text-white/70"}`}
                    >
                      {r === "coach" ? "Coach" : r === "professional" ? "Profissional" : "Parceiro"}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-white/40">
                  Sua mensalidade é única e vale para todas as plataformas. Escolha de qual carteira descontar.
                </p>
              </div>
            )}
            {loading ? (
              <div className="flex items-center gap-2 p-6 text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : (
              <SubscriptionInvoicesTab walletSource={walletSource} />
            )}
          </>
        )}

        {tab === "annual" && (
          <div className="space-y-4">
            {annualLoading ? (
              <div className="flex items-center gap-2 p-6 text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando anuidade…
              </div>
            ) : annual?.product ? (
              <>
                <div className={`rounded-2xl border p-5 ${annual.active ? "border-emerald-500/40 bg-emerald-500/10" : "border-orange-500/40 bg-orange-500/10"}`}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase text-white/50">{annual.product.name}</p>
                      {!isNativeAndroid() && <h2 className="text-2xl font-bold">{fmt(annual.product.price)}</h2>}
                      <p className="mt-1 text-xs text-white/60">
                        {isNativeAndroid() ? "Consulte aqui o status da sua ativação anual." : "Renovação anual única — vale para todas as plataformas."}
                      </p>
                    </div>
                    {annual.active ? (
                      <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                    ) : (
                      <XCircle className="h-8 w-8 text-orange-400" />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-black/30 p-3">
                      <p className="text-xs uppercase text-white/40">Status</p>
                      <p className="font-bold">
                        {!annual.active ? (annual.source === "none" ? "Não iniciada" : "Vencida") :
                          annual.source === "purchased" ? "Ativa (paga)" :
                          annual.source === "already_coach" ? "Ativa (já era coach)" :
                          annual.source === "admin_grant" ? "Ativa (concedida)" :
                          "Ativa (isenta)"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-black/30 p-3">
                      <p className="text-xs uppercase text-white/40 flex items-center gap-1">
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

                  {annual.source === "exempt" && (
                    <p className="mt-3 text-xs text-white/50">
                      Você é isento: a anuidade começa a contar a partir da finalização do seu cadastro.
                    </p>
                  )}
                  {annual.source === "already_coach" && (
                    <p className="mt-3 text-xs text-white/50">
                      Ativação registrada via opção "Já sou coach". Não houve cobrança financeira.
                    </p>
                  )}
                  {annual.source === "admin_grant" && (
                    <p className="mt-3 text-xs text-white/50">
                      Ativação concedida manualmente pelo administrador{annual.note ? ` — motivo: ${annual.note}` : ""}.
                    </p>
                  )}
                </div>

                {!isNativeAndroid() && isTest && !annual.active && (
                  <button
                    disabled={busyTest}
                    onClick={async () => {
                      setBusyTest(true);
                      try { await fnPayAnnual(); toast.success("Anuidade marcada como paga (teste)"); await loadAnnual(); }
                      catch (e: any) { toast.error(e.message); }
                      finally { setBusyTest(false); }
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
                    onPaid={loadAnnual}
                  />
                )}
              </>
            ) : (
              <p className="p-6 text-center text-white/60">Produto de anuidade não configurado.</p>
            )}
          </div>
        )}
      </main>
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
      setPayer({ email: (prof as any)?.email || userData.user?.email || "", name: (prof as any)?.name || "" });
    })();
  }, []);

  const startCheckout = async () => {
    if (isNativeAndroid()) return toast.info(NATIVE_ANDROID_PURCHASE_MESSAGE);
    setCreating(true);
    try {
      const { data: orderIdRpc, error } = await supabase.rpc(
        "create_store_order" as never,
        {
          _items: [{ kind: "digital", sourceId: ACTIVATION_PRODUCT_ID, quantity: 1 }],
          _payment_method: "pix",
          _shipping: {},
          _notes: "Ativação Anual (assinatura)",
        } as never,
      );
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

  if (!orderId && isNativeAndroid()) {
    return <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">{NATIVE_ANDROID_PURCHASE_MESSAGE}</p>;
  }

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
