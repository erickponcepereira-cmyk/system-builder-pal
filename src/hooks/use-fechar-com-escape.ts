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
 * Um hook em vez de seis cópias do mesmo `useEffect`: o empilhamento importa.
 * Com dois modais abertos, o de cima registra por último e o `keydown` chega
 * nos dois — por isso o `ativo`, que deixa quem está por baixo se desligar.
 */
export function useFecharComEscape(aoFechar: () => void, ativo = true): void {
  useEffect(() => {
    if (!ativo) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        aoFechar();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar, ativo]);
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
