// Public Key do Mercado Pago (segura para client-side).
export const MP_PUBLIC_KEY = "APP_USR-a3fc7b0a-3992-40d4-9163-446776a206cd";

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
