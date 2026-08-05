/**
 * Motor do robô — decide o que responder quando chega uma mensagem.
 *
 * Roda no servidor, chamado por /api/bot/eventos. A ordem importa:
 *
 *   1. É um token de verificação? Confirma e responde. Encerra aqui.
 *   2. A conversa está com atendente humano? Não interfere.
 *   3. Vincula ao CRM (a conversa vira lead no funil, sozinha).
 *   4. Roda o fluxo: acha a etapa atual, casa a resposta com uma opção,
 *      avança e enfileira o que o robô vai dizer.
 *
 * Enfileirar é só inserir em bot_mensagens com status 'pendente' — o conector
 * no PC da academia busca e envia. A nuvem nunca alcança aquele computador.
 */

type Db = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

/** Formato do token de verificação: 3 letras + 4 caracteres. Ex.: FIT-7K2P */
const RE_TOKEN = /\b([A-Z]{3}-[A-Z0-9]{4})\b/i;

export type Conexao = {
  id: string;
  escopo: string;
  owner_id: string | null;
};

/** Coloca uma mensagem na fila de saída. O conector busca e envia. */
export async function enfileirar(db: Db, conversaId: string, corpo: string) {
  if (!corpo?.trim()) return null;
  const { data, error } = await db
    .from("bot_mensagens")
    .insert({ conversa_id: conversaId, direcao: "saida", tipo: "texto", corpo, status: "pendente" })
    .select("id")
    .single();
  if (error) return null;
  // registra no histórico do cartão, se a conversa já virou lead
  await db.rpc("bot_registrar_no_cartao", {
    _conversa_id: conversaId,
    _texto: corpo,
    _direcao: "saida",
  });
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Verificação por WhatsApp. Quem manda é a pessoa, não a gente — por isso o
 * número não toma mensagem fria, que é o que faz o WhatsApp bloquear chip.
 */
async function tentarVerificacao(
  db: Db,
  texto: string,
  conversaId: string,
  telefone: string,
  conexaoId: string,
  nome: string | null,
): Promise<boolean> {
  const m = texto.match(RE_TOKEN);
  if (!m) return false;

  const { data, error } = await db.rpc("bot_confirmar_verificacao", {
    _token: m[1],
    _telefone: telefone,
    _conexao_id: conexaoId,
    _conversa_id: conversaId,
    _nome: nome,
  });
  if (error) return false;

  const r = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; motivo: string; finalidade: string | null }
    | null;
  if (!r) return false;

  if (r.ok) {
    await enfileirar(db, conversaId, "Pronto! Sua conta na FitMind está confirmada. Bons treinos 💪");
  } else if (r.motivo === "expirado") {
    await enfileirar(db, conversaId, "Esse código expirou. Volte no aplicativo e peça um novo, por favor.");
  } else if (r.motivo === "ja usado") {
    await enfileirar(db, conversaId, "Essa confirmação já tinha sido feita. Está tudo certo por aqui.");
  } else {
    // token não encontrado: pode ser texto normal parecido com token, então
    // não responde nada e deixa o fluxo seguir
    return false;
  }
  return true;
}

/** Acha o fluxo que deve atender esta conversa. */
async function escolherFluxo(db: Db, conexao: Conexao, texto: string) {
  const { data } = await db
    .from("bot_fluxos")
    .select("id, gatilho_tipo, gatilho_valor, passo_inicial_id")
    .eq("escopo", conexao.escopo)
    .eq("owner_id", conexao.owner_id)
    .eq("ativo", true)
    .is("arquivado_em", null);

  const fluxos = (data ?? []) as Array<{
    id: string;
    gatilho_tipo: string;
    gatilho_valor: string | null;
    passo_inicial_id: string | null;
  }>;
  if (!fluxos.length) return null;

  const t = texto.toLowerCase();
  // palavra-chave tem preferência sobre o fluxo genérico de primeira mensagem
  const porPalavra = fluxos.find(
    (f) =>
      f.gatilho_tipo === "palavra_chave" &&
      f.gatilho_valor &&
      f.gatilho_valor
        .split(",")
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean)
        .some((p) => t.includes(p)),
  );
  return porPalavra ?? fluxos.find((f) => f.gatilho_tipo === "primeira_mensagem") ?? null;
}

/** Lê um passo com as opções dele. */
async function lerPasso(db: Db, passoId: string) {
  const { data: passo } = await db
    .from("bot_passos")
    .select("id, fluxo_id, chave, tipo, conteudo, proximo_passo_id, acao, acao_params")
    .eq("id", passoId)
    .maybeSingle();
  if (!passo) return null;

  const { data: opcoes } = await db
    .from("bot_opcoes")
    .select("id, rotulo, gatilho, proximo_passo_id, posicao")
    .eq("passo_id", passoId)
    .order("posicao");

  return {
    ...(passo as Record<string, any>),
    opcoes: (opcoes ?? []) as Array<{ rotulo: string; gatilho: string; proximo_passo_id: string | null }>,
  } as Record<string, any> & {
    opcoes: Array<{ rotulo: string; gatilho: string; proximo_passo_id: string | null }>;
  };
}

