import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Award, CheckCircle2, Loader2, RotateCcw, X, XCircle } from "lucide-react";

import {
  carregarGabarito,
  carregarProva,
  submeterProva,
  type LinhaDoGabarito,
  type PerguntaDaProva,
  type Prova,
  type ResultadoDaProva,
  type Tentativa,
} from "@/lib/course-exams";

/**
 * Prova do aluno.
 *
 * Três telas numa só, na ordem em que a pessoa passa por elas: responder,
 * resultado, gabarito comentado.
 *
 * O gabarito só é buscado DEPOIS de entregar — e o banco só o devolve se
 * existir tentativa registrada. Não é uma escolha de interface: é a garantia
 * de que ninguém lê a resposta antes de responder, nem pelo inspetor.
 */
export function CourseExamSheet({
  prova,
  onClose,
  onEntregue,
}: {
  prova: Prova;
  onClose: () => void;
  /** Avisa o curso para recarregar tentativas e reavaliar o certificado. */
  onEntregue: (r: ResultadoDaProva) => void;
}) {
  const [perguntas, setPerguntas] = useState<PerguntaDaProva[]>([]);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDaProva | null>(null);
  const [gabarito, setGabarito] = useState<LinhaDoGabarito[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const qs = await carregarProva(prova.id);
        if (vivo) setPerguntas(qs);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível abrir a prova.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [prova.id]);

  const respondidas = Object.keys(respostas).length;
  const todas = perguntas.length > 0 && respondidas === perguntas.length;

  const entregar = async () => {
    setEnviando(true);
    try {
      const r = await submeterProva(
        prova.id,
        Object.entries(respostas).map(([question_id, option_id]) => ({ question_id, option_id })),
      );
      setResultado(r);
      onEntregue(r);
      // O gabarito só existe depois da tentativa; buscar antes daria vazio.
      try { setGabarito(await carregarGabarito(prova.id)); } catch { /* segue sem revisão */ }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível entregar a prova.");
    } finally {
      setEnviando(false);
    }
  };

  const refazer = () => {
    setResultado(null);
    setGabarito(null);
    setRespostas({});
  };

  return (
    <div
      className="modal-safe fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto overscroll-contain bg-background/90 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
    >
      <div
        className="w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-4"
        role="dialog"
        aria-modal="true"
        aria-label={prova.title}
      >
        <div className="modal-head -mx-4 -mt-4 mb-3 flex items-start justify-between gap-3 px-4 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground">{prova.title}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {resultado
                ? "Resultado"
                : `${perguntas.length} ${perguntas.length === 1 ? "pergunta" : "perguntas"} · aprovação com ${prova.passingScore}%`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="shrink-0">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : erro ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {erro}
          </p>
        ) : resultado ? (
          <ResultadoDaTentativa
            resultado={resultado}
            passingScore={prova.passingScore}
            gabarito={gabarito}
            respostas={respostas}
            onRefazer={refazer}
            onClose={onClose}
          />
        ) : perguntas.length === 0 ? (
          <p className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            Esta prova ainda não tem perguntas.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {perguntas.map((q, i) => (
                <fieldset key={q.id} className="rounded-xl border border-border bg-muted p-3">
                  <legend className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Pergunta {i + 1}
                  </legend>
                  <p className="mb-2 text-sm font-semibold leading-snug text-foreground">{q.prompt}</p>
                  <div className="flex flex-col gap-1.5">
                    {q.alternativas.map((a) => {
                      const marcada = respostas[q.id] === a.id;
                      return (
                        <label
                          key={a.id}
                          className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                            marcada ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground"
                          }`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            checked={marcada}
                            onChange={() => setRespostas((r) => ({ ...r, [q.id]: a.id }))}
                            className="mt-0.5"
                          />
                          <span>{a.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>

            <div className="modal-foot -mx-4 -mb-4 mt-4 flex items-center gap-2 px-4 pb-4 pt-3">
              <span className="flex-1 text-[11px] tabular-nums text-muted-foreground">
                {respondidas} de {perguntas.length} respondidas
              </span>
              <button
                type="button"
                onClick={() => void entregar()}
                disabled={!todas || enviando}
                title={!todas ? "Responda todas as perguntas antes de entregar." : undefined}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Entregar prova
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Resultado e revisão.
 *
 * Mostra o gabarito comentado logo abaixo da nota, em vez de só dizer
 * "reprovado". Prova que não explica o erro não ensina — e o aluno refaz
 * errando de novo.
 */
function ResultadoDaTentativa({
  resultado,
  passingScore,
  gabarito,
  respostas,
  onRefazer,
  onClose,
}: {
  resultado: ResultadoDaProva;
  passingScore: number;
  gabarito: LinhaDoGabarito[] | null;
  respostas: Record<string, string>;
  onRefazer: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className={`rounded-2xl border p-5 text-center ${
          resultado.passed
            ? "border-emerald-500/30 bg-emerald-500/10"
            : "border-amber-500/30 bg-amber-500/10"
        }`}
      >
        {resultado.passed ? (
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
        ) : (
          <XCircle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
        )}
        <p className={`text-2xl font-bold tabular-nums ${resultado.passed ? "text-emerald-500" : "text-amber-500"}`}>
          {resultado.score}%
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {resultado.acertos} de {resultado.total} certas · aprovação com {passingScore}%
        </p>
        <p className={`mt-2 text-sm font-bold ${resultado.passed ? "text-emerald-500" : "text-amber-500"}`}>
          {resultado.passed ? "Aprovado" : "Ainda não foi dessa vez"}
        </p>
      </div>

      {gabarito && gabarito.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          <h3 className="text-sm font-bold text-foreground">Revisão</h3>
          {gabarito.map((q, i) => {
            const minha = respostas[q.perguntaId];
            const acertei = q.alternativas.some((a) => a.id === minha && a.correta);
            return (
              <div key={q.perguntaId} className="rounded-xl border border-border bg-muted p-3">
                <div className="mb-1.5 flex items-start gap-2">
                  {acertei ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <p className="text-sm font-semibold leading-snug text-foreground">
                    {i + 1}. {q.prompt}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {q.alternativas.map((a) => (
                    <p
                      key={a.id}
                      className={`rounded-lg px-2.5 py-1.5 text-xs ${
                        a.correta
                          ? "bg-emerald-500/15 font-semibold text-emerald-500"
                          : a.id === minha
                            ? "bg-destructive/15 text-destructive line-through"
                            : "text-muted-foreground"
                      }`}
                    >
                      {a.label}
                      {a.correta && " ✓"}
                    </p>
                  ))}
                </div>
                {q.explicacao && (
                  <p className="mt-2 rounded-lg bg-card p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    {q.explicacao}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="modal-foot -mx-4 -mb-4 mt-4 flex gap-2 px-4 pb-4 pt-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl bg-muted px-4 py-3 text-sm font-bold text-foreground"
        >
          Fechar
        </button>
        {!resultado.passed && (
          <button
            type="button"
            onClick={onRefazer}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
          >
            <RotateCcw className="h-4 w-4" />
            Tentar de novo
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Cartão da prova na página do curso.
 *
 * Diz o estado em uma linha: nunca tentada, aprovada com quanto, ou reprovada
 * com quantas tentativas ainda restam. Sem isso o aluno abre a prova só para
 * descobrir que já passou.
 */
export function CourseExamCard({
  prova,
  tentativas,
  onAbrir,
}: {
  prova: Prova;
  tentativas: Tentativa[];
  onAbrir: () => void;
}) {
  const minhas = tentativas.filter((t) => t.examId === prova.id);
  const melhor = minhas.reduce<Tentativa | null>((a, t) => (!a || t.score > a.score ? t : a), null);
  const aprovado = minhas.some((t) => t.passed);
  const restantes = prova.maxAttempts == null ? null : Math.max(0, prova.maxAttempts - minhas.length);
  const semTentativas = restantes === 0 && !aprovado;

  return (
    <button
      type="button"
      onClick={onAbrir}
      disabled={semTentativas}
      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed ${
        aprovado
          ? "border-emerald-500/30 bg-emerald-500/10"
          : "border-primary/30 bg-primary/5 hover:bg-primary/10"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          aprovado ? "bg-emerald-500/20 text-emerald-500" : "bg-primary/20 text-primary"
        }`}
      >
        <Award className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-foreground">{prova.title}</span>
        <span className="block text-[11px] text-muted-foreground">
          {aprovado
            ? `Aprovado com ${melhor?.score ?? 0}%`
            : minhas.length === 0
              ? `Aprovação com ${prova.passingScore}%`
              : semTentativas
                ? `Sem tentativas restantes · melhor nota ${melhor?.score ?? 0}%`
                : `Melhor nota ${melhor?.score ?? 0}%${restantes != null ? ` · ${restantes} ${restantes === 1 ? "tentativa" : "tentativas"} restantes` : ""}`}
        </span>
      </span>
      {!semTentativas && (
        <span className="shrink-0 text-[11px] font-bold text-primary">
          {aprovado ? "Refazer" : minhas.length ? "Tentar de novo" : "Fazer prova"}
        </span>
      )}
    </button>
  );
}
