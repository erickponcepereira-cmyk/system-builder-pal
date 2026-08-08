/**
 * Contrato de ingestão de atividades externas (corrida).
 *
 * ESTE ARQUIVO É A FRONTEIRA entre a casca nativa (Capacitor) e o backend.
 * O chat do mobile implementa a leitura do Health Connect / HealthKit e
 * envia exatamente este formato. Mudou aqui, mudou lá — alinhar antes.
 *
 * POR QUE EXISTE
 * O Nike Run (e Strava, Garmin, Samsung Health...) grava a corrida no
 * Health Connect (Android) ou HealthKit (iOS) sozinho, sem a FitMind estar
 * aberta. A FitMind só LÊ o que já está lá. Isso significa que não é
 * preciso rastreamento em segundo plano: sincroniza quando o app abre e a
 * corrida entra com a data/hora reais dela.
 *
 * O QUE ESTE MÓDULO NÃO FAZ
 * Nada aqui protege contra fraude. São tipos e listas. A validação real
 * roda no servidor (ver corridas-validacao.ts, consumido por uma
 * server function). Regra de premiação nunca é decidida no cliente.
 */

/** Origem da atividade, como reportada pelo Health Connect / HealthKit. */
export interface OrigemAtividade {
  /** packageName no Android, bundle id no iOS. Ex: "com.nike.plusgps" */
  appId: string;
  /** Nome legível, para exibir atribuição na UI (exigido pelo Health Connect). */
  appNome: string | null;
  /** Modelo do aparelho/relógio, quando informado. */
  dispositivo: string | null;
  /**
   * Como o registro foi criado, segundo a plataforma.
   * ATENÇÃO: a documentação é explícita que isto é o melhor esforço da
   * plataforma, não garantia. Serve para pontuar risco, não para provar.
   */
  metodo: "gravado_ao_vivo" | "manual" | "desconhecido";
}

/** Uma atividade lida da plataforma de saúde. */
export interface AtividadeExterna {
  /**
   * Id do registro NA PLATAFORMA de origem. Junto com `origem.appId`
   * forma a chave de idempotência: reenviar a mesma atividade não pode
   * gerar duas pontuações.
   */
  idExterno: string;
  tipo: "corrida" | "caminhada" | "trilha" | "outro";
  /** ISO 8601 com offset. Quando a corrida COMEÇOU de verdade. */
  inicioEm: string;
  /** ISO 8601 com offset. Quando terminou. */
  fimEm: string;
  distanciaKm: number;
  duracaoMin: number;
  /** Opcionais — nem toda fonte preenche. */
  calorias: number | null;
  elevacaoM: number | null;
  fcMedia: number | null;
  origem: OrigemAtividade;
}

/** Payload que a casca nativa envia ao backend. */
export interface LoteAtividades {
  /** Plataforma que originou a leitura. */
  plataforma: "health_connect" | "healthkit";
  /** Versão do app nativo, para diagnosticar problemas de campo. */
  appVersao: string;
  atividades: AtividadeExterna[];
}

/**
 * Apps aceitos como fonte de corrida que pontua.
 *
 * Filtrar por origem é a primeira barreira: qualquer app consegue escrever
 * no Health Connect, inclusive apps feitos para injetar dados falsos. Aqui
 * só entra quem grava corrida de verdade com GPS próprio.
 *
 * A prioridade resolve duplicata: se a mesma corrida chega pelo Garmin e
 * pelo Nike, fica a de MAIOR prioridade e a outra é descartada.
 * Relógio/fabricante ganha de app de celular, que ganha de agregador.
 */
