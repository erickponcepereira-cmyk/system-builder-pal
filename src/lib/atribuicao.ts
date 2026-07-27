/**
 * Atribuicao de indicacao (quem trouxe a pessoa).
 *
 * Regra central: ATRIBUICAO e DESTINO sao coisas separadas.
 * Antes, as duas viviam dentro da rota /r/{code}, e por isso todo link
 * compartilhado terminava em /register. Aqui fica so o "quem indicou";
 * o "onde cai" e responsabilidade da rota.
 *
 * Regra de negocio: PRIMEIRO TOQUE VENCE. Se a pessoa chega pelo link do
 * coach A, navega, e depois abre um link generico, o A continua dono da
 * indicacao. Sem isso ha disputa de comissao.
 *
 * Compatibilidade: continua espelhando em sessionStorage["fitmind_referral"],
 * que e o formato lido hoje por /r/$code e pelo cadastro. Nada quebra.
 */

const CHAVE = "fitmind_atribuicao";
const CHAVE_LEGADA = "fitmind_referral";
const VALIDADE_DIAS = 30;

export type Atribuicao = {
  codigo: string;
  coachId: string | null;
  coachNome: string | null;
  parceiroId: string | null;
  /** epoch ms do primeiro toque */
  em: number;
};

function agora() {
  return Date.now();
}

function expirou(a: Atribuicao) {
  return agora() - a.em > VALIDADE_DIAS * 24 * 60 * 60 * 1000;
}

/** Le a atribuicao vigente, ou null. Limpa sozinha se expirou. */
export function lerAtribuicao(): Atribuicao | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const a = JSON.parse(bruto) as Atribuicao;
    if (!a?.codigo) return null;
    if (expirou(a)) {
      window.localStorage.removeItem(CHAVE);
      return null;
    }
    return a;
  } catch {
    return null;
  }
}

/**
 * Grava a atribuicao respeitando primeiro toque.
 * Retorna a atribuicao que ficou valendo (pode ser a antiga).
 */
export function gravarAtribuicao(nova: Omit<Atribuicao, "em">): Atribuicao | null {
  if (typeof window === "undefined") return null;
  if (!nova?.codigo) return lerAtribuicao();

  const existente = lerAtribuicao();
  if (existente) return existente; // primeiro toque vence

  const registro: Atribuicao = { ...nova, em: agora() };
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(registro));
    // espelho no formato EXATO que /r/$code grava e que os formulários de
    // cadastro leem (CoachRegistration, PartnerRegistration, StudentRegistration).
    // A chave é `sponsorName` — não renomear sem alterar os três.
    window.sessionStorage.setItem(
      CHAVE_LEGADA,
      JSON.stringify({
        code: registro.codigo,
        coachId: registro.coachId,
        sponsorName: registro.coachNome,
        partnerId: registro.parceiroId,
      }),
    );
  } catch {
    /* storage indisponivel (aba anonima, cota) — segue sem atribuicao */
  }
  return registro;
}

/**
 * Extrai ?ref= da URL e grava. Chamar no topo de qualquer rota publica.
 * Devolve a atribuicao vigente depois da tentativa.
 */
export function capturarAtribuicaoDaUrl(busca?: string): Atribuicao | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(busca ?? window.location.search);
  const codigo = params.get("ref");
  if (codigo) {
    return gravarAtribuicao({
      codigo,
      coachId: null,
      coachNome: null,
      parceiroId: null,
    });
  }
  return lerAtribuicao();
}

/** Acrescenta ?ref= a um caminho, se houver atribuicao vigente. */
export function comAtribuicao(caminho: string): string {
  const a = lerAtribuicao();
  if (!a) return caminho;
  const sep = caminho.includes("?") ? "&" : "?";
  return `${caminho}${sep}ref=${encodeURIComponent(a.codigo)}`;
}

/** Limpa. Usar apos o cadastro concluir e a indicacao ja ter sido registrada. */
export function limparAtribuicao() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CHAVE);
    window.sessionStorage.removeItem(CHAVE_LEGADA);
  } catch {
    /* ignora */
  }
}
