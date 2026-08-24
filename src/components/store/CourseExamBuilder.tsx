import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";

import {
  atualizarAlternativa,
  atualizarPergunta,
  atualizarProva,
  criarPergunta,
  criarProva,
  excluirPergunta,
  excluirProva,
  listarPerguntas,
  listarProvas,
  marcarCorreta,
  type PerguntaAdmin,
  type Prova,
} from "@/lib/course-exams";

/**
 * Construtor de provas do criador.
 *
 * Uma prova por módulo, mais uma prova final do curso — que é o formato que o
 * aluno já reconhece de outras plataformas. O banco garante isso com índice
 * único: não dá para criar duas provas na mesma porta e ficar sem saber qual
 * vale.
 *
 * A alternativa correta é um rádio, não uma caixa de seleção. Com caixa o
 * criador marcaria duas por engano e a correção contaria acerto para as duas —
 * o aluno passaria escolhendo qualquer uma delas.
 */
export function CourseExamBuilder({
  digitalProductId,
  modulos,
}: {
  digitalProductId: string;
  modulos: Array<{ id: string; title: string }>;
}) {
  const [provas, setProvas] = useState<Prova[]>([]);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [perguntas, setPerguntas] = useState<PerguntaAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setProvas(await listarProvas(digitalProductId));
    setCarregando(false);
  }, [digitalProductId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  useEffect(() => {
    if (!abertaId) { setPerguntas([]); return; }
    let vivo = true;
    void listarPerguntas(abertaId).then((qs) => { if (vivo) setPerguntas(qs); });
    return () => { vivo = false; };
  }, [abertaId]);

  const agir = async (chave: string, fn: () => Promise<void>, sucesso?: string) => {
    setOcupado(chave);
    try {
      await fn();
      await recarregar();
      if (abertaId) setPerguntas(await listarPerguntas(abertaId));
      if (sucesso) toast.success(sucesso);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setOcupado(null);
    }
  };

  const final = provas.find((p) => p.moduleId === null) ?? null;
  const semProva = modulos.filter((m) => !provas.some((p) => p.moduleId === m.id));

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold text-foreground">Provas</h2>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
        Uma prova por módulo e uma prova final. A final é o que libera o
        certificado — sem ela, basta concluir as aulas.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {!final && (
          <button
            type="button"
            disabled={ocupado !== null}
            onClick={() => void agir("nova-final",
              async () => { await criarProva(digitalProductId, "Prova final", null); },
              "Prova final criada.")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent disabled:opacity-60"
          >
            {ocupado === "nova-final" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Prova final
          </button>
        )}
        {semProva.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={ocupado !== null}
            onClick={() => void agir("nova-" + m.id,
              async () => { await criarProva(digitalProductId, `Prova · ${m.title}`, m.id); },
              "Prova criada.")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            {m.title}
          </button>
        ))}
      </div>

      {provas.length === 0 ? (
        <p className="mt-3 rounded-xl bg-muted p-4 text-center text-[11px] text-muted-foreground">
          Nenhuma prova ainda. O curso funciona sem prova — ela é opcional.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {provas.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-muted p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  defaultValue={p.title}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== p.title) void agir("t-" + p.id, () => atualizarProva(p.id, { title: v }));
                  }}
                  className="min-w-0 flex-1 bg-transparent text-xs font-bold text-foreground outline-none"
                />

                <label className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                  Aprovação
                  <input
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={p.passingScore}
                    onBlur={(e) => void agir("s-" + p.id, () =>
                      atualizarProva(p.id, { passingScore: Math.min(100, Math.max(1, Number(e.target.value) || 70)) }))}
                    className="w-14 rounded border border-border bg-card px-1.5 py-0.5 text-foreground"
                  />
                  %
                </label>

                <label className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                  Tentativas
                  <input
                    type="number"
                    min={1}
                    placeholder="∞"
                    defaultValue={p.maxAttempts ?? ""}
                    onBlur={(e) => void agir("a-" + p.id, () =>
                      atualizarProva(p.id, { maxAttempts: e.target.value ? Number(e.target.value) : null }))}
                    className="w-14 rounded border border-border bg-card px-1.5 py-0.5 text-foreground"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setAbertaId(abertaId === p.id ? null : p.id)}
                  className="shrink-0 rounded-lg border border-border px-2 py-1.5 text-[11px] font-semibold text-foreground"
                >
                  {abertaId === p.id ? "Fechar" : "Perguntas"}
                </button>

                <button
                  type="button"
                  disabled={ocupado !== null}
                  onClick={() => {
                    if (!window.confirm(`Excluir "${p.title}"? As tentativas dos alunos vão junto.`)) return;
                    void agir("del-" + p.id, () => excluirProva(p.id), "Prova excluída.");
                  }}
                  aria-label="Excluir prova"
                  className="shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>

              {abertaId === p.id && (
                <ListaDePerguntas
                  perguntas={perguntas}
                  examId={p.id}
                  ocupado={ocupado}
                  agir={agir}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ListaDePerguntas({
  perguntas,
  examId,
  ocupado,
  agir,
}: {
  perguntas: PerguntaAdmin[];
  examId: string;
  ocupado: string | null;
  agir: (chave: string, fn: () => Promise<void>, sucesso?: string) => Promise<void>;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      {perguntas.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Prova sem pergunta não corrige — o aluno recebe um aviso ao tentar entregar.
        </p>
      )}

      {perguntas.map((q, i) => (
        <div key={q.id} className="rounded-lg bg-card p-2.5">
          <div className="flex items-start gap-2">
            <span className="mt-1.5 shrink-0 text-[10px] font-bold text-muted-foreground">{i + 1}.</span>
            <textarea
              defaultValue={q.prompt}
              rows={2}
              placeholder="Escreva a pergunta"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== q.prompt) void agir("q-" + q.id, () => atualizarPergunta(q.id, { prompt: v }));
              }}
              className="min-w-0 flex-1 rounded border border-border bg-muted px-2 py-1.5 text-xs text-foreground"
            />
            <button
              type="button"
              disabled={ocupado !== null}
              onClick={() => {
                if (!window.confirm("Excluir esta pergunta?")) return;
                void agir("dq-" + q.id, () => excluirPergunta(q.id));
              }}
              aria-label="Excluir pergunta"
              className="mt-1.5 shrink-0"
            >
              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
            </button>
          </div>

          <div className="mt-2 flex flex-col gap-1 pl-5">
            {q.alternativas.map((a) => (
              <label key={a.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={"correta-" + q.id}
                  checked={a.correta}
                  onChange={() => void agir("c-" + a.id, () => marcarCorreta(q.id, a.id))}
                  title="Marcar como a alternativa correta"
                  className="shrink-0"
                />
                <input
                  defaultValue={a.label}
                  placeholder="Alternativa"
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== a.label) void agir("o-" + a.id, () => atualizarAlternativa(a.id, v));
                  }}
                  className={`min-w-0 flex-1 rounded border px-2 py-1 text-[11px] ${
                    a.correta
                      ? "border-emerald-500/40 bg-emerald-500/10 text-foreground"
                      : "border-border bg-muted text-foreground"
                  }`}
                />
                {a.correta && <Check className="h-3 w-3 shrink-0 text-emerald-500" />}
              </label>
            ))}
          </div>

          <textarea
            defaultValue={q.explanation ?? ""}
            rows={2}
            placeholder="Explicação mostrada depois de responder (opcional)"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (q.explanation ?? "")) {
                void agir("e-" + q.id, () => atualizarPergunta(q.id, { explanation: v || null }));
              }
            }}
            className="mt-2 w-full rounded border border-border bg-muted px-2 py-1.5 text-[11px] text-muted-foreground"
          />
        </div>
      ))}

      <button
        type="button"
        disabled={ocupado !== null}
        onClick={() => void agir("nq-" + examId,
          () => criarPergunta(examId, "", perguntas.length + 1))}
        className="inline-flex items-center gap-1.5 self-start rounded-lg border border-dashed border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-accent disabled:opacity-60"
      >
        {ocupado === "nq-" + examId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Nova pergunta
      </button>
    </div>
  );
}