/** Monta o texto do passo, colando as opções embaixo quando for pergunta. */
function textoDoPasso(passo: any): string {
  const base = (passo.conteudo ?? "").trim();
  if (passo.tipo !== "pergunta" || !passo.opcoes?.length) return base;
  const lista = passo.opcoes.map((o: any) => `${o.gatilho}) ${o.rotulo}`).join("\n");
  return base ? `${base}\n\n${lista}` : lista;
}

/** Executa a ação de um passo do tipo 'acao'. */
async function executarAcao(db: Db, passo: any, conversaId: string) {
  switch (passo.acao) {
    case "criar_cartao_crm":
      await db.rpc("bot_vincular_cartao", { _conversa_id: conversaId });
      break;
    case "transferir":
      await db.from("bot_conversas").update({ estado: "humano" }).eq("id", conversaId);
      break;
    default:
      break;
  }
}

/**
 * Anda no fluxo a partir de um passo, enfileirando o que precisar.
 * Passos de mensagem encadeiam sozinhos; para em pergunta, transferência ou fim.
 * O limite de 10 evita laço infinito se alguém montar um fluxo circular.
 */
async function caminhar(db: Db, conversaId: string, passoId: string | null) {
  let atual = passoId;
  for (let i = 0; i < 10 && atual; i++) {
    const passo = await lerPasso(db, atual);
    if (!passo) break;

    if (passo.tipo === "acao") await executarAcao(db, passo, conversaId);

    const texto = textoDoPasso(passo);
    if (texto) await enfileirar(db, conversaId, texto);

    if (passo.tipo === "pergunta") {
      // espera a resposta da pessoa
      await db.from("bot_conversas").update({ passo_atual_id: passo.id }).eq("id", conversaId);
      return;
    }
    if (passo.tipo === "transferir") {
      await db
        .from("bot_conversas")
        .update({ estado: "humano", passo_atual_id: passo.id })
        .eq("id", conversaId);
      return;
    }
    if (passo.tipo === "encerrar") {
      await db
        .from("bot_conversas")
        .update({ estado: "encerrada", encerrada_em: new Date().toISOString(), passo_atual_id: null })
        .eq("id", conversaId);
      return;
    }

    atual = passo.proximo_passo_id;
    await db.from("bot_conversas").update({ passo_atual_id: atual }).eq("id", conversaId);
  }
}

/**
 * Ponto de entrada: chamado quando chega uma mensagem do conector.
 * Devolve o que foi feito, para o log da rota.
 */
export async function processarMensagem(
  db: Db,
  opts: {
    conexao: Conexao;
    conversaId: string;
    telefone: string;
    texto: string;
    nome: string | null;
  },
): Promise<{ acao: string }> {
  const { conexao, conversaId, telefone, texto, nome } = opts;
  const limpo = (texto ?? "").trim();

  // 1. token de verificação tem prioridade sobre tudo
  if (limpo && (await tentarVerificacao(db, limpo, conversaId, telefone, conexao.id, nome))) {
    return { acao: "verificacao" };
  }

  // 2. conversa com atendente humano: o robô não interfere
  const { data: conv } = await db
    .from("bot_conversas")
    .select("id, estado, fluxo_id, passo_atual_id")
    .eq("id", conversaId)
    .maybeSingle();
  const conversa = conv as {
    estado: string;
    fluxo_id: string | null;
    passo_atual_id: string | null;
  } | null;
  if (!conversa) return { acao: "conversa nao encontrada" };
  if (conversa.estado !== "bot") return { acao: `ignorado (estado ${conversa.estado})` };

  // 3. vira lead no funil, sozinho
  await db.rpc("bot_vincular_cartao", { _conversa_id: conversaId });
  await db.rpc("bot_registrar_no_cartao", {
    _conversa_id: conversaId,
    _texto: limpo,
    _direcao: "entrada",
  });

  // 4. já está no meio de um fluxo? tenta casar a resposta com uma opção
  if (conversa.passo_atual_id) {
    const passo = await lerPasso(db, conversa.passo_atual_id);
    if (passo?.opcoes?.length) {
      const resp = limpo.toLowerCase();
      const escolha =
        passo.opcoes.find((o: any) => resp === o.gatilho.toLowerCase()) ??
        passo.opcoes.find((o: any) => resp.includes(o.gatilho.toLowerCase())) ??
        passo.opcoes.find((o: any) => resp.includes(o.rotulo.toLowerCase()));

      if (escolha) {
        await caminhar(db, conversaId, escolha.proximo_passo_id);
        return { acao: "avancou no fluxo" };
      }
      // não entendeu: repete as opções sem sair do lugar
      await enfileirar(db, conversaId, `Não entendi. ${textoDoPasso(passo)}`);
      return { acao: "repetiu as opcoes" };
    }
  }

  // 5. começo de conversa: escolhe o fluxo e entra nele
  const fluxo = await escolherFluxo(db, conexao, limpo);
  if (!fluxo) return { acao: "sem fluxo ativo" };

  await db.from("bot_conversas").update({ fluxo_id: fluxo.id }).eq("id", conversaId);
  await caminhar(db, conversaId, fluxo.passo_inicial_id);
  return { acao: "iniciou fluxo" };
}