export const FONTES_ACEITAS: Record<string, { nome: string; prioridade: number }> = {
  // relógios e fabricantes — dado vem do próprio dispositivo
  "com.garmin.android.apps.connectmobile": { nome: "Garmin Connect", prioridade: 100 },
  "com.garmin.connect": { nome: "Garmin Connect", prioridade: 100 },
  "com.polar.polarflow": { nome: "Polar Flow", prioridade: 100 },
  "com.coros.track": { nome: "Coros", prioridade: 100 },
  "com.suunto.movescount.android": { nome: "Suunto", prioridade: 100 },
  "com.sec.android.app.shealth": { nome: "Samsung Health", prioridade: 90 },
  "com.google.android.apps.fitness": { nome: "Google Fit", prioridade: 80 },

  // apps de corrida no celular
  "com.nike.plusgps": { nome: "Nike Run Club", prioridade: 70 },
  "com.strava": { nome: "Strava", prioridade: 70 },
  "com.runtastic.android": { nome: "Adidas Running", prioridade: 70 },
  "com.fitnesskeeper.runkeeper.pro": { nome: "Runkeeper", prioridade: 70 },
  "je.fit.runner": { nome: "Runna", prioridade: 60 },

  // iOS — bundle ids
  "com.nike.nikeplus-gps": { nome: "Nike Run Club", prioridade: 70 },
  "com.strava.stravaride": { nome: "Strava", prioridade: 70 },
  "com.apple.health": { nome: "Apple Saúde", prioridade: 50 },
  "com.apple.Fitness": { nome: "Apple Fitness", prioridade: 90 },
};

/** Tipos que contam como corrida para desafio de quilometragem. */
export const TIPOS_QUE_PONTUAM: AtividadeExterna["tipo"][] = ["corrida", "trilha"];

/**
 * Limites de plausibilidade. Ajustáveis sem mexer em lógica.
 *
 * Referência de velocidade (km/h): recreativo 8–12, avançado 14–17,
 * elite de 5 km beira 24. Acima de 25 km/h por mais de 1 km não é corrida
 * humana — é bicicleta, carro ou dado forjado.
 */
export const LIMITES = {
  /** Acima disto, rejeita: não é fisicamente plausível correndo. */
  velocidadeMaxKmh: 25,
  /** Acima disto, aceita mas marca para conferência. */
  velocidadeSuspeitaKmh: 20,
  /** Abaixo disto vira caminhada, não corrida. */
  velocidadeMinKmh: 3,
  /** Corrida de 30 segundos não é corrida. */
  duracaoMinMin: 3,
  /** Distância mínima para valer. */
  distanciaMinKm: 0.3,
  /** Soma diária acima disto é marcada — maratona é 42,2. */
  distanciaDiariaSuspeitaKm: 45,
  /** Teto diário que efetivamente pontua. Protege o ranking de outlier
   *  e desestimula alguém se machucar tentando virar o jogo num dia só. */
  distanciaDiariaContadaKm: 30,
  /** Tolerância entre distância/duração declaradas e o par derivado. */
  toleranciaCoerencia: 0.05,
  /** Sobreposição temporal a partir da qual duas atividades são a mesma. */
  sobreposicaoDuplicataPct: 0.5,
  /** Desafio de pace exige distância mínima, senão vence quem correr 200 m. */
  distanciaMinParaPaceKm: 3,
} as const;

/** Velocidade média em km/h. */
export function velocidadeKmh(distanciaKm: number, duracaoMin: number): number {
  if (duracaoMin <= 0) return 0;
  return distanciaKm / (duracaoMin / 60);
}

/** Pace em minutos por km. */
export function paceMinKm(distanciaKm: number, duracaoMin: number): number {
  if (distanciaKm <= 0) return 0;
  return duracaoMin / distanciaKm;
}

/** Formata pace para exibição: 5.5 -> "5:30/km". */
export function formatarPace(paceMinutos: number): string {
  if (!Number.isFinite(paceMinutos) || paceMinutos <= 0) return "—";
  const min = Math.floor(paceMinutos);
  const seg = Math.round((paceMinutos - min) * 60);
  const segAjustado = seg === 60 ? 0 : seg;
  const minAjustado = seg === 60 ? min + 1 : min;
  return `${minAjustado}:${String(segAjustado).padStart(2, "0")}/km`;
}
