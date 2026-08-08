/**
 * Validação e deduplicação de corridas externas.
 *
 * Funções PURAS de propósito: entram atividades, saem decisões. Nenhum
 * acesso a banco, nenhuma dependência de sessão. Isso permite testar as
 * regras antifraude sem subir nada, e permite que a server function seja
 * uma casca fina em volta daqui.
 *
 * ONDE ISTO RODA: no servidor, dentro de uma server function
 * (`createServerFn` + `requireSupabaseAuth`), nunca no cliente. Se rodasse
 * no navegador, bastaria abrir o DevTools para reescrever as regras.
 *
 * FILOSOFIA DAS TRÊS SAÍDAS
 * Rejeitar tudo que é estranho gera falso positivo e usuário revoltado.
 * Aceitar tudo entrega o prêmio para quem forjar. Por isso há um estado
 * intermediário: a corrida CONTA, mas fica marcada. Quem ganhar o prêmio
 * passa por conferência humana antes do pagamento — e aí as marcações
 * dizem exatamente onde olhar. São 3 pessoas por mês, não 107.
 */

import {
  FONTES_ACEITAS,
  LIMITES,
  TIPOS_QUE_PONTUAM,
  velocidadeKmh,
  type AtividadeExterna,
} from "./corridas-contrato";

export type Veredito = "aceita" | "marcada" | "rejeitada";

export type MotivoCode =
  | "fonte_nao_aceita"
  | "tipo_nao_pontua"
  | "entrada_manual"
  | "metodo_desconhecido"
  | "duracao_curta"
  | "distancia_curta"
  | "velocidade_impossivel"
  | "velocidade_suspeita"
  | "velocidade_baixa"
  | "dados_incoerentes"
  | "data_futura"
  | "fora_do_periodo"
  | "duplicata_de_outra_fonte"
  | "sobreposicao_temporal"
  | "acima_do_teto_diario"
  | "volume_diario_suspeito";

export interface Motivo {
  code: MotivoCode;
  /** Texto para o log de auditoria e para a tela de conferência. */
  detalhe: string;
}

export interface AtividadeAvaliada {
  atividade: AtividadeExterna;
  veredito: Veredito;
  motivos: Motivo[];
  /** Km que efetivamente pontuam. Zero se rejeitada ou cortada pelo teto. */
  kmContados: number;
  /** Chave de idempotência: reenvio não duplica. */
  chaveIdempotencia: string;
  fonteNome: string | null;
  fontePrioridade: number;
}

export interface JanelaDesafio {
  /** ISO. Atividade que terminou antes disto não conta. */
  inicioEm: string;
  /** ISO. Atividade que começou depois disto não conta. */
  fimEm: string;
}

export interface ContextoValidacao {
  janela: JanelaDesafio;
  /** Chaves já gravadas para este aluno — evita recontar em re-sync. */
  chavesJaRegistradas?: Set<string>;
  /** Momento da avaliação. Injetável para teste determinístico. */
  agora?: Date;
}

export function chaveDe(a: AtividadeExterna): string {
  return `${a.origem.appId}:${a.idExterno}`;
}

