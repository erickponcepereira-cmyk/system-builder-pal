import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Loader2, X, Check, ZoomIn, ZoomOut } from "lucide-react";

type CropOptions = {
  /** Máximo em pixels do lado do quadrado exportado. Default: 1024. */
  maxSize?: number;
  /** Preview overlay: 'square' | 'circle' (avatares). Default: 'square'. */
  shape?: "square" | "circle";
  /** Título do modal. */
  title?: string;
};

type Ctx = {
  cropToBlob: (file: File | Blob, opts?: CropOptions) => Promise<Blob | null>;
};

const ImageCropContext = createContext<Ctx | null>(null);

export function useImageCrop() {
  const ctx = useContext(ImageCropContext);
  if (!ctx) throw new Error("useImageCrop precisa do <ImageCropProvider>");
  return ctx;
}

type PendingReq = {
  src: string;
  file: File | Blob;
  opts: Required<CropOptions>;
  resolve: (b: Blob | null) => void;
};

const DEFAULTS: Required<CropOptions> = {
  maxSize: 1024,
  shape: "square",
  title: "Ajustar imagem",
};

export function ImageCropProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingReq | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const areaRef = useRef<Area | null>(null);

  const cropToBlob = useCallback((file: File | Blob, opts: CropOptions = {}) => {
    return new Promise<Blob | null>((resolve) => {
      const src = URL.createObjectURL(file);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      areaRef.current = null;
      setPending({ src, file, opts: { ...DEFAULTS, ...opts }, resolve });
    });
  }, []);

  const close = useCallback((blob: Blob | null) => {
    if (!pending) return;
    URL.revokeObjectURL(pending.src);
    pending.resolve(blob);
    setPending(null);
    setBusy(false);
  }, [pending]);

  const confirm = useCallback(async () => {
    if (!pending || !areaRef.current) return;
    setBusy(true);
    try {
      const blob = await renderCrop(pending.src, areaRef.current, pending.file, pending.opts.maxSize);
      close(blob);
    } catch {
      close(null);
    }
  }, [pending, close]);

  const value = useMemo<Ctx>(() => ({ cropToBlob }), [cropToBlob]);

  return (
    <ImageCropContext.Provider value={value}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[1000] flex justify-center bg-black/80 p-4 overflow-y-auto overscroll-contain modal-safe items-start sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#141010] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-white">{pending.opts.title}</div>
                <div className="text-[11px] text-white/50">Arraste para posicionar. Assim vai aparecer.</div>
              </div>
              <button
                type="button"
                onClick={() => close(null)}
                className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Cancelar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative aspect-square w-full bg-black">
              <Cropper
                image={pending.src}
                crop={crop}
                zoom={zoom}
                minZoom={1}
                maxZoom={4}
                aspect={1}
                cropShape={pending.opts.shape === "circle" ? "round" : "rect"}
                showGrid
                objectFit="contain"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, area) => { areaRef.current = area; }}
              />
            </div>

            <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3">
              <ZoomOut className="h-4 w-4 text-white/60" />
              <input
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-orange-500"
                aria-label="Zoom"
              />
              <ZoomIn className="h-4 w-4 text-white/60" />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
              <button
                type="button"
                onClick={() => close(null)}
                disabled={busy}
                className="rounded-lg px-3 py-2 text-xs text-white/70 hover:bg-white/10 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-400 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </ImageCropContext.Provider>
  );
}

async function renderCrop(src: string, area: Area, source: File | Blob, maxSize: number): Promise<Blob> {
  const img = await loadImage(src);
  const size = Math.min(maxSize, Math.round(area.width));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d indisponível");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size);

  const isPng = (source as File).type === "image/png";
  const mime = isPng ? "image/png" : "image/jpeg";
  const quality = isPng ? undefined : 0.9;
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))), mime, quality);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
