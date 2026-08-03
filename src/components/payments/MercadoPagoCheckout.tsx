import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Copy, CheckCircle2 } from "lucide-react";
import { loadMercadoPagoSDK, getMP, loadDeviceFingerprint, getDeviceId } from "@/lib/mercadopago";
import { createPixCheckout, createCardCheckout, getPaymentStatus, getSourceRecurrence } from "@/lib/mercadopago.functions";


type Source = { kind: "store_order" | "transaction" | "partner_product_order" | "subscription_invoice"; id: string };
type Payer = { email: string; name?: string; doc?: string };

interface Props {
  source: Source;
  amount: number;
  description: string;
  defaultPayer?: Payer;
  initialMethod?: "pix" | "card";
  /** Exibe a opção de salvar o cartão para cobranças recorrentes. */
  allowSaveCard?: boolean;
  onApproved?: () => void;
}


const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const friendlyPaymentMessage = (status?: string | null, detail?: string | null) => {
  const code = String(detail || status || "").toLowerCase();
  if (code.includes("cc_rejected_high_risk")) {
    return "Pagamento recusado pela análise de segurança do Mercado Pago. Se o cartão for de outra pessoa, preencha nome e documento do titular do cartão; se persistir, tente PIX ou outro cartão.";
  }
  if (code.includes("cc_rejected_insufficient_amount")) return "Pagamento recusado por saldo/limite insuficiente. Tente outro cartão ou PIX.";
  if (code.includes("cc_rejected_bad_filled") || code.includes("bad_filled")) return "Pagamento recusado. Confira os dados do cartão e tente novamente.";
  if (code.includes("cc_rejected_other_reason") || code.includes("rejected")) return "Pagamento recusado. Tente PIX, outro cartão ou uma nova tentativa.";
  if (code.includes("wrong parameter") || code.includes("three_ds") || code.includes("three_d_secure")) {
    return "Falha na validação de segurança do cartão. Atualize a página e tente novamente; se persistir, use PIX ou outro cartão.";
  }
  return `Pagamento ${status === "rejected" ? "recusado" : status || "não aprovado"}${detail ? `: ${detail}` : ""}`;
};