function ms(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

function diaLocal(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Fração de sobreposição entre duas atividades, sobre a mais curta.
 * Duas gravações da MESMA corrida (Nike + Garmin) cobrem quase o mesmo
 * intervalo; corridas diferentes no mesmo dia, não.
 */
export function sobreposicao(a: AtividadeExterna, b: AtividadeExterna): number {
  const ini = Math.max(ms(a.inicioEm), ms(b.inicioEm));
  const fim = Math.min(ms(a.fimEm), ms(b.fimEm));
  const comum = fim - ini;
  if (comum <= 0) return 0;
  const menor = Math.min(ms(a.fimEm) - ms(a.inicioEm), ms(b.fimEm) - ms(b.inicioEm));
  if (menor <= 0) return 0;
  return comum / menor;
}

/** Regras que dependem só da atividade isolada. */
function avaliarIsolada(a: AtividadeExterna, ctx: ContextoValidacao): {
  veredito: Veredito;
  motivos: Motivo[];
} {
  const motivos: Motivo[] = [];
  const agora = ctx.agora ?? new Date();
  const fonte = FONTES_ACEITAS[a.origem.appId];

  if (!fonte) {
    return {
      veredito: "rejeitada",
      motivos: [{
        code: "fonte_nao_aceita",
        detalhe: `App "${a.origem.appNome ?? a.origem.appId}" não está na lista de fontes aceitas.`,
      }],
    };
  }

  if (!TIPOS_QUE_PONTUAM.includes(a.tipo)) {
    return {
      veredito: "rejeitada",
      motivos: [{ code: "tipo_nao_pontua", detalhe: `Tipo "${a.tipo}" não pontua neste desafio.` }],
    };
  }

  // Fora da janela do desafio: rejeita, não é fraude, é escopo.
  if (ms(a.fimEm) < ms(ctx.janela.inicioEm) || ms(a.inicioEm) > ms(ctx.janela.fimEm)) {
    return {
      veredito: "rejeitada",
      motivos: [{ code: "fora_do_periodo", detalhe: "Atividade fora do período do desafio." }],
    };
  }

  // Data no futuro só existe por relógio adulterado ou registro forjado.
  if (ms(a.fimEm) > agora.getTime() + 5 * 60 * 1000) {
    return {
      veredito: "rejeitada",
      motivos: [{ code: "data_futura", detalhe: "Atividade com término no futuro." }],
    };
  }

  if (a.duracaoMin < LIMITES.duracaoMinMin) {
    return {
      veredito: "rejeitada",
      motivos: [{ code: "duracao_curta", detalhe: `Duração de ${a.duracaoMin} min abaixo do mínimo.` }],
    };
  }

  if (a.distanciaKm < LIMITES.distanciaMinKm) {
    return {
      veredito: "rejeitada",
      motivos: [{ code: "distancia_curta", detalhe: `Distância de ${a.distanciaKm} km abaixo do mínimo.` }],
    };
  }

  const v = velocidadeKmh(a.distanciaKm, a.duracaoMin);

  if (v > LIMITES.velocidadeMaxKmh) {
    return {
      veredito: "rejeitada",
      motivos: [{
        code: "velocidade_impossivel",
        detalhe: `${v.toFixed(1)} km/h — acima do limite humano para corrida. Provável bicicleta, veículo ou dado forjado.`,
      }],
    };
  }

  // Coerência: a duração informada precisa bater com o intervalo declarado.
  // Divergência grande indica registro montado à mão.
  const duracaoPeloIntervalo = (ms(a.fimEm) - ms(a.inicioEm)) / 60000;
  if (duracaoPeloIntervalo > 0) {
    const desvio = Math.abs(duracaoPeloIntervalo - a.duracaoMin) / duracaoPeloIntervalo;
    if (desvio > 0.25) {
      motivos.push({
        code: "dados_incoerentes",
        detalhe: `Duração informada (${a.duracaoMin} min) diverge do intervalo início–fim (${duracaoPeloIntervalo.toFixed(0)} min).`,
      });
    }
  }

  if (a.origem.metodo === "manual") {
    motivos.push({
      code: "entrada_manual",
      detalhe: "Registro digitado à mão, não gravado ao vivo.",
    });
  } else if (a.origem.metodo === "desconhecido") {
    motivos.push({
      code: "metodo_desconhecido",
      detalhe: "A plataforma não informou se o registro foi gravado ao vivo.",
    });
  }

  if (v > LIMITES.velocidadeSuspeitaKmh) {
    motivos.push({
      code: "velocidade_suspeita",
      detalhe: `${v.toFixed(1)} km/h — ritmo de atleta de elite. Confirmar antes de premiar.`,
    });
  }

  if (v < LIMITES.velocidadeMinKmh) {
    motivos.push({
      code: "velocidade_baixa",
      detalhe: `${v.toFixed(1)} km/h — provavelmente caminhada.`,
    });
  }

  return { veredito: motivos.length ? "marcada" : "aceita", motivos };
}

/**
 * Avalia um lote inteiro: regras isoladas, deduplicação e teto diário.
 *
 * A ordem importa. Primeiro descarta o que é inválido por si só, depois
 * resolve duplicatas (senão o teto diário contaria a mesma corrida duas
 * vezes), e só então aplica o limite do dia.
 */
export function avaliarLote(
  atividades: AtividadeExterna[],
  ctx: ContextoValidacao,
): AtividadeAvaliada[] {
  const jaRegistradas = ctx.chavesJaRegistradas ?? new Set<string>();

  // 1) idempotência — re-sync não recontam
  const vistas = new Set<string>();
  const candidatas: AtividadeExterna[] = [];
  for (const a of atividades) {
    const k = chaveDe(a);
    if (jaRegistradas.has(k) || vistas.has(k)) continue;
    vistas.add(k);
    candidatas.push(a);
  }

  // 2) regras isoladas
  const avaliadas: AtividadeAvaliada[] = candidatas.map((a) => {
    const { veredito, motivos } = avaliarIsolada(a, ctx);
    const fonte = FONTES_ACEITAS[a.origem.appId];
    return {
      atividade: a,
      veredito,
      motivos,
      kmContados: veredito === "rejeitada" ? 0 : a.distanciaKm,
      chaveIdempotencia: chaveDe(a),
      fonteNome: fonte?.nome ?? null,
      fontePrioridade: fonte?.prioridade ?? 0,
    };
  });

  // 3) deduplicação por sobreposição temporal.
  //    Mesma corrida registrada por Nike E Garmin: fica a de maior
  //    prioridade. Sem isto, quem usa relógio + celular pontua em dobro.
  const validas = avaliadas.filter((x) => x.veredito !== "rejeitada");
  validas.sort((x, y) => y.fontePrioridade - x.fontePrioridade);

  const mantidas: AtividadeAvaliada[] = [];
  for (const cand of validas) {
    const gemea = mantidas.find(
      (m) => sobreposicao(m.atividade, cand.atividade) >= LIMITES.sobreposicaoDuplicataPct,
    );
    if (gemea) {
      cand.veredito = "rejeitada";
      cand.kmContados = 0;
      cand.motivos.push({
        code: "duplicata_de_outra_fonte",
        detalhe: `Mesma corrida já contabilizada por ${gemea.fonteNome ?? "outra fonte"}.`,
      });
      continue;
    }
    mantidas.push(cand);
  }

  // 4) sobreposição parcial entre corridas distintas = impossível estar
  //    em dois lugares ao mesmo tempo. Marca, não rejeita: pode ser
  //    arredondamento de relógio.
  for (let i = 0; i < mantidas.length; i++) {
    for (let j = i + 1; j < mantidas.length; j++) {
      const s = sobreposicao(mantidas[i].atividade, mantidas[j].atividade);
      if (s > 0 && s < LIMITES.sobreposicaoDuplicataPct) {
        for (const m of [mantidas[i], mantidas[j]]) {
          if (!m.motivos.some((x) => x.code === "sobreposicao_temporal")) {
            m.veredito = m.veredito === "rejeitada" ? m.veredito : "marcada";
            m.motivos.push({
              code: "sobreposicao_temporal",
              detalhe: "Duas corridas com horários sobrepostos no mesmo aluno.",
            });
          }
        }
      }
    }
  }

  // 5) teto diário. Protege o ranking de outlier e evita incentivo a
  //    exagero físico para virar o jogo num único dia.
  const porDia = new Map<string, AtividadeAvaliada[]>();
  for (const m of mantidas) {
    const d = diaLocal(m.atividade.inicioEm);
    const lista = porDia.get(d) ?? [];
    lista.push(m);
    porDia.set(d, lista);
  }

  for (const [dia, lista] of porDia) {
    lista.sort((x, y) => ms(x.atividade.inicioEm) - ms(y.atividade.inicioEm));
    const total = lista.reduce((s, x) => s + x.atividade.distanciaKm, 0);

    if (total > LIMITES.distanciaDiariaSuspeitaKm) {
      for (const x of lista) {
        x.veredito = x.veredito === "rejeitada" ? x.veredito : "marcada";
        x.motivos.push({
          code: "volume_diario_suspeito",
          detalhe: `${total.toFixed(1)} km em ${dia} — volume atípico.`,
        });
      }
    }

    let acumulado = 0;
    for (const x of lista) {
      const disponivel = Math.max(0, LIMITES.distanciaDiariaContadaKm - acumulado);
      const conta = Math.min(x.kmContados, disponivel);
      if (conta < x.kmContados) {
        x.motivos.push({
          code: "acima_do_teto_diario",
          detalhe: `Teto de ${LIMITES.distanciaDiariaContadaKm} km/dia atingido; ${(x.kmContados - conta).toFixed(1)} km não contados.`,
        });
      }
      x.kmContados = conta;
      acumulado += conta;
    }
  }

  return avaliadas;
}

/** Soma dos km que efetivamente pontuam. */
export function somarKmValidos(avaliadas: AtividadeAvaliada[]): number {
  return avaliadas.reduce((s, x) => s + x.kmContados, 0);
}

/**
 * ORDENAÇÃO DO "QUEM BATE X KM PRIMEIRO" — a armadilha do desafio.
 *
 * Registro de saúde aceita data retroativa: alguém sincroniza hoje uma
 * corrida datada de anteontem e reivindica uma posição que já era de
 * outra pessoa. Se o ranking ordenar pelo horário da corrida, ganha quem
 * sincronizar por último com a data mais antiga.
 *
 * Por isso a ordem é pelo momento em que a meta foi ATINGIDA NO SERVIDOR
 * (`atingidoEm`, carimbado no backend), nunca pelo timestamp da atividade.
 * O horário da corrida continua guardado e é o que se exibe — mas não é o
 * que decide o prêmio.
 */
export interface PosicaoMeta {
  studentId: string;
  /** Carimbo do servidor no instante em que o acumulado cruzou a meta. */
  atingidoEm: string;
  kmNoMomento: number;
  /** Se qualquer atividade que compôs o total ficou marcada. */
  temPendencia: boolean;
}

export function ordenarPorMeta(posicoes: PosicaoMeta[]): PosicaoMeta[] {
  return [...posicoes].sort((a, b) => ms(a.atingidoEm) - ms(b.atingidoEm));
}

/**
 * Desafio de melhor pace. Exige distância mínima, senão vence quem correr
 * 200 metros em velocidade de tiro — que não é o espírito da disputa.
 */
export function elegivelParaPace(a: AtividadeExterna): boolean {
  return a.distanciaKm >= LIMITES.distanciaMinParaPaceKm;
}
