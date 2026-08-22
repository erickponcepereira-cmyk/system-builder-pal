import { useEffect, useMemo, useState } from "react";
import { ChevronRight, GraduationCap, Sparkles, Tag } from "lucide-react";

import type { UnifiedProduct } from "@/lib/unified-store";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Faixa = {
  id: string;
  etiqueta: string;
  titulo: string;
  apoio: string;
  produto: UnifiedProduct;
  icone: typeof Sparkles;
};

/**
 * Banner rotativo do topo da loja.
 *
 * Existe porque catálogo por categoria não converte sozinho: quem abre a loja
 * sem intenção definida não clica em "Suplementos", clica no que estiver na
 * frente. É o mesmo motivo de o iFood abrir com faixa promocional.
 *
 * Sem tabela nova: as faixas saem do próprio catálogo, por regra determinística
 * e nesta ordem — destaque marcado no admin, maior desconto real, curso.
 * Se nada se qualificar, o banner não aparece. Faixa vazia é pior que faixa
 * nenhuma, porque ensina a ignorar aquele espaço.
 */
export function StoreBanner({
  produtos,
  onAbrir,
  onVerCursos,
}: {
  produtos: UnifiedProduct[];
  onAbrir: (p: UnifiedProduct) => void;
  onVerCursos: () => void;
}) {
  const faixas = useMemo<Faixa[]>(() => {
    const out: Faixa[] = [];
    const usados = new Set<string>();

    // 1. Destaque marcado no admin — é a curadoria humana e vem primeiro.
    for (const p of produtos) {
      if (out.length >= 4) break;
      if (!p.isFeatured || usados.has(p.id)) continue;
      usados.add(p.id);
      out.push({
        id: p.id,
        etiqueta: "Destaque",
        titulo: p.title,
        apoio: fmt(p.price),
        produto: p,
        icone: Sparkles,
      });
    }

    // 2. Maior desconto real, do maior para o menor.
    const comDesconto = produtos
      .filter((p) => !usados.has(p.id) && p.originalPrice && p.originalPrice > p.price)
      .map((p) => ({ p, off: Math.round((1 - p.price / (p.originalPrice as number)) * 100) }))
      .filter((x) => x.off >= 10)
      .sort((a, b) => b.off - a.off);

    for (const { p, off } of comDesconto) {
      if (out.length >= 4) break;
      usados.add(p.id);
      out.push({
        id: p.id,
        etiqueta: off + "% OFF",
        titulo: p.title,
        apoio: fmt(p.price) + " · antes " + fmt(p.originalPrice as number),
        produto: p,
        icone: Tag,
      });
    }

    // 3. Curso, para a área de membros ter porta na loja.
    for (const p of produtos) {
      if (out.length >= 4) break;
      if (p.kind !== "digital" || usados.has(p.id)) continue;
      usados.add(p.id);
      out.push({
        id: p.id,
        etiqueta: "Curso",
        titulo: p.title,
        apoio: p.price > 0 ? fmt(p.price) : "Incluído no seu plano",
        produto: p,
        icone: GraduationCap,
      });
    }

    return out;
  }, [produtos]);

  const [i, setI] = useState(0);

  useEffect(() => {
    if (faixas.length < 2) return;
    // Respeita quem pediu menos movimento: sem rotação automática.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % faixas.length), 6000);
    return () => clearInterval(t);
  }, [faixas.length]);

  if (!faixas.length) return null;

  const f = faixas[Math.min(i, faixas.length - 1)];
  const Icone = f.icone;

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => (f.produto.kind === "digital" ? onVerCursos() : onAbrir(f.produto))}
        className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/20 via-primary/5 to-transparent p-4 text-left"
      >
        {f.produto.imageUrl ? (
          <img
            src={f.produto.imageUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-xl object-cover"
            loading="lazy"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/20">
            <Icone className="h-6 w-6 text-primary" />
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
            {f.etiqueta}
          </span>
          <span className="mt-1 block truncate text-sm font-bold text-foreground">{f.titulo}</span>
          <span className="block truncate text-[11px] tabular-nums text-muted-foreground">{f.apoio}</span>
        </span>

        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>

      {faixas.length > 1 && (
        <div className="flex justify-center gap-1.5" role="tablist" aria-label="Destaques">
          {faixas.map((x, idx) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={idx === i}
              aria-label={"Destaque " + (idx + 1)}
              onClick={() => setI(idx)}
              className={`h-1.5 rounded-full transition-all ${
                idx === i ? "w-5 bg-primary" : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default StoreBanner;
