import { useEffect, useRef, useState, useCallback } from "react";
import { X, ZoomIn, ZoomOut, RotateCw, Check, Loader2 } from "lucide-react";

interface Props {
  file: File | null;
  aspect: number; // width / height (1 = square, 16/6 = wide cover)
  outputSize?: number; // max width of output in px, default 1024
  shape?: "rect" | "circle"; // preview shape only
  title?: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => Promise<void> | void;
}

/**
 * Modal para recortar imagem com ajuste de zoom, posição e rotação.
 * Retorna Blob JPEG. Suporta arraste (mouse + toque) e pinça (2 dedos).
 */
export function ImageCropperDialog({
  file,
  aspect,
  outputSize = 1024,
  shape = "rect",
  title = "Ajuste a imagem",
  onCancel,
  onConfirm,
}: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });

  // Load file into <img>
  useEffect(() => {
    if (!file) { setImgUrl(null); setImg(null); return; }
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Measure crop box
  useEffect(() => {
    if (!file) return;
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const maxW = Math.min(el.clientWidth - 24, 480);
      let w = maxW, h = maxW / aspect;
      const maxH = window.innerHeight * 0.55;
      if (h > maxH) { h = maxH; w = h * aspect; }
      setBoxSize({ w, h });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [file, aspect]);

  // When image loads, fit
  useEffect(() => {
    if (!img || !boxSize.w) return;
    const s = Math.max(boxSize.w / img.width, boxSize.h / img.height);
    setMinScale(s);
    setScale(s);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
  }, [img, boxSize]);

  // Clamp offset so image always covers box
  const clamp = useCallback((x: number, y: number, s: number) => {
    if (!img) return { x, y };
    const iw = img.width * s;
    const ih = img.height * s;
    const maxX = Math.max(0, (iw - boxSize.w) / 2);
    const maxY = Math.max(0, (ih - boxSize.h) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }, [img, boxSize]);

  // Drag + pinch
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ startDist: number; startScale: number } | null>(null);

  const dist = (a: React.Touch, b: React.Touch) =>
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || pinch.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    setOffset(clamp(drag.current.ox + dx, drag.current.oy + dy, scale));
  };
  const onPointerUp = () => { drag.current = null; };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinch.current = { startDist: dist(e.touches[0], e.touches[1]), startScale: scale };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinch.current) {
      e.preventDefault();
      const d = dist(e.touches[0], e.touches[1]);
      const newScale = Math.min(minScale * 6, Math.max(minScale, pinch.current.startScale * (d / pinch.current.startDist)));
      setScale(newScale);
      setOffset((o) => clamp(o.x, o.y, newScale));
    }
  };
  const onTouchEnd = () => { pinch.current = null; };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    const newScale = Math.min(minScale * 6, Math.max(minScale, scale * (1 + delta)));
    setScale(newScale);
    setOffset((o) => clamp(o.x, o.y, newScale));
  };

  const onSliderChange = (v: number) => {
    const range = minScale * 6 - minScale;
    const newScale = minScale + range * v;
    setScale(newScale);
    setOffset((o) => clamp(o.x, o.y, newScale));
  };

  const handleConfirm = async () => {
    if (!img) return;
    setSaving(true);
    try {
      const outW = Math.min(outputSize, Math.round(boxSize.w * (window.devicePixelRatio || 1)));
      const outH = Math.round(outW / aspect);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, outW, outH);
      const kx = outW / boxSize.w;
      const ky = outH / boxSize.h;
      ctx.translate(outW / 2 + offset.x * kx, outH / 2 + offset.y * ky);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(scale * kx, scale * ky);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao gerar imagem"))), "image/jpeg", 0.9)
      );
      await onConfirm(blob);
    } finally {
      setSaving(false);
    }
  };

  if (!file) return null;

  const sliderVal = minScale > 0 ? (scale - minScale) / (minScale * 6 - minScale) : 0;
  const imgW = img ? img.width * scale : 0;
  const imgH = img ? img.height * scale : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-start sm:items-center justify-center bg-black/80 backdrop-blur-sm overflow-y-auto overscroll-contain modal-safe" onClick={onCancel}>
      <div
        className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#0F0F0F] p-4 shadow-2xl"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <button onClick={onCancel} className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={containerRef} className="flex items-center justify-center py-2">
          {img ? (
            <div
              className={`relative overflow-hidden select-none touch-none ${shape === "circle" ? "rounded-full" : "rounded-xl"}`}
              style={{ width: boxSize.w, height: boxSize.h, backgroundColor: "#000", cursor: "grab" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onWheel={onWheel}
            >
              <img
                src={imgUrl!}
                alt=""
                draggable={false}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: imgW,
                  height: imgH,
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  pointerEvents: "none",
                  maxWidth: "none",
                }}
              />
              <div className="pointer-events-none absolute inset-0 ring-2 ring-primary/70 rounded-[inherit]" />
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-white/50">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <ZoomOut className="h-4 w-4 text-white/50 shrink-0" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sliderVal}
            onChange={(e) => onSliderChange(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <ZoomIn className="h-4 w-4 text-white/50 shrink-0" />
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/15"
            title="Girar 90°"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-center text-[11px] text-white/40">
          Arraste para posicionar · pinça ou barra para dar zoom
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || !img}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? "Salvando..." : "Aplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}
