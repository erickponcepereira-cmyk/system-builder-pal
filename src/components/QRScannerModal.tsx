import { useEffect, useRef, useState } from "react";
import { X, Camera, AlertCircle } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

type Props = {
  onClose: () => void;
  onScan: (decoded: string) => void;
  title?: string;
};

const SCANNER_ID = "qr-scanner-region";

export function QRScannerModal({ onClose, onScan, title = "Ler QR Code" }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const inst = new Html5Qrcode(SCANNER_ID, { verbose: false });
        scannerRef.current = inst;
        await inst.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (cancelled) return;
            cancelled = true;
            onScan(decoded);
          },
          () => {},
        );
        startedRef.current = true;
      } catch (e: any) {
        setError(e?.message || "Não foi possível acessar a câmera.");
      }
    })();
    return () => {
      cancelled = true;
      const inst = scannerRef.current;
      if (inst && startedRef.current) {
        inst.stop().then(() => inst.clear()).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden text-white"
        style={{ backgroundColor: "#111" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" /> {title}
          </h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          {error ? (
            <div className="flex flex-col items-center text-center gap-2 py-8">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <p className="text-sm text-white/80">{error}</p>
              <p className="text-[11px] text-white/50">Verifique se concedeu permissão de câmera ao navegador.</p>
            </div>
          ) : (
            <>
              <div id={SCANNER_ID} className="w-full overflow-hidden rounded-xl bg-black" />
              <p className="mt-3 text-center text-[11px] text-white/50">
                Aponte para o QR Code do parceiro.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
