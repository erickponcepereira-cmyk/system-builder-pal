import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Phone } from "lucide-react";
import {
  obterConstancia, obterFaltas,
  type Constancia as DadosConstancia, type Faltas as DadosFaltas,
  type LinhaConstancia, type LinhaFalta, type PadraoDoAluno,
  type RegimeTurma, type SituacaoConstancia,
} from "@/lib/academia-frequencia.functions";
import { formatDateOnlyBR, parseDateOnly } from "@/lib/date-only";
import {
  BOTAO_TEXTO, CAMPO, Bloco, Cartao, EYEBROW, NOTA, Pilula, ROTULO, Selo, type Tom,
} from "@/components/partner/VisualAcademia";

/**
 * Constância e faltas — o "quem pode estar desanimado" que o dono pediu.
 *
 * As duas telas leem `academia_constancia` e `academia_faltas`, que existem
 * desde 29/08 e nunca tinham sido consumidas por nada. Nenhuma régua é
 * recalculada aqui: a faixa, a ordem e a contagem de falta saem do banco
 * prontas, inclusive `situacao_ordem`, que existe justamente para a tela
 * ordenar pelo pior sem codificar a régua de novo.
 */

const FAIXAS: Record<SituacaoConstancia, { label: string; tom: Tom; explica: string }> = {
  sumiu: {
    label: "Sumiu", tom: "critico",
    explica: "Sem passar na catraca há tempo demais para ser esquecimento.",
  },
  sumindo: {
    label: "Sumindo", tom: "atencao",
    explica: "Parou de aparecer no ritmo dela, e já fechou semana abaixo da meta.",
  },
  caindo: {
    label: "Caindo", tom: "atencao",
    explica: "Duas semanas seguidas abaixo da meta. Uma é gripe; duas é tendência.",
  },
  novo: {
    label: "Sem histórico", tom: "neutro",
    explica: "O banco ainda não tem semanas suficientes para julgar esta pessoa.",
  },
  constante: {
    label: "Constante", tom: "ok",
    explica: "Batendo a meta e aparecendo dentro do ritmo dela.",
  },
};

const chave = (l: { credencial_id: string | null; student_id: string | null }) =>
  l.credencial_id ?? l.student_id ?? "";

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

const numero = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

