// Public Key do Mercado Pago — lida da variável de ambiente VITE_MP_PUBLIC_KEY.
// Fallback para a chave de teste da conta sandbox FitMindClub.
export const MP_PUBLIC_KEY: string =
  (import.meta.env.VITE_MP_PUBLIC_KEY as string) ||
  "APP_USR-b279acc6-2899-4739-ae37-207740834f30";

if (!MP_PUBLIC_KEY) {
  console.error("[MercadoPago] VITE_MP_PUBLIC_KEY não está definida. Pagamentos com cartão não vão funcionar.");
}

let mpScriptPromise: Promise<void> | null = null;

/** Carrega o SDK Mercado Pago v2 sob demanda (singleton). */
export function loadMercadoPagoSDK(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).MercadoPago) return Promise.resolve();
  if (mpScriptPromise) return mpScriptPromise;
  mpScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = () => {
      console.log("[MercadoPago] SDK carregado. Public Key em uso:", MP_PUBLIC_KEY?.slice(0, 20) + "...");
      resolve();
    };
    script.onerror = () => {
      mpScriptPromise = null;
      reject(new Error("Falha ao carregar SDK do Mercado Pago"));
    };
    document.head.appendChild(script);
  });
  return mpScriptPromise;
}

let mpInstance: any = null;

export function getMP() {
  const w = window as any;
  if (!w.MercadoPago) throw new Error("SDK do Mercado Pago não carregado");
  if (!MP_PUBLIC_KEY) throw new Error("VITE_MP_PUBLIC_KEY não configurada");
  mpInstance = new w.MercadoPago(MP_PUBLIC_KEY, { locale: "pt-BR" });
  return mpInstance;
}

/** Reseta o SDK (útil após troca de chave). */
export function resetMPSDK() {
  mpScriptPromise = null;
  mpInstance = null;
}
