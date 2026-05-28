import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Copy, CheckCircle2 } from "lucide-react";
import { loadMercadoPagoSDK, getMP } from "@/lib/mercadopago";
import { createPixCheckout, createCardCheckout, getPaymentStatus } from "@/lib/mercadopago.functions";

type Source = { kind: "store_order" | "transaction" | "partner_product_order"; id: string };
type Payer = { email: string; name?: string; doc?: string };

interface Props {
  source: Source;
  amount: number;
  description: string;
  defaultPayer?: Payer;
  initialMethod?: "pix" | "card";
  onApproved?: () => void;
}

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function MercadoPagoCheckout({ source, amount, description, defaultPayer, initialMethod = "pix", onApproved }: Props) {
  const [tab, setTab] = useState<"pix" | "card">(initialMethod);
  const [payer, setPayer] = useState<Payer>(defaultPayer || { email: "", name: "", doc: "" });
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // PIX
  const [pixData, setPixData] = useState<{ qr: string; qrBase64: string; ticketUrl: string | null; rowId: string } | null>(null);
  const [generatingPix, setGeneratingPix] = useState(false);
  const [pixApproved, setPixApproved] = useState(false);

  // Cartão
  const [cardLoading, setCardLoading] = useState(false);
  const cardFormRef = useRef<HTMLDivElement>(null);
  const cardBrickRef = useRef<any>(null);

  const pixFn = useServerFn(createPixCheckout);
  const cardFn = useServerFn(createCardCheckout);
  const statusFn = useServerFn(getPaymentStatus);

  useEffect(() => {
    setTab(initialMethod);
  }, [initialMethod, source.id]);

  useEffect(() => {
    setPayer(defaultPayer || { email: "", name: "", doc: "" });
    setPixData(null);
    setPixApproved(false);
    setPaymentError(null);
  }, [defaultPayer?.email, defaultPayer?.name, defaultPayer?.doc, source.id]);

  // Polling do PIX
  useEffect(() => {
    if (!pixData || pixApproved) return;
    const interval = setInterval(async () => {
      const r = await statusFn({ data: { paymentRowId: pixData.rowId } });
      if (r?.status === "approved") {
        setPixApproved(true);
        toast.success("Pagamento PIX aprovado!");
        onApproved?.();
        clearInterval(interval);
      } else if (r?.status === "rejected" || r?.status === "cancelled") {
        toast.error("Pagamento não aprovado. Tente novamente.");
        clearInterval(interval);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [pixData, pixApproved, statusFn, onApproved]);

  // Inicializa SDK MP para o cartão quando troca pra aba cartão
  useEffect(() => {
    if (tab !== "card") return;
    let mounted = true;

    (async () => {
      try {
        await loadMercadoPagoSDK();
        if (!mounted) return;

        const mp = getMP();
        console.log("[MP Checkout] Inicializando Brick com public key:", (window as any).MercadoPago ? "SDK OK" : "SDK NÃO CARREGADO");

        const bricksBuilder = mp.bricks();

        const container = document.getElementById("mp-card-form-container");
        if (!container) {
          console.error("[MP Checkout] Container #mp-card-form-container não encontrado");
          return;
        }

        try {
          if (cardBrickRef.current) {
            await cardBrickRef.current.unmount?.();
            cardBrickRef.current = null;
          }
        } catch {
          cardBrickRef.current = null;
        }

        if (!mounted) return;

        cardBrickRef.current = await bricksBuilder.create("cardPayment", "mp-card-form-container", {
          initialization: { amount, payer: payer.email ? { email: payer.email } : undefined },
          customization: { paymentMethods: { maxInstallments: 12 }, visual: { hideFormTitle: true } },
          callbacks: {
            onReady: () => { console.log("[MP Checkout] Brick pronto"); },
            onError: (err: any) => {
              console.error("[MP Brick error - full]", err);
              try { console.error("[MP Brick error - JSON]", JSON.stringify(err, Object.getOwnPropertyNames(err))); } catch {}
              const causes = Array.isArray(err?.cause) ? err.cause.map((c: any) => c?.description || c?.code || JSON.stringify(c)).join(" | ") : null;
              const msg = causes || err?.message || err?.cause?.[0]?.description || "Erro no formulário do cartão";
              setPaymentError(`[${err?.type || "erro"}] ${msg}`);
              toast.error(msg, { duration: 8000 });
            },
            onSubmit: (cardFormData: any) => {
            // O Brick exige uma Promise; resolva sempre para liberar o loading do botão
            return new Promise<void>((resolve) => {
              (async () => {
                setCardLoading(true);
                setPaymentError(null);
                try {
                  const r = await cardFn({
                    data: {
                      source,
                      payer: {
                        email: cardFormData.payer?.email || payer.email,
                        name: payer.name,
                        doc: cardFormData.payer?.identification?.number || payer.doc,
                      },
                      card: {
                        token: cardFormData.token,
                        installments: Number(cardFormData.installments || 1),
                        paymentMethodId: cardFormData.payment_method_id,
                        issuerId: cardFormData.issuer_id ? String(cardFormData.issuer_id) : undefined,
                      },
                    },
                  });
                  console.log("[MP card response]", r);
                  if (r.status === "approved") {
                    toast.success("Pagamento aprovado!");
                    onApproved?.();
                  } else if (r.status === "in_process" || r.status === "pending") {
                    toast.info("Pagamento em análise. Você será notificado.");
                  } else {
                    const msg = `Pagamento ${r.status === "rejected" ? "recusado" : r.status}${r.statusDetail ? `: ${r.statusDetail}` : ""}`;
                    setPaymentError(msg);
                    toast.error(msg, { duration: 6000 });
                  }
                } catch (err: any) {
                  console.error("[MP card submit error]", err);
                  const msg = err?.message || "Falha no pagamento. Verifique os dados do cartão.";
                  setPaymentError(msg);
                  toast.error(msg, { duration: 6000 });
                } finally {
                  setCardLoading(false);
                  resolve();
                }
              })();
            });
          },
        },
      });
      } catch (initErr: any) {
        console.error("[MP Checkout] Erro ao inicializar Brick:", initErr);
        setPaymentError("Falha ao carregar formulário de cartão. Tente recarregar a página.");
      }
    })();
    return () => {
      mounted = false;
      try { cardBrickRef.current?.unmount?.(); } catch { /* ignore */ }
      cardBrickRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, amount]);

  const generatePix = async () => {
    if (!payer.email) { toast.error("Informe seu e-mail"); return; }
    setGeneratingPix(true);
    try {
      const r = await pixFn({ data: { source, payer } });
      if (!r.qrCode) throw new Error("QR Code não retornado");
      setPixData({ qr: r.qrCode, qrBase64: r.qrCodeBase64 || "", ticketUrl: r.ticketUrl, rowId: r.paymentRowId });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao gerar PIX");
    } finally {
      setGeneratingPix(false);
    }
  };

  const copyPix = () => {
    if (!pixData?.qr) return;
    navigator.clipboard.writeText(pixData.qr);
    toast.success("Código PIX copiado!");
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4">
        <p className="text-xs text-muted-foreground">{description}</p>
        <p className="text-2xl font-bold text-primary">{money(amount)}</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <button onClick={() => setTab("pix")} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === "pix" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>PIX</button>
        <button onClick={() => setTab("card")} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === "card" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Cartão</button>
      </div>

      {tab === "pix" && (
        <div className="space-y-3">
          {!pixData ? (
            <>
              <input
                type="email"
                placeholder="E-mail"
                value={payer.email}
                onChange={(e) => setPayer({ ...payer, email: e.target.value })}
                className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <input
                type="text"
                placeholder="Nome completo"
                value={payer.name || ""}
                onChange={(e) => setPayer({ ...payer, name: e.target.value })}
                className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <input
                type="text"
                placeholder="CPF (opcional)"
                value={payer.doc || ""}
                onChange={(e) => setPayer({ ...payer, doc: e.target.value })}
                className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                onClick={generatePix}
                disabled={generatingPix}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
              >
                {generatingPix ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Gerar QR Code PIX
              </button>
            </>
          ) : pixApproved ? (
            <div className="rounded-lg bg-green-500/10 p-6 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-12 w-12 text-green-500" />
              <p className="text-base font-bold text-foreground">Pagamento aprovado!</p>
            </div>
          ) : (
            <>
              {pixData.qrBase64 && (
                <img src={`data:image/png;base64,${pixData.qrBase64}`} alt="QR Code PIX" className="mx-auto h-56 w-56 rounded-lg bg-white p-2" />
              )}
              <button onClick={copyPix} className="flex w-full items-center justify-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-bold text-foreground">
                <Copy className="h-4 w-4" /> Copiar código PIX
              </button>
              <p className="text-center text-xs text-muted-foreground">Aguardando confirmação do pagamento...</p>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Verificando a cada 4s
              </div>
            </>
          )}
        </div>
      )}

      {tab === "card" && (
        <div className="space-y-3">
          <div ref={cardFormRef} id="mp-card-form-container" />
          {paymentError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-semibold text-destructive">
              {paymentError}
            </div>
          )}
          {cardLoading && (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Processando pagamento...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
