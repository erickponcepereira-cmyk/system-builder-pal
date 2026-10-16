import { useEffect, useId, useRef, useState } from "react";
import { X, Camera, AlertCircle } from "lucide-react";

type Props = {
  onClose: () => void;
  onScan: (decoded: string) => void;
  title?: string;
  /** Texto de orientação sob a câmera. */
  hint?: string;
};

type Leitor = import("html5-qrcode").Html5Qrcode;

/** Traduz o erro cru do navegador/html5-qrcode em algo que o parceiro entende. */
function mensagemDeCamera(e: unknown): string {
  const nome = e instanceof Error ? e.name : "";
  const texto = String((e as { message?: string } | null)?.message ?? e ?? "");
  if (nome === "NotAllowedError" || /permission|denied|not allowed/i.test(texto)) {
    return "Permissão de câmera negada. Libere a câmera nas configurações do navegador e abra o leitor de novo.";
  }
  if (nome === "NotFoundError" || /no camera|requested device not found|not found/i.test(texto)) {
    return "Nenhuma câmera encontrada neste aparelho.";
  }
  if (nome === "NotReadableError" || /not readable|in use|could not start|transition/i.test(texto)) {
    return "A câmera está em uso por outro app ou aba. Feche-o e tente de novo.";
  }
  return "Não foi possível abrir a câmera. Verifique a permissão e tente de novo.";
}

export function QRScannerModal({
  onClose,
  onScan,
  title = "Ler QR Code",
  hint = "Aponte a câmera para o QR Code.",
}: Props) {
  const scannerId = `qr-scanner-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let delivered = false;
    let leitor: Leitor | null = null;
    let iniciou = false;

    const start = (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        leitor = new Html5Qrcode(scannerId, { verbose: false });
        await leitor.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded: string) => {
            if (cancelled || delivered) return;
            delivered = true;
            onScanRef.current(decoded);
          },
          () => {},
        );
        iniciou = true;
      } catch (e) {
        if (!cancelled) setError(mensagemDeCamera(e));
      }
    })();

    return () => {
      cancelled = true;
      // Desmontar antes do start() resolver deixaria a câmera presa: espera o
      // start terminar para só então parar e limpar.
      void start.then(async () => {
        if (!leitor) return;
        try {
          if (iniciou) await leitor.stop();
          leitor.clear();
        } catch {
          /* já parado */
        }
      });
    };
  }, [scannerId]);

  return (
    <div className="fixed inset-0 z-[100] flex justify-center bg-black/90 p-4 overflow-y-auto overscroll-contain modal-safe items-start sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden text-white"
        style={{ backgroundColor: "#111" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" /> {title}
          </h3>
          <button onClick={onClose} aria-label="Fechar" className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          {error ? (
            <div role="alert" className="flex flex-col items-center text-center gap-2 py-8">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <p className="text-sm text-white/80">{error}</p>
            </div>
          ) : (
            <>
              <div id={scannerId} className="w-full overflow-hidden rounded-xl bg-black" />
              <p className="mt-3 text-center text-[11px] text-white/50">{hint}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