/** "há 4 dias", "hoje", "ontem" — a recepção lê isso mais rápido que uma data. */
function haQuantoTempo(dias: number) {
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

/**
 * O aviso que impede a tela de mentir na estreia.
 *
 * Com poucos dias de catraca TODO MUNDO cai em 'novo', e uma lista de 400
 * pessoas marcadas "sem histórico" se lê como defeito. É o contrário: é a
 * régua se recusando a acusar quem ela ainda não mediu.
 */
function AvisoDeHistorico({ dias, desde }: { dias: number; desde: string | null }) {
  if (!desde) {
    return (
      <Bloco tom="neutro">
        <p className={NOTA}>
          Nenhuma passagem registrada ainda. Constância e falta começam a existir
          quando a catraca — ou o QR — registrar a primeira entrada.
        </p>
      </Bloco>
    );
  }
  if (dias >= 14) return null;
  return (
    <Bloco tom="atencao">
      <p className="text-[12px] font-bold text-aca-ink">
        A catraca tem {dias} dia(s) de histórico, desde {formatDateOnlyBR(desde)}
      </p>
      <p className={`mt-1 ${NOTA}`}>
        A régua precisa de <strong className="font-semibold text-aca-ink">duas semanas
        completas</strong> por pessoa antes de dizer que alguém está sumindo. Até lá quase
        todo mundo aparece como “sem histórico”, e isso é o certo — acusar falta num
        registro de {dias} dia(s) seria inventar ausência.
      </p>
    </Bloco>
  );
}

function LinhaDePessoa({ l, padrao }: { l: LinhaConstancia; padrao?: PadraoDoAluno }) {
  const faixa = FAIXAS[l.situacao] ?? FAIXAS.novo;
  const porSemana = numero(l.treinos_por_semana);
  const hora = hhmm(padrao?.hora_media ?? null);

  return (
    <Bloco tom={faixa.tom}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-aca-ink">{l.nome}</p>

          <p className={`mt-0.5 tabular-nums ${NOTA}`}>
            {l.meta_semanal
              ? `${porSemana.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} de ${l.meta_semanal} treinos por semana`
              : `${porSemana.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} treinos por semana · sem meta no plano`}
            {l.semanas_abaixo > 0 && ` · ${l.semanas_abaixo} semana(s) abaixo`}
          </p>

          <p className={`mt-0.5 tabular-nums ${NOTA}`}>
            {l.ultimo_treino
              ? `Último treino ${haQuantoTempo(l.dias_sem_treinar)}, em ${formatDateOnlyBR(l.ultimo_treino)}`
              : "Nunca passou na catraca"}
          </p>

          {/* O hábito aprendido. É ele que responde "ela mudou de horário?" —
              a pergunta que o dono fez com todas as letras. */}
          {(l.turma || hora || padrao?.dias_rotulo) && (
            <p className={`mt-0.5 ${NOTA}`}>
              Costuma vir
              {padrao?.dias_rotulo ? ` ${padrao.dias_rotulo}` : ""}
              {hora ? ` por volta das ${hora}` : ""}
              {l.turma ? ` · ${l.turma}` : ""}
            </p>
          )}

          {l.mudou_horario && (
            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-aca-muted">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-aca-atencao" />
              Mudou de horário{padrao?.turma_anterior ? ` — antes era ${padrao.turma_anterior}` : ""}
            </p>
          )}

          {l.telefone && (
            <p className="mt-1 flex items-center gap-1 text-[11px] tabular-nums text-aca-fraco">
              <Phone className="h-3 w-3" /> {l.telefone}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <Pilula tom={faixa.tom}>{faixa.label}</Pilula>
          {l.aderencia !== null && <Selo>{l.aderencia}%</Selo>}
        </div>
      </div>
    </Bloco>
  );
}

export function Constancia({ partnerId }: { partnerId: string }) {
  const obter = useServerFn(obterConstancia);
  const [dados, setDados] = useState<DadosConstancia | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [semanas, setSemanas] = useState(8);
  const [faixa, setFaixa] = useState<SituacaoConstancia | null>(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    obter({ data: { partnerId, semanas } })
      .then((r) => { if (vivo) setDados(r as DadosConstancia); })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Não deu para carregar a constância"))
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, semanas]);

  const porChave = useMemo(() => {
    const m = new Map<string, PadraoDoAluno>();
    for (const p of dados?.padroes ?? []) m.set(chave(p), p);
    return m;
  }, [dados]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of dados?.linhas ?? []) c[l.situacao] = (c[l.situacao] ?? 0) + 1;
    return c;
  }, [dados]);

  const visiveis = useMemo(
    () => (faixa ? (dados?.linhas ?? []).filter((l) => l.situacao === faixa) : dados?.linhas ?? []),
    [dados, faixa],
  );

  if (!dados) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-aca-acao" />;

  return (
    <div className="space-y-3">
      <AvisoDeHistorico dias={dados.historico.dias} desde={dados.historico.desde} />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className={ROTULO}>Medir as últimas</span>
          <select
            value={semanas}
            onChange={(e) => setSemanas(Number(e.target.value))}
            className={CAMPO}
          >
            {[4, 8, 12, 26, 52].map((s) => (
              <option key={s} value={s}>{s} semanas</option>
            ))}
          </select>
        </label>
        {faixa && (
          <button type="button" onClick={() => setFaixa(null)} className={`mb-1 ${BOTAO_TEXTO}`}>
            ver todos
          </button>
        )}
      </div>

      {/* Cada número esconde gente, então cada número é um botão — é daqui que
          se chega na lista de quem ligar hoje. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {(["sumiu", "sumindo", "caindo", "constante", "novo"] as SituacaoConstancia[]).map((s) => (
          <Cartao
            key={s}
            rot={FAIXAS[s].label}
            valor={String(contagem[s] ?? 0)}
            nota={FAIXAS[s].explica}
            tom={FAIXAS[s].tom}
            acao={faixa === s ? "Mostrando" : "Ver só estes"}
            aoClicar={() => setFaixa(faixa === s ? null : s)}
          />
        ))}
      </div>

      {carregando ? (
        <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-aca-acao" />
      ) : visiveis.length === 0 ? (
        <p className={`py-8 text-center ${NOTA}`}>
          {faixa ? `Ninguém nesta faixa.` : "Ninguém com mensalidade ativa nem treino registrado."}
        </p>
      ) : (
        <div className="space-y-2">
          {visiveis.map((l) => (
            <LinhaDePessoa key={chave(l) || l.nome} l={l} padrao={porChave.get(chave(l))} />
          ))}
        </div>
      )}
    </div>
  );
}

const REGIME_EXPLICA: Record<RegimeTurma, string> = {
  reserva:
    "Aqui falta é vaga guardada que ninguém ocupou: a pessoa reservou a aula e não apareceu. Quem cancelou a tempo não falta.",
  marcado:
    "Aqui falta é aula em que a pessoa está matriculada e não passou na catraca. A aula só vira falta depois de terminar.",
  livre:
    "Aqui ninguém tem dia fixo, então falta é semana completa abaixo da meta do plano — nunca “não veio na terça”. Semana com a academia fechada tem a meta reduzida.",
};

/** Segunda a domingo da semana que começa em `iso`. */
function rotuloSemana(iso: string) {
  const inicio = parseDateOnly(iso);
  if (!inicio) return iso;
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 6);
  const br = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `Semana de ${br(inicio)} a ${br(fim)}`;
}

function rotuloDia(iso: string) {
  const d = parseDateOnly(iso);
  if (!d) return iso;
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
}

export function Faltas({ partnerId }: { partnerId: string }) {
  const obter = useServerFn(obterFaltas);
  const [dados, setDados] = useState<DadosFaltas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    obter({ data: { partnerId, de: de || null, ate: ate || null } })
      .then((r) => { if (vivo) setDados(r as DadosFaltas); })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Não deu para carregar as faltas"))
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, de, ate]);

  /* Agrupado pela referência que o banco devolveu: no livre ela é a segunda-feira
     da semana, nos outros dois é o dia da aula. Um agrupamento serve aos três. */
  const grupos = useMemo(() => {
    const m = new Map<string, LinhaFalta[]>();
    for (const l of dados?.linhas ?? []) {
      const atual = m.get(l.referencia);
      if (atual) atual.push(l); else m.set(l.referencia, [l]);
    }
    return [...m.entries()];
  }, [dados]);

  const total = useMemo(
    () => (dados?.linhas ?? []).reduce((s, l) => s + l.faltas, 0),
    [dados],
  );

  if (!dados) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-aca-acao" />;
  const porSemana = dados.regime === "livre";

  return (
    <div className="space-y-3">
      <Bloco>
        <p className={EYEBROW}>Como esta academia conta falta</p>
        <p className={`mt-1 ${NOTA}`}>{REGIME_EXPLICA[dados.regime]}</p>
      </Bloco>

      <AvisoDeHistorico dias={dados.historico.dias} desde={dados.historico.desde} />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className={ROTULO}>De</span>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={ROTULO}>Até</span>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={CAMPO} />
        </label>
        {(de || ate) && (
          <button type="button" onClick={() => { setDe(""); setAte(""); }} className={`mb-1 ${BOTAO_TEXTO}`}>
            limpar
          </button>
        )}
        <p className={`mb-1.5 ${NOTA}`}>Em branco, são as últimas 4 semanas.</p>
      </div>

      {carregando ? (
        <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-aca-acao" />
      ) : grupos.length === 0 ? (
        <p className={`py-8 text-center ${NOTA}`}>
          {dados.historico.desde
            ? "Nenhuma falta no período. Ninguém ficou abaixo do combinado."
            : "Sem registro de entrada ainda — não há como haver falta."}
        </p>
      ) : (
        <>
          <p className={NOTA}>
            <strong className="font-semibold text-aca-ink tabular-nums">{total}</strong> falta(s)
            em {grupos.length} {porSemana ? "semana(s)" : "dia(s)"}.
          </p>

          {grupos.map(([referencia, linhas]) => (
            <div key={referencia} className="space-y-1.5">
              <p className={EYEBROW}>{porSemana ? rotuloSemana(referencia) : rotuloDia(referencia)}</p>
              {linhas.map((l, i) => (
                <Bloco key={`${chave(l)}-${l.turma_id ?? i}`} tom="atencao">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-aca-ink">{l.nome}</p>
                      <p className={`mt-0.5 tabular-nums ${NOTA}`}>
                        {porSemana
                          ? `Fez ${l.treinos ?? 0} de ${l.meta_semanal ?? 0} treinos combinados`
                          : `${l.turma ?? "Aula"}${l.horario ? ` · ${hhmm(l.horario)}` : ""}`}
                      </p>
                      {l.telefone && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] tabular-nums text-aca-fraco">
                          <Phone className="h-3 w-3" /> {l.telefone}
                        </p>
                      )}
                    </div>
                    <Selo>
                      {l.faltas} {porSemana ? "a menos" : "falta"}
                    </Selo>
                  </div>
                </Bloco>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
