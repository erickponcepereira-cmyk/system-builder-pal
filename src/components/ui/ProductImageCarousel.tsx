import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  images: string[];
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
  rounded?: string;
}

/**
 * Carrossel simples de imagens de produto (com bolinhas + setas).
 * Se receber apenas 1 imagem exibe estática sem controles.
 */
export function ProductImageCarousel({ images, alt, className, fallback, rounded = "rounded-xl" }: Props) {
  const [idx, setIdx] = useState(0);
  const list = (images || []).filter(Boolean);
  if (!list.length) {
    return <div className={`${className || ""} ${rounded} bg-white/5`}>{fallback}</div>;
  }
  const go = (dir: -1 | 1) => setIdx((i) => (i + dir + list.length) % list.length);
  return (
    <div className={`relative overflow-hidden ${rounded} ${className || ""}`}>
      <img src={list[idx]} alt={alt || ""} className="h-full w-full object-cover" loading="lazy" decoding="async" />
      {list.length > 1 && (
        <>
          <button type="button" aria-label="Anterior"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); go(-1); }}
            className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Próxima"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); go(1); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white">
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute inset-x-0 bottom-1 flex justify-center gap-1">
            {list.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === idx ? "bg-white" : "bg-white/40"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