export function MercadoPagoCheckout({ source, amount, description, defaultPayer, initialMethod = "pix", allowSaveCard = false, onApproved }: Props) {
  const [tab, setTab] = useState<"pix" | "card">(initialMethod);
  const [payer, setPayer] = useState<Payer>(defaultPayer || { email: "", name: "", doc: "" });
  // Titular do cartão vem dos campos oficiais do Brick (podem ser de outra pessoa).
  const [holderError, setHolderError] = useState<string | null>(null);

  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [cardNotice, setCardNotice] = useState<string | null>(null);
  const [lastStatusDetail, setLastStatusDetail] = useState<string | null>(null);
  const [saveCard, setSaveCard] = useState(false);
  const [recurrence, setRecurrence] = useState<{ title: string; amount: number; intervalType: string; trialDays: number; allowOneTime: boolean } | null>(null);
  const [mode, setMode] = useState<"subscribe" | "one_time">("one_time");
  const [threeDs, setThreeDs] = useState<{ url: string; creq: string; rowId: string } | null>(null);

  // PIX
  const [pixData, setPixData] = useState<{ qr: string; qrBase64: string; ticketUrl: string | null; rowId: string } | null>(null);
  const [generatingPix, setGeneratingPix] = useState(false);
  const [pixApproved, setPixApproved] = useState(false);

  // Cartão
  const [cardLoading, setCardLoading] = useState(false);
  const [cardAttempt, setCardAttempt] = useState(0);
  const cardFormRef = useRef<HTMLDivElement>(null);
  const cardBrickRef = useRef<any>(null);
  const saveCardRef = useRef(false);
  const subscribeRef = useRef(false);
  const cardContainerId = `mp-card-form-container-${source.kind}-${source.id}-${cardAttempt}`;

  const pixFn = useServerFn(createPixCheckout);
  const cardFn = useServerFn(createCardCheckout);
  const statusFn = useServerFn(getPaymentStatus);
  const recurrenceFn = useServerFn(getSourceRecurrence);

  const buildCardPayer = (cardFormData: any): Payer => {
    const rawName =
      cardFormData?.cardholderName ||
      cardFormData?.cardholder_name ||
      cardFormData?.card_holder_name ||
      cardFormData?.cardholder?.name ||
      cardFormData?.payer?.name ||
      cardFormData?.payer?.first_name ||
      cardFormData?.payer?.firstName ||
      "";
    const first = cardFormData?.payer?.first_name || cardFormData?.payer?.firstName || "";
    const last = cardFormData?.payer?.last_name || cardFormData?.payer?.lastName || "";
    const holderName = String(rawName || `${first} ${last}`).trim();
    const holderDoc = String(
      cardFormData?.payer?.identification?.number ||
      cardFormData?.cardholder?.identification?.number ||
      cardFormData?.identification?.number ||
      ""
    ).trim();

    return {
      email: String(cardFormData?.payer?.email || payer.email || "").trim(),
      name: holderName || undefined,
      doc: holderDoc || undefined,
    };
  };

  useEffect(() => { saveCardRef.current = saveCard; }, [saveCard]);
  useEffect(() => { subscribeRef.current = mode === "subscribe"; }, [mode]);
  

  // Produto de assinatura? Oferece as duas formas de pagamento ao cliente.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r: any = await recurrenceFn({ data: source });
        if (!alive || !r) return;
        setRecurrence(r);
        setMode("subscribe");
        setTab("card");
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.kind, source.id]);

  // Fingerprint antifraude: precisa estar carregado antes de qualquer pagamento.
  useEffect(() => { loadDeviceFingerprint("checkout"); }, []);

  // Desafio 3-D Secure do banco emissor
  useEffect(() => {
    if (!threeDs) return;
    const iframe = document.getElementById("mp-3ds-frame") as HTMLIFrameElement | null;
    if (!iframe) return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = threeDs.url;
    form.target = "mp-3ds-frame";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "creq";
    input.value = threeDs.creq;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);

    const interval = setInterval(async () => {
      const r = await statusFn({ data: { paymentRowId: threeDs.rowId } });
      if (r?.status === "approved") {
        clearInterval(interval);
        setThreeDs(null);
        toast.success("Pagamento aprovado!");
        onApproved?.();
      } else if (r?.status === "rejected" || r?.status === "cancelled") {
        clearInterval(interval);
        setThreeDs(null);
        const msg = friendlyPaymentMessage(r.status, (r as any).status_detail);
        setPaymentError(msg);
        toast.error(msg, { duration: 9000 });
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [threeDs, statusFn, onApproved]);


  useEffect(() => {
    setTab(initialMethod);
  }, [initialMethod, source.id]);

  useEffect(() => {
    setPayer(defaultPayer || { email: "", name: "", doc: "" });
    setHolder({ name: defaultPayer?.name || "", doc: defaultPayer?.doc || "" });
    setPixData(null);
    setPixApproved(false);
    setPaymentError(null);
  }, [defaultPayer?.email, defaultPayer?.name, defaultPayer?.doc, source.id]);


  // Polling do PIX — pausa enquanto o usuário está na aba de cartão para não
  // misturar o status do PIX pendente com o resultado do cartão.
  useEffect(() => {
    if (!pixData || pixApproved || tab === "card") return;
    const interval = setInterval(async () => {
      const r = await statusFn({ data: { paymentRowId: pixData.rowId } });
      if (r?.status === "approved") {
        setPixApproved(true);
        toast.success("Pagamento PIX aprovado!");
        onApproved?.();
        clearInterval(interval);
      } else if (r?.status === "rejected" || r?.status === "cancelled") {
        toast.error("Pagamento PIX não aprovado. Tente novamente.");
        clearInterval(interval);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [pixData, pixApproved, tab, statusFn, onApproved]);

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

        const container = document.getElementById(cardContainerId);
        if (!container) {
          console.error("[MP Checkout] Container de cartão não encontrado", cardContainerId);
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

        // Não pré-preenche nome/CPF do cadastro no formulário de cartão: o titular
        // pode ser outra pessoa, e essa divergência aumenta recusas por risco.
        const initPayer: any = payer.email ? { email: payer.email } : undefined;

        cardBrickRef.current = await bricksBuilder.create("cardPayment", cardContainerId, {
          initialization: { amount, payer: initPayer },
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
            onSubmit: (cardFormData: any, additionalData?: any) => {
            // O Brick exige uma Promise; resolva sempre para liberar o loading do botão
            return new Promise<void>((resolve) => {
              (async () => {
                setCardLoading(true);
                setPaymentError(null);
                setCardNotice(null);
                setLastStatusDetail(null);
                setHolderError(null);
                toast.dismiss();
                try {
                  const holderNow = holderRef.current;
                  const holderName = String(holderNow.name || "").trim();
                  const holderDoc = String(holderNow.doc || "").replace(/\D/g, "");
                  if (holderName.split(/\s+/).filter(Boolean).length < 2) {
                    setHolderError("Informe o nome completo do titular, como impresso no cartão.");
                    setCardLoading(false);
                    resolve();
                    return;
                  }
                  if (holderDoc.length !== 11 && holderDoc.length !== 14) {
                    setHolderError("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido do titular.");
                    setCardLoading(false);
                    resolve();
                    return;
                  }
                  const deviceId = await getDeviceId();
                  const cardPayer = buildCardPayer(cardFormData);
                  const r = await cardFn({
                    data: {
                      source,
                      payer: { ...cardPayer, email: cardPayer.email || payer.email },
                      card: {
                        token: cardFormData.token,
                        installments: Number(cardFormData.installments || 1),
                        paymentMethodId: cardFormData.payment_method_id,
                        issuerId: cardFormData.issuer_id ? String(cardFormData.issuer_id) : undefined,
                      },
                      holder: { name: holderName, doc: holderDoc },
                      cardMeta: {
                        bin: additionalData?.bin ? String(additionalData.bin).slice(0, 10) : undefined,
                        lastFour: additionalData?.lastFourDigits ? String(additionalData.lastFourDigits).slice(0, 4) : undefined,
                        cardholderName: additionalData?.cardholderName ? String(additionalData.cardholderName).slice(0, 120) : undefined,
                      },
                      deviceId,
                      saveCard: saveCardRef.current || subscribeRef.current,
                      subscribe: subscribeRef.current,
                    },
                  });
                  console.log("[MP card response]", r);
                  if ((r as any)?.threeDs?.externalResourceUrl && (r as any)?.threeDs?.creq) {
                    setThreeDs({
                      url: (r as any).threeDs.externalResourceUrl,
                      creq: (r as any).threeDs.creq,
                      rowId: r.paymentRowId,
                    });
                    toast.info("Validação do banco necessária. Conclua na janela de segurança.");
                  } else if (r.status === "approved") {
                    toast.success("Pagamento aprovado!");
                    onApproved?.();
                  } else if (r.status === "in_process" || r.status === "pending") {
                    const msg = "Pagamento no cartão em análise pelo Mercado Pago. Você será notificado assim que houver resposta.";
                    setCardNotice(msg);
                    toast.info(msg);
                  } else {
                    const msg = friendlyPaymentMessage(r.status, r.statusDetail);
                    setPaymentError(msg);
                    setLastStatusDetail(String(r.statusDetail || ""));
                    toast.error(msg, { duration: 9000 });
                  }

                } catch (err: any) {
                  console.error("[MP card submit error]", err);
                  const msg = friendlyPaymentMessage("rejected", err?.message) || "Falha no pagamento. Verifique os dados do cartão.";
                  setPaymentError(msg);
                  setLastStatusDetail(String(err?.message || ""));
                  toast.error(msg, { duration: 9000 });

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
  }, [tab, amount, cardAttempt, cardContainerId]);

  const generatePix = async () => {
    if (!payer.email) { toast.error("Informe seu e-mail"); return; }
    setGeneratingPix(true);
    try {
      const deviceId = await getDeviceId();
      const r = await pixFn({ data: { source, payer, deviceId } });

      if ((r as any)?._error) throw new Error((r as any)._error.replace(/^HANDLER:\s*/i, ""));
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

      {recurrence && (
        <div className="mb-4 space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs font-bold text-primary">Este produto é uma assinatura {recurrence.intervalType === "yearly" ? "anual" : "mensal"}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => { setMode("subscribe"); setTab("card"); }}
              className={`rounded-lg border p-2 text-left text-xs ${mode === "subscribe" ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground"}`}
            >
              <span className="block font-bold">Assinar (cobrança automática)</span>
              <span className="block">{money(recurrence.amount)} por {recurrence.intervalType === "yearly" ? "ano" : "mês"} no cartão salvo{recurrence.trialDays > 0 ? ` · ${recurrence.trialDays} dias grátis` : ""}</span>
            </button>
            {recurrence.allowOneTime !== false && (
              <button
                type="button"
                onClick={() => setMode("one_time")}
                className={`rounded-lg border p-2 text-left text-xs ${mode === "one_time" ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground"}`}
              >
                <span className="block font-bold">Pagar só desta vez</span>
                <span className="block">PIX ou cartão, sem cobrança automática</span>
              </button>
            )}
          </div>
          {mode === "subscribe" && (
            <p className="text-[11px] text-muted-foreground">O cartão fica salvo e a próxima cobrança é automática. Você pode cancelar quando quiser em Perfil → Assinaturas.</p>
          )}
        </div>
      )}

      <div className={`mb-4 grid gap-2 ${recurrence && mode === "subscribe" ? "grid-cols-1" : "grid-cols-2"}`}>
        {!(recurrence && mode === "subscribe") && <button onClick={() => setTab("pix")} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === "pix" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>PIX</button>}
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
          <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs font-bold text-foreground">Dados do titular do cartão</p>
            <p className="text-[11px] text-muted-foreground">
              Cartão em nome de outra pessoa? Ajuste os dados do titular — precisam ser exatamente os do cartão.
            </p>
            <input
              type="text"
              placeholder="Nome completo do titular (como impresso no cartão)"
              value={holder.name}
              onChange={(e) => setHolder((h) => ({ ...h, name: e.target.value }))}
              className="w-full rounded-lg bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <input
              type="text"
              inputMode="numeric"
              placeholder="CPF ou CNPJ do titular"
              value={holder.doc}
              onChange={(e) => setHolder((h) => ({ ...h, doc: e.target.value }))}
              className="w-full rounded-lg bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {holderError && <p className="text-xs font-semibold text-destructive">{holderError}</p>}
          </div>
          <div ref={cardFormRef} id={cardContainerId} />

          {recurrence && mode === "subscribe" && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-foreground">
              Cartão será salvo para a cobrança automática de {money(recurrence.amount)} / {recurrence.intervalType === "yearly" ? "ano" : "mês"}.
            </p>
          )}
          {allowSaveCard && !(recurrence && mode === "subscribe") && (
            <label className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-foreground">
              <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} className="accent-primary" />
              Salvar este cartão para cobranças automáticas (mensalidade/assinatura)
            </label>
          )}
          {threeDs && (
            <div className="rounded-lg border border-border bg-background p-2">
              <p className="mb-2 text-xs text-muted-foreground">Validação de segurança do seu banco:</p>
              <iframe id="mp-3ds-frame" name="mp-3ds-frame" title="Validação 3-D Secure" className="h-[420px] w-full rounded-md bg-white" />
            </div>
          )}

          {cardNotice && (
            <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">{cardNotice}</p>
          )}

          {paymentError && (
            <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-semibold text-destructive">
              <p>{paymentError}</p>
              {lastStatusDetail?.includes("high_risk") && (
                <p className="text-xs font-normal text-destructive/80">
                  O Mercado Pago bloqueou este cartão por análise de risco. Retentativas com o mesmo cartão tendem a cair de novo — o PIX costuma aprovar na hora.
                  Se o cartão for de outra pessoa, gere uma nova tentativa preenchendo nome e documento do titular do cartão.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {lastStatusDetail?.includes("high_risk") && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentError(null);
                      setLastStatusDetail(null);
                      setTab("pix");
                    }}
                    className="rounded bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
                  >
                    Pagar com PIX
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPaymentError(null);
                    setLastStatusDetail(null);
                    setCardAttempt((v) => v + 1);
                  }}
                  className="rounded bg-destructive px-3 py-2 text-xs font-bold text-destructive-foreground"
                >
                  Tentar cartão novamente
                </button>
              </div>
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
