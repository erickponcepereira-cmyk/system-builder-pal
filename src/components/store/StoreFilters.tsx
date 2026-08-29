import { SlidersHorizontal, X } from "lucide-react";

import type { UnifiedOrigin, UnifiedProduct } from "@/lib/unified-store";
import {
  contarFiltros,
  FAIXAS,
  FILTROS_VAZIOS,
  opcoesUteis,
  ORDENS,
  ROTULO_ORIGEM,
  type FiltrosDaLoja,
} from "@/lib/store-filters";

/** Botão que abre a folha de filtros, com o número do que está ligado. */
export function StoreFilterButton({
  filtros,
  onAbrir,
}: {
  filtros: FiltrosDaLoja;
  onAbrir: () => void;
}) {
  const n = contarFiltros(filtros);
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={n > 0 ? `Filtros, ${n} ativos` : "Filtros"}
      className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition ${
        n > 0 ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
      }`}
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />
      Filtros
      {n > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-foreground/20 px-1 text-[10px]">
          {n}
        </span>
      )}
    </button>
  );
}

/**
 * Folha de filtros.
 *
 * Cada opção que não casaria com nenhum produto do catálogo atual aparece
 * desabilitada, e não escondida. Sumir com a opção faz a pessoa procurar o
 * filtro que ela lembra de ter visto; desabilitar responde a pergunta antes
 * dela ser feita.
 */
export function StoreFilterSheet({
  filtros,
  onMudar,
  produtos,
  resultado,
  onClose,
}: {
  filtros: FiltrosDaLoja;
  onMudar: (f: FiltrosDaLoja) => void;
  /** Catálogo visível ANTES dos filtros — é o que define o que é útil. */
  produtos: UnifiedProduct[];
  /** Quantos produtos sobram com os filtros atuais. */
  resultado: number;
  onClose: () => void;
}) {
  const uteis = opcoesUteis(produtos);
  const n = contarFiltros(filtros);

  const alternarOrigem = (o: UnifiedOrigin) => {
    const tem = filtros.origens.includes(o);
    onMudar({
      ...filtros,
      origens: tem ? filtros.origens.filter((x) => x !== o) : [...filtros.origens, o],
    });
  };

  return (
    <div
      className="modal-safe fixed inset-0 z-[80] flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Filtros"
      >
        <div className="modal-head -mx-5 -mt-5 mb-4 flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <h2 className="text-base font-bold text-foreground">Filtros</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="shrink-0">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <Grupo titulo="Ordenar por">
          {ORDENS.map((o) => (
            <Chip
              key={o.id}
              ativo={filtros.ordenacao === o.id}
              onClick={() => onMudar({ ...filtros, ordenacao: o.id })}
            >
              {o.rotulo}
            </Chip>
          ))}
        </Grupo>

        <Grupo titulo="Preço">
          <Chip ativo={filtros.faixa === null} onClick={() => onMudar({ ...filtros, faixa: null })}>
            Qualquer
          </Chip>
          {FAIXAS.map((f, i) => (
            <Chip
              key={f.rotulo}
              ativo={filtros.faixa === i}
              desabilitado={!uteis.faixas[i]}
              onClick={() => onMudar({ ...filtros, faixa: filtros.faixa === i ? null : i })}
            >
              {f.rotulo}
            </Chip>
          ))}
        </Grupo>

        {uteis.origens.length > 1 && (
          <Grupo titulo="Quem vende">
            {uteis.origens.map((o) => (
              <Chip key={o} ativo={filtros.origens.includes(o)} onClick={() => alternarOrigem(o)}>
                {ROTULO_ORIGEM[o]}
              </Chip>
            ))}
          </Grupo>
        )}

        <Grupo titulo="Benefícios">
          <Chip
            ativo={filtros.soGratuitos}
            desabilitado={!uteis.temGratuitos}
            onClick={() => onMudar({ ...filtros, soGratuitos: !filtros.soGratuitos })}
          >
            Só gratuitos
          </Chip>
          <Chip
            ativo={filtros.comCarteirinha}
            desabilitado={!uteis.temCarteirinha}
            onClick={() => onMudar({ ...filtros, comCarteirinha: !filtros.comCarteirinha })}
          >
            Dá carteirinha
          </Chip>
          <Chip
            ativo={filtros.comTickets}
            desabilitado={!uteis.temTickets}
            onClick={() => onMudar({ ...filtros, comTickets: !filtros.comTickets })}
          >
            Dá tickets
          </Chip>
        </Grupo>

        <div className="modal-foot -mx-5 -mb-5 mt-4 flex items-center gap-2 px-5 pb-5 pt-3">
          {n > 0 && (
            <button
              type="button"
              onClick={() => onMudar({ ...FILTROS_VAZIOS, ordenacao: filtros.ordenacao })}
              className="rounded-xl bg-muted px-4 py-3 text-sm font-bold text-foreground"
            >
              Limpar
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
          >
            {resultado === 0
              ? "Nenhum produto — ajuste os filtros"
              : `Ver ${resultado} ${resultado === 1 ? "produto" : "produtos"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function Chip({
  ativo,
  desabilitado = false,
  onClick,
  children,
}: {
  ativo: boolean;
  desabilitado?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      aria-pressed={ativo}
      title={desabilitado ? "Nenhum produto do catálogo atual se encaixa aqui." : undefined}
      className={`rounded-full px-3.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${
        ativo ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}
