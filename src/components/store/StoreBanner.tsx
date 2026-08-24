import { useEffect, useMemo, useState } from "react";
import { ChevronRight, GraduationCap, Sparkles, Tag, X } from "lucide-react";

import type { UnifiedProduct } from "@/lib/unified-store";
import {
  marcarPopupVisto,
  popupPendente,
  proximoGiro,
  type StoreBanner as BannerRow,
} from "@/lib/store-banners";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Faixa = {
  id: string;
  etiqueta: string | null;
  titulo: string;
  apoio: string | null;
  imagem: string | null;
  icone: typeof Sparkles;
  /** Cadastrado no admin abre link; derivado do catálogo abre o produto. */
  destino: { tipo: "link"; url: string | null } | { tipo: "produto"; produto: UnifiedProduct };
};

/**
 * Faixa do topo da loja.
 *
 * Prioridade: banner cadastrado no admin. Só se não houver nenhum ativo a faixa
 * é derivada do catálogo (destaque marcado, maior desconto, curso) — rede de
 * segurança para o topo nunca ficar vazio.
 *
 * O giro começa num banner diferente a cada visita, para a pessoa conhecer
 * todos com o tempo em vez de ver sempre o primeiro.
 */
export function StoreBanner({
  produtos,
  banners,
  onAbrir,
  onNavegar,
}: {
  produtos: UnifiedProduct[];
  banners: BannerRow[];
  onAbrir: (p: UnifiedProduct) => void;
  onNavegar: (url: string) => void;
}) {
  const cadastrados = useMemo(() => banners.filter((b) => b.kind === "banner"), [banners]);

  const faixas = useMemo<Faixa[]>(() => {
    if (cadastrados.length) {
      return cadastrados.map((b) => ({
        id: b.id,
        etiqueta: b.badge,
        titulo: b.title,
        apoio: b.subtitle,
        imagem: b.imageUrl,
        icone: Sparkles,
        destino: { tipo: "link" as const, url: b.linkUrl },
      }));
    }

    // Sem cadastro: deriva do catálogo, como antes.
    const out: Faixa[] = [];
    const usados = new Set<string>();

    for (const p of produtos) {
      if (out.length >= 4) break;
      if (!p.isFeatured || usados.has(p.id)) continue;
      usados.add(p.id);
      out.push({
        id: p.id, etiqueta: "Destaque", titulo: p.title, apoio: fmt(p.price),
        imagem: p.imageUrl, icone: Sparkles, destino: { tipo: "produto", produto: p },
      });
    }

    const comDesconto = produtos
      .filter((p) => !usados.has(p.id) && p.originalPrice && p.originalPrice > p.price)
      .map((p) => ({ p, off: Math.round((1 - p.price / (p.originalPrice as number)) * 100) }))
      .filter((x) => x.off >= 10)
      .sort((a, b) => b.off - a.off);

    for (const { p, off } of comDesconto) {
      if (out.length >= 4) break;
      usados.add(p.id);
      out.push({
        id: p.id, etiqueta: off + "% OFF", titulo: p.title,
        apoio: fmt(p.price) + " · antes " + fmt(p.originalPrice as number),
        imagem: p.imageUrl, icone: Tag, destino: { tipo: "produto", produto: p },
      });
    }

    for (const p of produtos) {
      if (out.length >= 4) break;
      if (p.kind !== "digital" || usados.has(p.id)) continue;
      usados.add(p.id);
      out.push({
        id: p.id, etiqueta: "Curso", titulo: p.title,
        apoio: p.price > 0 ? fmt(p.price) : "Incluído no seu plano",
        imagem: p.imageUrl, icone: GraduationCap,
        // Abre o PRODUTO, não "Meus cursos". O anúncio é para quem ainda não
        // comprou; mandar essa pessoa para a biblioteca a levava a uma tela
        // vazia, sem nenhum caminho até a compra. Os outros banners já usam
        // "produto" — este era o único fora do padrão.
        destino: { tipo: "produto", produto: p },
      });
    }

    return out;
  }, [cadastrados, produtos]);

  const [i, setI] = useState(0);

  // Começa num banner diferente a cada visita.
  useEffect(() => {
    if (faixas.length) setI(proximoGiro(faixas.length));
  }, [faixas.length]);

  useEffect(() => {
    if (faixas.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % faixas.length), 6000);
    return () => clearInterval(t);
  }, [faixas.length]);

  if (!faixas.length) return null;

  const f = faixas[Math.min(i, faixas.length - 1)];
  const Icone = f.icone;

  const abrir = () => {
    if (f.destino.tipo === "produto") onAbrir(f.destino.produto);
    else if (f.destino.url) onNavegar(f.destino.url);
  };

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={abrir}
        className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/20 via-primary/5 to-transparent p-4 text-left"
      >
        {f.imagem ? (
          <img src={f.imagem} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" loading="lazy" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/20">
            <Icone className="h-6 w-6 text-primary" />
          </span>
        )}

        <span className="min-w-0 flex-1">
          {f.etiqueta && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
              {f.etiqueta}
            </span>
          )}
          <span className="mt-1 block truncate text-sm font-bold text-foreground">{f.titulo}</span>
          {f.apoio && (
            <span className="block truncate text-[11px] tabular-nums text-muted-foreground">{f.apoio}</span>
          )}
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
              className={`h-1.5 rounded-full transition-all ${idx === i ? "w-5 bg-primary" : "w-1.5 bg-muted"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Popup de entrada.
 *
 * Aparece UMA vez por oferta e tem fechar visível desde o primeiro instante.
 * Popup que volta toda sessão treina a pessoa a fechar antes de ler — e aí o
 * canal morre para sempre.
 */
export function StorePopup({
  banners,
  onNavegar,
}: {
  banners: BannerRow[];
  onNavegar: (url: string) => void;
}) {
  const [atual, setAtual] = useState<BannerRow | null>(null);

  useEffect(() => {
    const p = popupPendente(banners);
    if (!p) return;
    // Pequeno atraso: abrir junto com a tela atrapalha quem já sabe o que quer.
    const t = setTimeout(() => setAtual(p), 900);
    return () => clearTimeout(t);
  }, [banners]);

  if (!atual) return null;

  const fechar = () => {
    marcarPopupVisto(atual.id);
    setAtual(null);
  };

  return (
    <div
      className="modal-safe fixed inset-0 z-[60] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm"
      onClick={fechar}
      role="presentation"
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={atual.title}
      >
        <div className="flex justify-end p-2">
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {atual.imageUrl && (
          <img src={atual.imageUrl} alt="" className="max-h-56 w-full object-cover" />
        )}

        <div className="p-5 pt-3">
          {atual.badge && (
            <span className="inline-flex rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
              {atual.badge}
            </span>
          )}
          <h2 className="mt-2 text-base font-bold text-foreground">{atual.title}</h2>
          {atual.subtitle && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{atual.subtitle}</p>
          )}

          {atual.linkUrl && (
            <button
              type="button"
              onClick={() => { marcarPopupVisto(atual.id); setAtual(null); onNavegar(atual.linkUrl as string); }}
              className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
            >
              {atual.linkLabel || "Ver agora"}
            </button>
          )}

          <button
            type="button"
            onClick={fechar}
            className="mt-2 w-full rounded-xl px-4 py-2 text-xs font-semibold text-muted-foreground"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}

export default StoreBanner;
