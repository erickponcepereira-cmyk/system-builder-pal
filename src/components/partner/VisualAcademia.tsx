import type { ReactNode } from "react";

/**
 * O vocabulário visual do painel da academia.
 *
 * A tese vem do relatório (`RelatorioAcademia`), que foi restilizado primeiro:
 *
 * - **Vermelho (`aca-acao`) é AÇÃO.** Só pinta o que se pode clicar — link e
 *   botão. Antes ele pintava também cabeçalho e alerta, e por pintar tudo não
 *   significava nada.
 * - **Estado tem cor própria e vira TARJA** de 3px na borda esquerda do cartão,
 *   nunca a cor do número. `aca-acao` e `aca-critico` são o mesmo tom de
 *   propósito: quem separa os dois é a forma, não a cor.
 * - **Hierarquia vem do tamanho**, não da cor: número grande, rótulo de 10px em
 *   versalete, nota de 12px.
 *
 * Mora num arquivo próprio, e não no topo do `AcademiaTestePanel`, porque
 * `RenovarAluno` e `CadastrarPessoaAcademia` também precisam do vocabulário e
 * são importados por ele — pendurar isto lá fecharia um ciclo de import.
 *
 * Os tokens `aca-*` só existem sob a classe `.painel-academia`, que o painel
 * veste no container raiz. Quem usar estes componentes fora dali fica sem cor.
 */

/**
 * O estado da academia, e só ele, tem cor própria.
 *
 * `neutro` é o padrão porque a maioria dos números só conta o que aconteceu:
 * dar cor a eles seria pedir uma ação que não existe.
 */
export type Tom = "ok" | "atencao" | "critico" | "neutro";

const TARJA_POR_TOM: Record<Tom, string> = {
  ok: "bg-aca-ok",
  atencao: "bg-aca-atencao",
  critico: "bg-aca-critico",
  neutro: "bg-aca-neutro",
};

/**
 * Pílula de estado: contorno na cor do tom, nunca preenchimento.
 *
 * Preenchida ela viraria botão aos olhos — e nesta tela o que é sólido e
 * vermelho se clica. Contornada, ela diz a mesma coisa sem prometer ação.
 */
const PILULA_POR_TOM: Record<Tom, string> = {
  ok: "border-aca-ok text-aca-ok",
  atencao: "border-aca-atencao text-aca-atencao",
  critico: "border-aca-critico text-aca-critico",
  neutro: "border-aca-line-forte text-aca-muted",
};

/** Rótulo de seção: versalete de 10px, o degrau mais baixo da hierarquia. */
export const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-aca-fraco";

/** Rótulo de campo, um degrau acima do EYEBROW porque acompanha um controle. */
export const ROTULO = "text-[10px] uppercase tracking-[0.1em] text-aca-muted";

/** Texto de apoio: explica a regra, nunca carrega o dado. */
export const NOTA = "text-[12px] leading-snug text-aca-muted";

/** Anel de foco. Separado para nenhum controle novo nascer sem ele. */
export const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aca-acao";

/**
 * Campo de formulário.
 *
 * Fundo `alto` e não `surface`: o campo quase sempre mora dentro de um `Bloco`,
 * que já é `surface` — igualados, o campo desapareceria.
 */
export const CAMPO = `rounded-xl border border-aca-line bg-aca-alto px-3 py-2 text-sm text-aca-ink placeholder:text-aca-fraco ${FOCO}`;

/** O mesmo campo, apertado, para linhas com muitos controles lado a lado. */
export const CAMPO_MINI = `rounded-lg border border-aca-line bg-aca-alto px-2 py-1 text-[11px] text-aca-ink placeholder:text-aca-fraco ${FOCO}`;

/** O botão que conclui. Vermelho porque é a ação principal da tela. */
export const BOTAO_ACAO = `flex items-center justify-center gap-2 rounded-xl bg-aca-acao px-4 py-2.5 text-sm font-bold text-white ${FOCO} disabled:opacity-50`;

/** Ação secundária: clicável, mas não é o desfecho — por isso não é vermelha. */
export const BOTAO_NEUTRO = `flex items-center justify-center gap-2 rounded-xl border border-aca-line bg-aca-alto px-3 py-2 text-sm font-bold text-aca-ink hover:border-aca-line-forte ${FOCO} disabled:opacity-50`;

/** Ação em linha de texto — "limpar", "trocar", "+ dividir". */
export const BOTAO_TEXTO = `rounded-lg px-2 py-1 text-[11px] font-semibold text-aca-acao hover:bg-aca-alto ${FOCO} disabled:opacity-50`;

/** Botão só de ícone: fechar, subir, descer, apagar. */
export const BOTAO_ICONE = `shrink-0 rounded-lg p-1.5 text-aca-muted hover:bg-aca-alto hover:text-aca-ink ${FOCO} disabled:opacity-30`;

