/**
 * Atribuicao de indicacao (quem trouxe a pessoa).
 *
 * Regra central: ATRIBUICAO e DESTINO sao coisas separadas.
 * Antes, as duas viviam dentro da rota /r/{code}, e por isso todo link
 * compartilhado terminava em /register. Aqui fica so o "quem indicou";
 * o "onde cai" e responsabilidade da rota.
 *
 * Um link explícito válido inicia a jornada atual e substitui uma atribuição
 * antiga ainda não convertida. Links sem `ref` nunca alteram a atribuição.
 *
 * Compatibilidade: continua espelhando em sessionStorage["fitmind_referral"],
 * que e o formato lido hoje por /r/$code e pelo cadastro. Nada quebra.
 */

const CHAVE = "fitmind_atribuicao";
const CHAVE_LEGADA = "fitmind_referral";
/** Id do "toque" gravado no servidor — prova de origem quando o storage some. */
const CHAVE_TOQUE = "fitmind_toque";
const VALIDADE_DIAS = 30;
export const ATTRIBUTION_CHANGED_EVENT = "fitmind:attribution-changed";


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
 * Grava a atribuição do link explícito atual. O mesmo código preserva o
 * instante original, mas recebe os dados resolvidos mais recentes.
 */
export function gravarAtribuicao(nova: Omit<Atribuicao, "em">): Atribuicao | null {
  if (typeof window === "undefined") return null;
  if (!nova?.codigo) return lerAtribuicao();

  const existente = lerAtribuicao();
  const mesmoCodigo = existente?.codigo === nova.codigo;
  const registro: Atribuicao = {
    ...nova,
    coachId: nova.coachId ?? (mesmoCodigo ? existente.coachId : null),
    coachNome: nova.coachNome ?? (mesmoCodigo ? existente.coachNome : null),
    parceiroId: nova.parceiroId ?? (mesmoCodigo ? existente.parceiroId : null),
    em: mesmoCodigo ? existente.em : agora(),
  };
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
    window.dispatchEvent(new CustomEvent(ATTRIBUTION_CHANGED_EVENT, { detail: registro }));
  } catch {
    /* storage indisponivel (aba anonima, cota) — segue sem atribuicao */
  }
  return registro;
}

/** Id do último toque de indicação registrado no servidor neste aparelho. */
export function lerToqueId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CHAVE_TOQUE);
  } catch {
    return null;
  }
}

export function gravarToqueId(id: string | null) {
  if (typeof window === "undefined" || !id) return;
  try {
    window.localStorage.setItem(CHAVE_TOQUE, id);
  } catch { /* ignora */ }
}

/**
 * Registra no servidor que este código de indicação foi aberto.
 * O armazenamento do navegador se perde quando o cadastro termina em outro
 * contexto (WebView do WhatsApp -> Safari no login com Apple). O toque fica
 * no banco e serve como prova de origem, além de alimentar o rastreio no admin.
 */
export async function registrarToque(codigo: string, productId?: string | null): Promise<string | null> {
  if (typeof window === "undefined" || !codigo) return null;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.rpc("registrar_toque_indicacao" as never, {
      _code: codigo,
      _product_id: productId ?? null,
      _landing_path: `${window.location.pathname}${window.location.search}`.slice(0, 400),
      _user_agent: window.navigator.userAgent.slice(0, 400),
    } as never);
    const id = (typeof data === "string" ? data : null) as string | null;
    if (error || !id) return null;
    gravarToqueId(id);
    return id;
  } catch {
    return null;
  }
}

/** Grava e espelha todos os campos retornados pela validação do código. */
export function gravarAtribuicaoResolvida(
  codigo: string,
  row: CodigoResolvido,
  productId?: string | null,
): Atribuicao | null {
  const registro = gravarAtribuicao({
    codigo,
    coachId: row.coach_id,
    coachNome: row.sponsor_name,
    parceiroId: row.partner_id,
  });
  if (registro) {
    espelharSessao(registro, {
      referredByStudentId: row.referred_by_student_id,
      kind: row.kind,
    });
    void registrarToque(codigo, productId ?? null);
  }
  return registro;
}


