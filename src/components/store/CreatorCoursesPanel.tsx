import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

import {
  atualizarAula,
  criarAula,
  criarModulo,
  excluirAula,
  excluirModulo,
  listarAulas,
  listarCursosGeridos,
  listarModulos,
  progressoDaTurma,
  subirArquivoDaAula,
  type AulaAdmin,
  type CursoAdmin,
  type ModuloAdmin,
  type ProgressoTurma,
} from "@/lib/course-admin";

const REGRAS: Array<{ id: string; label: string; ajuda: string }> = [
  { id: "none", label: "Liberada", ajuda: "Disponível assim que a pessoa entra" },
  { id: "sequential", label: "Sequencial", ajuda: "Abre ao concluir a aula anterior" },
  { id: "drip", label: "Gotejamento", ajuda: "Abre X dias após a compra" },
  { id: "date", label: "Data fixa", ajuda: "Abre numa data marcada" },
];

/**
 * Painel do criador — parceiro e profissional.
 *
 * Toda escrita passa pela RLS (`can_manage_digital_product`). Não repito a
 * verificação de dono aqui: seria uma segunda fonte de verdade, fadada a
 * divergir da do banco.
 */
export function CreatorCoursesPanel({ role }: { role: "partner" | "professional" }) {
  const [cursos, setCursos] = useState<CursoAdmin[]>([]);
  const [cursoId, setCursoId] = useState<string | null>(null);
  const [modulos, setModulos] = useState<ModuloAdmin[]>([]);
  const [aulas, setAulas] = useState<AulaAdmin[]>([]);
  const [turma, setTurma] = useState<Map<string, ProgressoTurma>>(new Map());
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const lista = await listarCursosGeridos();
      if (!vivo) return;
      setCursos(lista);
      setCursoId((atual) => atual ?? lista[0]?.id ?? null);
      setLoading(false);
    })();
    return () => { vivo = false; };
  }, []);

  const recarregar = useCallback(async (id: string) => {
    const mods = await listarModulos(id);
    const ls = await listarAulas(mods.map((m) => m.id));
    setModulos(mods);
    setAulas(ls);
    setTurma(await progressoDaTurma(ls.map((l) => l.id)));
    setAbertos((prev) => (prev.size ? prev : new Set(mods.slice(0, 1).map((m) => m.id))));
  }, []);

  useEffect(() => { if (cursoId) void recarregar(cursoId); }, [cursoId, recarregar]);

  const comOcupado = async (chave: string, fn: () => Promise<void>) => {
    setOcupado(chave);
    try {
      await fn();
      if (cursoId) await recarregar(cursoId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setOcupado(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const curso = cursos.find((c) => c.id === cursoId) ?? null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {role === "partner" ? "Parceiro" : "Profissional"}
        </p>
        <h1 className="text-2xl font-bold text-foreground">Cursos</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Monte os módulos e as aulas, e acompanhe quem está estudando.
        </p>
      </header>

      {cursos.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <BookOpen className="mx-auto mb-3 h-7 w-7 text-muted-foreground opacity-50" />
          <p className="text-sm font-bold text-foreground">Você ainda não tem curso</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            O curso é criado como produto digital e vinculado a você pela FitMind. Depois disso
            ele aparece aqui para você montar o conteúdo.
          </p>
        </div>
      ) : (
        <>
          {cursos.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {cursos.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setCursoId(c.id); setAbertos(new Set()); }}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    c.id === cursoId ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {c.title}
                </button>
              ))}
            </div>
          )}

          {curso && (
            <div className="mb-4 rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-bold text-foreground">{curso.title}</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {modulos.length} {modulos.length === 1 ? "módulo" : "módulos"} ·{" "}
                {aulas.length} {aulas.length === 1 ? "aula" : "aulas"}
              </p>
              <button
                type="button"
                disabled={ocupado !== null}
                onClick={() =>
                  comOcupado("novo-modulo", () =>
                    criarModulo(curso.id, "Novo módulo", modulos.length + 1),
                  )
                }
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
              >
                {ocupado === "novo-modulo" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Novo módulo
              </button>
            </div>
          )}

          {modulos.map((m) => {
            const aberto = abertos.has(m.id);
            const doModulo = aulas.filter((a) => a.moduleId === m.id);
            return (
              <section key={m.id} className="mb-3 overflow-hidden rounded-2xl border border-border bg-card">
                <div className="flex items-center gap-2 bg-muted px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      setAbertos((p) => {
                        const n = new Set(p);
                        if (n.has(m.id)) n.delete(m.id); else n.add(m.id);
                        return n;
                      })
                    }
                    className="shrink-0"
                    aria-label={aberto ? "Recolher" : "Expandir"}
                  >
                    {aberto ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  <input
                    defaultValue={m.title}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== m.title) void comOcupado("mod-" + m.id, () => import("@/lib/course-admin").then((x) => x.renomearModulo(m.id, v)));
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm font-bold text-foreground outline-none"
                  />
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {doModulo.length} {doModulo.length === 1 ? "aula" : "aulas"}
                  </span>
                  <button
                    type="button"
                    disabled={ocupado !== null}
                    onClick={() => {
                      if (!window.confirm(`Excluir "${m.title}" e as ${doModulo.length} aulas dele?`)) return;
                      void comOcupado("del-" + m.id, () => excluirModulo(m.id));
                    }}
                    aria-label="Excluir módulo"
                    className="shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>

                {aberto && (
                  <>
                    {doModulo.map((a) => (
                      <LinhaAula
                        key={a.id}
                        aula={a}
                        cursoId={cursoId as string}
                        turma={turma.get(a.id)}
                        ocupado={ocupado}
                        onAcao={comOcupado}
                      />
                    ))}
                    <div className="border-t border-border p-3">
                      <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() =>
                          comOcupado("nova-aula-" + m.id, async () => {
                            await criarAula(m.id, {
                              title: "Nova aula",
                              kind: "video",
                              sortOrder: doModulo.length + 1,
                              unlockRule: doModulo.length === 0 ? "none" : "sequential",
                            });
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-60"
                      >
                        {ocupado === "nova-aula-" + m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Nova aula
                      </button>
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function LinhaAula({
  aula,
  cursoId,
  turma,
  ocupado,
  onAcao,
}: {
  aula: AulaAdmin;
  cursoId: string;
  turma: ProgressoTurma | undefined;
  ocupado: string | null;
  onAcao: (chave: string, fn: () => Promise<void>) => Promise<void>;
}) {
  const enviando = ocupado === "up-" + aula.id;

  const enviar = (tipo: "video" | "capa") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void onAcao("up-" + aula.id, async () => {
      await subirArquivoDaAula(cursoId, aula.id, file, tipo);
      toast.success(tipo === "video" ? "Vídeo publicado." : "Capa publicada.");
    });
  };

  return (
    <div className="border-t border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          defaultValue={aula.title}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== aula.title) void onAcao("t-" + aula.id, () => atualizarAula(aula.id, { title: v }));
          }}
          className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-foreground outline-none"
        />

        <select
          defaultValue={aula.unlockRule}
          onChange={(e) => void onAcao("r-" + aula.id, () => atualizarAula(aula.id, { unlockRule: e.target.value }))}
          title={REGRAS.find((r) => r.id === aula.unlockRule)?.ajuda}
          className="shrink-0 rounded-lg border border-border bg-muted px-2 py-1.5 text-[11px] text-foreground"
        >
          {REGRAS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>

        <label className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${aula.videoKey ? "border-emerald-500/40 text-emerald-500" : "border-border text-muted-foreground"}`}>
          {enviando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {aula.videoKey ? "Trocar vídeo" : "Vídeo"}
          <input type="file" accept="video/*" className="hidden" onChange={enviar("video")} disabled={ocupado !== null} />
        </label>

        <label className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${aula.thumbnailKey ? "border-emerald-500/40 text-emerald-500" : "border-border text-muted-foreground"}`}>
          <ImageIcon className="h-3 w-3" />
          {aula.thumbnailKey ? "Trocar capa" : "Capa"}
          <input type="file" accept="image/*" className="hidden" onChange={enviar("capa")} disabled={ocupado !== null} />
        </label>

        <button
          type="button"
          disabled={ocupado !== null}
          onClick={() => {
            if (!window.confirm(`Excluir a aula "${aula.title}"?`)) return;
            void onAcao("del-" + aula.id, () => excluirAula(aula.id));
          }}
          aria-label="Excluir aula"
          className="shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        {aula.unlockRule === "drip" && (
          <label className="inline-flex items-center gap-1">
            Abre após
            <input
              type="number"
              min={1}
              defaultValue={aula.unlockDays ?? 7}
              onBlur={(e) => void onAcao("d-" + aula.id, () => atualizarAula(aula.id, { unlockDays: Number(e.target.value) || 1 }))}
              className="w-14 rounded border border-border bg-muted px-1.5 py-0.5 text-foreground"
            />
            dias
          </label>
        )}
        <span className="inline-flex items-center gap-1">
          <Users className="h-3 w-3" />
          {turma ? `${turma.concluiram} de ${turma.iniciaram} concluíram` : "sem acesso ainda"}
        </span>
        {!aula.videoKey && <span className="text-amber-500">sem vídeo publicado</span>}
        {aula.requireWatermark && <span>marca d&apos;água ligada</span>}
      </div>
    </div>
  );
}

export default CreatorCoursesPanel;
