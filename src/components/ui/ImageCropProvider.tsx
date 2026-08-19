import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Loader2, X, Check, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";

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
      setPending((anterior) => {
        // Se ja havia um recorte em andamento, ele TEM que ser resolvido. Antes
        // o pedido novo sobrescrevia o antigo, e quem estava no await do
        // anterior ficava pendurado para sempre — spinner girando, nada salvo
        // e erro nenhum na tela.
        if (anterior) {
          URL.revokeObjectURL(anterior.src);
          anterior.resolve(null);
        }
        return { src, file, opts: { ...DEFAULTS, ...opts }, resolve };
      });
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
    if (!pending || busy) return;
    setBusy(true);
    try {
      // Se o onCropComplete ainda nao disparou, o recorte vira a imagem
      // inteira — calculada dentro do renderCrop, a partir da mesma imagem ja
      // decodificada. Antes disso a imagem era carregada uma SEGUNDA vez so
      // para medir, o que dobrava o custo e criava mais um ponto de falha.
      const blob = await renderCrop(pending.src, areaRef.current, pending.file, pending.opts.maxSize);
      close(blob);
    } catch (e: any) {
      setBusy(false);
      toast.error(e?.message || "Não foi possível processar a imagem. Tente uma foto menor.");
    }
  }, [pending, close, busy]);

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

/** Limite seguro de lado para canvas/decode em Android (Chrome trava acima disso). */
const MAX_SOURCE_SIDE = 4096;

async function renderCrop(src: string, area: Area | null, source: File | Blob, maxSize: number): Promise<Blob> {
  // Fonte pode ser uma foto de 50–108MP (Galaxy S21 Ultra). Redimensionamos antes
  // de recortar, senão o Chrome Android devolve canvas em branco ou toBlob null.
  const { source: drawable, scale } = await loadDrawable(src, source);

  // Sem area escolhida: quadrado central da propria imagem. As medidas saem do
  // drawable, que ja esta na escala reduzida — por isso a area nasce dividida
  // por scale, para as contas abaixo continuarem valendo.
  if (!area) {
    const lg = (drawable as ImageBitmap).width ?? (drawable as HTMLImageElement).naturalWidth;
    const al = (drawable as ImageBitmap).height ?? (drawable as HTMLImageElement).naturalHeight;
    const lado = Math.min(lg, al);
    area = {
      x: ((lg - lado) / 2) / scale,
      y: ((al - lado) / 2) / scale,
      width: lado / scale,
      height: lado / scale,
    };
  }

  const sx = area.x * scale;
  const sy = area.y * scale;
  const sw = Math.max(1, area.width * scale);
  const sh = Math.max(1, area.height * scale);
  const size = Math.max(1, Math.min(maxSize, Math.round(sw)));

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d indisponível");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(drawable as CanvasImageSource, sx, sy, sw, sh, 0, 0, size, size);
  if (typeof (drawable as ImageBitmap).close === "function") (drawable as ImageBitmap).close();

  const isPng = (source as File).type === "image/png";
  const mime = isPng ? "image/png" : "image/jpeg";
  const quality = isPng ? undefined : 0.9;

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), mime, quality);
  });
  if (blob) return blob;

  // Fallback: alguns aparelhos falham no toBlob mas conseguem o dataURL.
  const dataUrl = canvas.toDataURL(mime, quality ?? 0.9);
  const res = await fetch(dataUrl);
  const fallback = await res.blob();
  if (!fallback || fallback.size === 0) throw new Error("Não foi possível gerar a imagem recortada");
  return fallback;
}

/** Devolve algo desenhável já reduzido, e a escala aplicada sobre o tamanho natural. */
async function loadDrawable(
  src: string,
  file: File | Blob,
): Promise<{ source: CanvasImageSource; scale: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      // imageOrientation "from-image" para o canvas enxergar a foto do MESMO
      // jeito que a prévia. Sem isto, foto de celular com EXIF de rotação sai
      // recortada na região errada — e só em alguns aparelhos, que é o pior
      // tipo de defeito.
      const probe = await createImageBitmap(file, { imageOrientation: "from-image" });
      const side = Math.max(probe.width, probe.height);
      if (side <= MAX_SOURCE_SIDE) return { source: probe, scale: 1 };
      const scale = MAX_SOURCE_SIDE / side;
      probe.close?.();
      const resized = await createImageBitmap(file, {
        imageOrientation: "from-image",
        resizeWidth: Math.round(probe.width * scale),
        resizeHeight: Math.round(probe.height * scale),
        resizeQuality: "high",
      });
      return { source: resized, scale };
    } catch {
      // cai para <img>
    }
  }
  const img = await loadImage(src);
  return { source: img, scale: 1 };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // crossOrigin SO para URL remota. Em blob: e data: o Chrome do Android
    // trata como requisicao CORS, e a resposta de um object URL nao tem
    // cabecalho nenhum — a imagem simplesmente nao carrega. Era isto que
    // produzia "Falha ao carregar a imagem" num aparelho onde a previa do
    // recorte mostrava a foto normalmente: o <img> do react-easy-crop nao
    // poe crossOrigin, o nosso punha.
    if (!/^(blob:|data:)/i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar a imagem"));
    img.src = src;
  });
}
