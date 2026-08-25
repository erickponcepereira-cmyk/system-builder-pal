/**
 * Oferta dentro do curso.
 *
 * Upsell em área de membros costuma ser feito de um jeito que destrói o que
 * pretendia melhorar. Os quatro erros que este arquivo existe para não cometer:
 *
 * 1. **Interromper a aula.** Modal por cima do vídeo é o jeito mais rápido de
 *    treinar a pessoa a fechar sem ler — e de fazê-la sair do app. Aqui a
 *    oferta só aparece em momento de respiro: ao abrir o curso, ao terminar um
 *    módulo, e depois de concluir uma aula. Nunca durante.
 *
 * 2. **Repetir para sempre.** Quem dispensou uma oferta não deve vê-la de novo
 *    amanhã. A dispensa é lembrada, e vale por `DIAS_DE_DESCANSO` dias.
 *
 * 3. **Oferecer o que a pessoa já tem.** É o erro que mais queima confiança:
 *    sinaliza que o sistema não sabe quem ela é. Tudo que já está em "Meus
 *    cursos" sai da lista.
 *
 * 4. **Encher de patrocinado.** Oferta paga tem teto de 1 a cada
 *    `TETO_PATROCINADO` exibições. Sem teto, a área de membros vira outdoor e
 *    a recomendação perde o pouco de crédito que tinha.
 *
 * Nada aqui decide preço nem comissão: a oferta é um atalho para o produto, e
 * a compra acontece na loja, pelo mesmo caminho de sempre.
 */

import { supabase } from "@/integrations/supabase/client";

export type OfertaDeCurso = {
  productId: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  price: number;
  /** Marcado como destaque no admin. É o que conta para o teto. */
  patrocinado: boolean;
};

/** Onde a oferta aparece. Cada ponto tem um texto diferente. */
export type PontoDaOferta = "entrada" | "fim-de-modulo" | "fim-de-aula";

const DIAS_DE_DESCANSO = 14;
const TETO_PATROCINADO = 6;

const CHAVE_DISPENSADAS = "fitmind_upsell_dispensadas";
const CHAVE_CONTAGEM = "fitmind_upsell_contagem";

type Dispensadas = Record<string, number>;

function lerJson<T>(chave: string, padrao: T): T {
  if (typeof window === "undefined") return padrao;
  try {
    const raw = window.localStorage.getItem(chave);
    return raw ? (JSON.parse(raw) as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravarJson(chave: string, valor: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* modo privado nega escrita; a oferta volta a aparecer, e tudo bem */
  }
}

/** Registra que a pessoa dispensou esta oferta. */
export function dispensarOferta(productId: string): void {
  const atual = lerJson<Dispensadas>(CHAVE_DISPENSADAS, {});
  atual[productId] = Date.now();
  gravarJson(CHAVE_DISPENSADAS, atual);
}

function estaDescansando(productId: string): boolean {
  const atual = lerJson<Dispensadas>(CHAVE_DISPENSADAS, {});
  const quando = Number(atual[productId] || 0);
  if (!quando) return false;
  return Date.now() - quando < DIAS_DE_DESCANSO * 24 * 60 * 60 * 1000;
}

/**
 * Quantas ofertas já foram mostradas. É o denominador do teto.
 *
 * Conta EXIBIÇÃO, não clique: o teto existe para limitar o quanto a pessoa vê
 * de anúncio, e não o quanto ela responde a ele.
 */
function contagem(): { total: number; patrocinadas: number } {
  return lerJson(CHAVE_CONTAGEM, { total: 0, patrocinadas: 0 });
}

export function registrarExibicao(oferta: OfertaDeCurso): void {
  const c = contagem();
  gravarJson(CHAVE_CONTAGEM, {
    total: c.total + 1,
    patrocinadas: c.patrocinadas + (oferta.patrocinado ? 1 : 0),
  });
}

/** Já pode mostrar mais um patrocinado, ou o teto de 1 em N foi atingido? */
function cabePatrocinado(): boolean {
  const c = contagem();
  // Na primeira exibição da vida `total` é 0: deixa passar, senão o primeiro
  // patrocinado nunca apareceria.
  if (c.total === 0) return true;
  return c.patrocinadas / c.total < 1 / TETO_PATROCINADO;
}

/**
 * Escolhe a próxima oferta, ou `null` quando não há nada honesto a oferecer.
 *
 * @param jaTenho ids de curso que a pessoa já acessa — vêm de "Meus cursos",
 *        que é a mesma fonte que decide o que ela enxerga. Curso incluso na
 *        mensalidade entra aqui sem ter linha de compra, e é justamente por
 *        isso que o filtro é por acesso e não por pagamento.
 */
export async function escolherOferta(
  jaTenho: string[],
  cursoAtualId: string,
): Promise<OfertaDeCurso | null> {
  const { data, error } = await supabase
    .from("digital_products")
    .select("id,title,description,cover_url,price,is_featured,sort_order")
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[upsell] catálogo", error);
    return null;
  }

  const tenho = new Set([...jaTenho, cursoAtualId]);
  const candidatas: OfertaDeCurso[] = ((data as Array<Record<string, unknown>>) || [])
    .filter((r) => !tenho.has(String(r.id)))
    .filter((r) => !estaDescansando(String(r.id)))
    .map((r) => ({
      productId: String(r.id),
      title: String(r.title || ""),
      description: (r.description as string) || null,
      coverUrl: (r.cover_url as string) || null,
      price: Number(r.price || 0),
      patrocinado: r.is_featured === true,
    }));

  if (!candidatas.length) return null;

  // Patrocinado primeiro, mas só enquanto couber no teto. Estourou o teto, ele
  // sai da fila e a vez é de quem entrou por mérito de catálogo.
  const podePatrocinar = cabePatrocinado();
  const preferidas = podePatrocinar ? candidatas.filter((c) => c.patrocinado) : [];
  const resto = candidatas.filter((c) => !c.patrocinado);

  return preferidas[0] ?? resto[0] ?? null;
}

/** Texto de cada ponto. Momento diferente pede promessa diferente. */
export function textoDaOferta(ponto: PontoDaOferta): { titulo: string; apoio: string } {
  switch (ponto) {
    case "fim-de-modulo":
      return {
        titulo: "Terminou este módulo",
        apoio: "Quem chegou até aqui costuma continuar por este:",
      };
    case "fim-de-aula":
      return {
        titulo: "Continue estudando",
        apoio: "Outro curso que combina com o que você está vendo:",
      };
    default:
      return {
        titulo: "Também para você",
        apoio: "Selecionado a partir do que você já estuda:",
      };
  }
}