/** Trecho de comando ou caminho de arquivo. */
export const CODIGO = "rounded bg-aca-alto px-1.5 py-0.5 font-mono text-[10px] text-aca-ink";

/**
 * Botão de escolha: aba, dia da semana, duração, plano.
 *
 * O escolhido é preenchido de vermelho porque escolher é clicar. Com 14 abas,
 * perder o "onde estou" custa mais caro que qualquer sutileza de tom.
 */
export const escolha = (ativo: boolean) =>
  ativo
    ? `bg-aca-acao font-semibold text-white ${FOCO}`
    : `border border-aca-line bg-aca-surface text-aca-muted hover:border-aca-line-forte hover:text-aca-ink ${FOCO}`;

/**
 * O cartão do painel.
 *
 * Sem `tom` é só uma superfície. Com `tom`, ganha a tarja de 3px na borda
 * esquerda — é ali, e só ali, que o estado aparece.
 */
export function Bloco({ tom, className = "", children }: {
  tom?: Tom; className?: string; children: ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-aca-line bg-aca-surface p-3 ${tom ? "pl-4" : ""} ${className}`}>
      {tom && <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${TARJA_POR_TOM[tom]}`} />}
      {children}
    </div>
  );
}

/**
 * Um número do painel — o mesmo corpo do `Cartao` do relatório.
 *
 * O estado mora na tarja, nunca na cor do número: aqui dentro vermelho
 * significa uma coisa só — dá para clicar.
 */
export function Cartao({ rot, valor, nota, tom = "neutro", acao = "Ver a lista", aoClicar }: {
  rot: string; valor: string; nota?: string; tom?: Tom; acao?: string; aoClicar?: () => void;
}) {
  // Moeda é string longa e não cabe no mesmo corpo de um contador de 3 dígitos.
  const ehMoeda = valor.trimStart().startsWith("R$");
  // Numero que esconde gente vira botao: e daqui que a recepcao chega na lista.
  const Tag = (aoClicar ? "button" : "div") as "button" | "div";
  return (
    <Tag
      type={aoClicar ? "button" : undefined}
      onClick={aoClicar}
      className={`relative w-full overflow-hidden rounded-xl border border-aca-line bg-aca-surface py-3 pl-4 pr-2.5 text-left md:pr-3 ${
        aoClicar ? `hover:border-aca-line-forte hover:bg-aca-alto ${FOCO}` : ""
      }`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${TARJA_POR_TOM[tom]}`} />
      <span className={`block ${ROTULO}`}>{rot}</span>
      <span className={`mt-1 block font-bold leading-none tabular-nums text-aca-ink ${ehMoeda ? "text-[20px] lg:text-[23px]" : "text-[28px]"}`}>
        {valor}
      </span>
      {nota && <span className={`mt-1.5 block ${NOTA}`}>{nota}</span>}
      {aoClicar && <span className="mt-1.5 block text-[11px] font-semibold text-aca-acao">{acao} ›</span>}
    </Tag>
  );
}

/**
 * Selo de estado.
 *
 * Fica cinza de propósito: a cor do estado já está na tarja do cartão que
 * abriga esta linha, e repeti-la aqui devolveria o problema que o restyle
 * resolveu — cor em todo lugar, significando nada.
 */
export function Selo({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded border border-aca-line bg-aca-alto px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] tabular-nums text-aca-muted">
      {children}
    </span>
  );
}

/** Situação de uma pessoa na lista: ativo, vence em breve, bloqueado. */
export function Pilula({ tom = "neutro", children }: { tom?: Tom; children: ReactNode }) {
  return (
    <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] ${PILULA_POR_TOM[tom]}`}>
      {children}
    </span>
  );
}

/** Etiqueta de lista: turma, feriado, forma de pagamento. */
export function Etiqueta({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-aca-line bg-aca-surface px-2.5 py-1 text-[11px] text-aca-muted">
      {children}
    </span>
  );
}

/**
 * Linha de histórico: o que aconteceu à esquerda, quando à direita.
 *
 * O número vai à direita com `tabular-nums` para as datas empilhadas alinharem
 * — sem isso a coluna serrilha e não dá para varrer com o olho.
 */
export function LinhaDado({ esquerda, direita }: { esquerda: ReactNode; direita: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-[12px] text-aca-ink">{esquerda}</span>
      <span className="shrink-0 text-[10px] tabular-nums text-aca-muted">{direita}</span>
    </div>
  );
}

/** Rótulo em cima, controle embaixo. */
export function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className={`mb-1 ${EYEBROW}`}>{label}</p>
      {children}
    </div>
  );
}
