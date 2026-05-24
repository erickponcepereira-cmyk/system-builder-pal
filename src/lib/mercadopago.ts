// Public Key do Mercado Pago (segura para client-side).
// TESTE — trocar para APP_USR-... ao voltar para produção.
export const MP_PUBLIC_KEY = "TEST-1e0c9ae2-00fe-4225-aaae-c7dc9609c2cc";

let mpScriptPromise: Promise<void> | null = null;

/** Carrega o SDK Mercado Pago v2 sob demanda. */
export function loadMercadoPagoSDK(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).MercadoPago) return Promise.resolve();
  if (mpScriptPromise) return mpScriptPromise;
  mpScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar SDK do Mercado Pago"));
    document.head.appendChild(script);
  });
  return mpScriptPromise;
}

export function getMP() {
  const w = window as any;
  if (!w.MercadoPago) throw new Error("SDK do Mercado Pago não carregado");
  return new w.MercadoPago(MP_PUBLIC_KEY, { locale: "pt-BR" });
}
