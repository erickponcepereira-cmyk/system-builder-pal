import { CSSProperties, useMemo } from "react";

interface Props {
  src: string;
  alt?: string;
  /** Texto da marca d'água (geralmente o id ou email do espectador). */
  watermark?: string | null;
  className?: string;
  style?: CSSProperties;
  /** opacidade da marca d'água (0..1) */
  watermarkOpacity?: number;
}

/**
 * Imagem com proteções básicas anti-download:
 * - Bloqueia menu de contexto (botão direito / pressionar e segurar).
 * - Desabilita drag-and-drop.
 * - Renderiza sobreposição com marca d'água diagonal repetida (identifica vazamentos).
 * - userSelect: none impede "salvar como" pela seleção.
 *
 * Observação: nenhuma proteção client-side é absoluta — quem tiver acesso ao
 * arquivo pode tirar screenshot. A marca d'água com user_id é o que permite
 * rastrear a origem de um vazamento.
 */
export function ProtectedImage({ src, alt, watermark, className, style, watermarkOpacity = 0.18 }: Props) {
  const wm = (watermark || "").trim();
  const overlay = useMemo<CSSProperties | undefined>(() => {
    if (!wm) return undefined;
    const text = encodeURIComponent(wm);
    return {
      backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='420' height='180'><text x='10' y='100' fill='white' fill-opacity='${watermarkOpacity}' font-family='monospace' font-size='14' transform='rotate(-22 10 100)'>${text} • LGPD • ${new Date().toLocaleDateString("pt-BR")}</text></svg>")`,
      backgroundRepeat: "repeat",
    };
  }, [wm, watermarkOpacity]);

  return (
    <span
      className={`relative inline-block overflow-hidden ${className || ""}`}
      style={style}
      onContextMenu={(e) => e.preventDefault()}
    >
      <img
        src={src}
        alt={alt || ""}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        style={{ userSelect: "none", pointerEvents: "none", display: "block", width: "100%", height: "100%", objectFit: "cover" }}
      />
      {overlay && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={overlay}
        />
      )}
    </span>
  );
}