/** Espelho no formato legado lido pelos formulários de cadastro. */
function espelharSessao(a: Atribuicao, extras?: { referredByStudentId?: string | null; kind?: string | null }) {
  try {
    window.sessionStorage.setItem(
      CHAVE_LEGADA,
      JSON.stringify({
        code: a.codigo,
        kind: extras?.kind ?? null,
        coachId: a.coachId,
        sponsorName: a.coachNome,
        partnerId: a.parceiroId,
        referredByStudentId: extras?.referredByStudentId ?? null,
      }),
    );
  } catch { /* storage indisponivel */ }
}

export type CodigoResolvido = {
  valid: boolean;
  kind: "coach" | "student" | "partner" | null;
  sponsor_name: string | null;
  coach_id: string | null;
  referred_by_student_id: string | null;
  partner_id: string | null;
};

/** Consulta o banco para saber QUEM é o dono do código de indicação. */
export async function resolverCodigo(codigo: string): Promise<CodigoResolvido | null> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.rpc(
      "validate_referral_code" as never,
      { _code: codigo } as never,
    );
    if (error) return null;
    const row = (Array.isArray(data) ? (data[0] as CodigoResolvido | undefined) : null) ?? null;
    return row?.valid ? row : null;
  } catch {
    return null;
  }
}

/**
 * Links `?ref={codigo}` gravam só o texto do código. Sem o coach resolvido,
 * o retorno do Google cai no seletor vazio e a indicação se perde.
 * Esta função completa o registro com id/nome do indicador.
 */
export async function enriquecerAtribuicao(): Promise<Atribuicao | null> {
  if (typeof window === "undefined") return null;
  const a = lerAtribuicao();
  if (!a || a.coachId) return a;

  const row = await resolverCodigo(a.codigo);
  if (!row) return a;

  const atualizado: Atribuicao = {
    ...a,
    coachId: row.coach_id,
    coachNome: row.sponsor_name,
    parceiroId: row.partner_id,
  };
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(atualizado));
  } catch { /* ignora */ }
  espelharSessao(atualizado, {
    referredByStudentId: row.referred_by_student_id,
    kind: row.kind,
  });
  window.dispatchEvent(new CustomEvent(ATTRIBUTION_CHANGED_EVENT, { detail: atualizado }));
  return atualizado;
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
    const registro = gravarAtribuicao({
      codigo,
      coachId: null,
      coachNome: null,
      parceiroId: null,
    });
    // Prova de origem no servidor: sobrevive à troca de navegador no OAuth.
    void registrarToque(codigo, params.get("p"));
    return registro;
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

/**
 * Anexa a indicação vigente (código + id do toque) a uma URL absoluta de
 * retorno do OAuth. É isso que faz a indicação sobreviver quando o login
 * com Apple/Google continua em outro navegador.
 */
export function urlDeRetornoComIndicacao(url: string): string {
  const a = lerAtribuicao();
  const toque = lerToqueId();
  if (!a && !toque) return url;
  try {
    const u = new URL(url);
    if (a?.codigo) u.searchParams.set("ref", a.codigo);
    if (toque) u.searchParams.set("rt", toque);
    return u.toString();
  } catch {
    return url;
  }
}


/** Limpa. Usar apos o cadastro concluir e a indicacao ja ter sido registrada. */
export function limparAtribuicao() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CHAVE);
    window.localStorage.removeItem(CHAVE_TOQUE);
    window.sessionStorage.removeItem(CHAVE_LEGADA);

  } catch {
    /* ignora */
  }
}

export type ToqueIndicacao = {
  id: string;
  code: string;
  coachId: string | null;
  sponsorName: string | null;
  partnerId: string | null;
  referredByStudentId: string | null;
  claimedProfileId: string | null;
};

/** Lê no servidor o toque de indicação registrado quando o link foi aberto. */
export async function resolverToque(id: string | null): Promise<ToqueIndicacao | null> {
  if (!id) return null;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.rpc("toque_indicacao_por_id" as never, { _touch_id: id } as never);
    if (error) return null;
    const row = (Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : null) ?? null;
    if (!row) return null;
    return {
      id: String(row.id),
      code: String(row.code ?? ""),
      coachId: (row.coach_id as string | null) ?? null,
      sponsorName: (row.sponsor_name as string | null) ?? null,
      partnerId: (row.partner_id as string | null) ?? null,
      referredByStudentId: (row.referred_by_student_id as string | null) ?? null,
      claimedProfileId: (row.claimed_profile_id as string | null) ?? null,
    };
  } catch {
    return null;
  }
}
