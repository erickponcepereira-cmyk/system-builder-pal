import { useEffect } from "react";

/**
 * Fecha o modal quando a pessoa aperta Escape.
 *
 * Existe porque a loja não tinha isso em lugar nenhum: eram oito overlays
 * escritos à mão e **zero** ocorrências de `Escape` em `components/store/`.
 * Quando o X saía da área visível — e saía, porque o cartão do modal é
 * `overflow:hidden` e o cabeçalho nem sempre é fixo — não sobrava saída
 * nenhuma. Era o "modal que não fecha" que o dono relatou.
 *
 * Um hook em vez de sete cópias do mesmo `useEffect`.
 *
 * COM DOIS MODAIS ABERTOS, UM ESCAPE FECHA OS DOIS. Os dois escutam a mesma
 * `window`, e `stopPropagation` não separa ouvintes irmãos. Isso é aceitável
 * nos empilhamentos que a loja tem hoje — o carrinho abre sobre o detalhe, e
 * fechar os dois é o que a pessoa quer — mas deixa de ser no dia em que um
 * modal abrir uma confirmação por cima. Aí o certo é uma pilha compartilhada,
 * onde só o topo responde; não um parâmetro que cada chamador tem de lembrar
 * de passar.
 *
 * A confirmação global (`ConfirmProvider`, 17/09/2026) foi o primeiro caso, e
 * resolve o dela sozinha: engole o Escape na captura, antes de chegar à window.
 */
export function useFecharComEscape(aoFechar: () => void): void {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);
}

/**
 * O andar dos modais da loja.
 *
 * O painel do coach tem cabeçalho fixo em `z-[70]` e barra lateral em `z-[60]`;
 * o `SupportCoachFab` e a navegação do aluno moram em `z-50`. Os modais da loja
 * estavam TODOS em `z-50` — empatavam com o FAB e com a navegação (perdendo por
 * ordem de DOM) e ficavam por baixo do cabeçalho do coach.
 *
 * 80 fica acima de todo esse cromo. É um número só, num lugar só, para não
 * voltar a ser escolhido linha a linha.
 */
export const Z_MODAL_DA_LOJA = 80;
