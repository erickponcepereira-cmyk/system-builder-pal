import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  ArrowLeft,
  Check as CheckIcon,
  Pencil,
  Plus,
  Send,
  Trash2,
  Undo2,
  Upload,
  Users,
} from "lucide-react";

import { Link } from "@tanstack/react-router";
import { CourseExamBuilder } from "@/components/store/CourseExamBuilder";
import {
  atualizarAula,
  atualizarCurso,
  criarAula,
  criarCurso,
  criarModulo,
  enviarCursoParaAprovacao,
  excluirAula,
  excluirModulo,
  listarAulas,
  listarCursosGeridos,
  listarModulos,
  progressoDaTurma,
  rotuloDoStatus,
  subirArquivoDaAula,
  subirCapaDoCurso,
  subirMaterialDaAula,
  voltarCursoParaRascunho,
  type AulaAdmin,
  type CursoAdmin,
  type ModuloAdmin,
  type ProgressoTurma,
} from "@/lib/course-admin";

/**
 * Tipos de aula. O schema já aceitava os quatro; a tela só criava vídeo, e por
 * isso ebook e material só nasciam por SQL.
 */
const TIPOS: Array<{ id: string; label: string; ajuda: string }> = [
  { id: "video", label: "Vídeo", ajuda: "Aula gravada, com marca d'água e sem download" },
  { id: "ebook", label: "Ebook", ajuda: "PDF lido na tela, sem baixar" },
  { id: "download", label: "Material", ajuda: "Arquivo de apoio, que o aluno pode baixar" },
  { id: "live", label: "Ao vivo", ajuda: "Encontro marcado; use a descrição para o link" },
];

/**
 * Regras de liberação.
 *
 * Os rótulos dizem QUANDO a aula abre, e não o nome técnico da regra:
 * "gotejamento" é jargão de plataforma, e quem está montando o curso quer
 * saber o efeito. O valor gravado (`drip`, `date`) continua o mesmo.
 *
 * As duas últimas exigem complemento — dias ou data. O banco tem CHECK para
 * isso (`dpl_drip_needs_days`, `dpl_date_needs_at`), e era exatamente aí que
 * a tela quebrava: mandava a regra sozinha e levava erro de constraint.
 */
const REGRAS: Array<{ id: string; label: string; ajuda: string }> = [
  { id: "none", label: "Livre", ajuda: "Abre assim que a pessoa entra no curso" },
  { id: "sequential", label: "Em ordem", ajuda: "Abre quando a aula anterior for concluída" },
  { id: "drip", label: "Após N dias", ajuda: "Abre alguns dias depois da compra (gotejamento)" },
  { id: "date", label: "Em uma data", ajuda: "Abre numa data marcada, igual para todos" },
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

  const [editando, setEditando] = useState(false);
  /**
   * Quando foi o último salvamento.
   *
   * O painel grava ao sair do campo, e isso é bom — ninguém perde trabalho por
   * esquecer de clicar. Mas salvar sem dizer nada faz parecer que NÃO salvou,
   * que foi exatamente o relato. O indicador resolve o que um botão de salvar
   * resolveria, sem devolver o risco de perder o que foi digitado.
   */
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);

  /** Relê a lista de cursos, opcionalmente já selecionando um. */
  const recarregarCursos = useCallback(async (selecionar?: string) => {
    const lista = await listarCursosGeridos();
    setCursos(lista);
    if (selecionar) setCursoId(selecionar);
    else setCursoId((atual) => atual ?? lista[0]?.id ?? null);
  }, []);

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

  /**
   * Cria o curso e já abre para edição.
   *
   * Nasce como rascunho: a loja lê `status = 'active'` e quem promove para lá
   * é admin. Sem esse degrau, todo curso criado entraria na vitrine no mesmo
   * instante, sem ninguém ter olhado o conteúdo nem o preço.
   */
  const novoCurso = async () => {
    setOcupado("novo-curso");
    try {
      const id = await criarCurso("Curso sem título");
      await recarregarCursos(id);
      setAbertos(new Set());
      setEditando(true);
      toast.success("Curso criado como rascunho. Dê um nome e monte o conteúdo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o curso.");
    } finally {
      setOcupado(null);
    }
  };

  /** Ação sobre o curso (salvar, enviar, voltar) que relê a lista depois. */
  const comCurso = async (chave: string, fn: () => Promise<void>, sucesso?: string) => {
    setOcupado(chave);
    try {
      await fn();
      await recarregarCursos();
      setSalvoEm(new Date());
      if (sucesso) toast.success(sucesso);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setOcupado(null);
    }
  };

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
      setSalvoEm(new Date());
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
        <Link
          to={role === "partner" ? "/partner" : "/professional"}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar ao painel
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {role === "partner" ? "Parceiro" : "Profissional"}
            </p>
            <h1 className="text-2xl font-bold text-foreground">Cursos</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Monte os módulos e as aulas, e acompanhe quem está estudando.
            </p>
          </div>

          {/* Diz o que está acontecendo. Sem isto, salvar ao sair do campo
              parece não salvar — e a pessoa procura um botão que não existe. */}
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold">
            {ocupado !== null ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Salvando…</span>
              </>
            ) : salvoEm ? (
              <>
                <CheckIcon className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-500">
                  Salvo às {salvoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Salva sozinho ao sair do campo</span>
            )}
          </span>
        </div>
      </header>

      {cursos.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <BookOpen className="mx-auto mb-3 h-7 w-7 text-muted-foreground opacity-50" />
          <p className="text-sm font-bold text-foreground">Você ainda não tem curso</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            Crie o curso, monte os módulos e as aulas, e envie para aprovação. Ele só aparece na
            loja depois que a FitMind aprovar.
          </p>
          <button
            type="button"
            onClick={() => void novoCurso()}
            disabled={ocupado !== null}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-60"
          >
            {ocupado === "novo-curso" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Criar curso
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {cursos.length > 1 && cursos.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { setCursoId(c.id); setAbertos(new Set()); setEditando(false); }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  c.id === cursoId ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent"
                }`}
              >
                {c.title}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void novoCurso()}
              disabled={ocupado !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent disabled:opacity-60"
            >
              {ocupado === "novo-curso" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Novo curso
            </button>
          </div>

          {curso && (
            <CursoCard
              curso={curso}
              modulos={modulos.length}
              aulas={aulas.length}
              editando={editando}
              onEditar={setEditando}
              ocupado={ocupado}
              onSalvar={(campos) =>
                comCurso("salvar-curso", () => atualizarCurso(curso.id, campos), "Curso salvo.")}
              onCapa={(file) =>
                comCurso("capa-curso", async () => {
                  const url = await subirCapaDoCurso(curso.id, file);
                  await atualizarCurso(curso.id, { coverUrl: url });
                }, "Capa publicada.")}
              onEnviar={() =>
                comCurso("enviar-curso", () => enviarCursoParaAprovacao(curso.id),
                  "Enviado para aprovação da FitMind.")}
              onVoltar={() =>
                comCurso("voltar-curso", () => voltarCursoParaRascunho(curso.id),
                  "De volta a rascunho.")}
              onNovoModulo={() =>
                comOcupado("novo-modulo", () =>
                  criarModulo(curso.id, "Novo módulo", modulos.length + 1))}
            />
          )}

          {curso && (
            <CourseExamBuilder
              digitalProductId={curso.id}
              modulos={modulos.map((m) => ({ id: m.id, title: m.title }))}
            />
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
          defaultValue={aula.kind}
          onChange={(e) => void onAcao("k-" + aula.id, () => atualizarAula(aula.id, {
            kind: e.target.value,
            // Ebook lê na tela; material de apoio existe para ser baixado.
            // Vídeo nunca libera, e o servidor força isso de novo.
            allowDownload: e.target.value === "download",
            requireWatermark: e.target.value !== "download",
          }))}
          title={TIPOS.find((t) => t.id === aula.kind)?.ajuda}
          className="shrink-0 rounded-lg border border-border bg-muted px-2 py-1.5 text-[11px] text-foreground"
        >
          {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        <select
          defaultValue={aula.unlockRule}
          onChange={(e) => {
            const regra = e.target.value;
            // O banco recusa "após N dias" sem dias e "em uma data" sem data.
            // Mandar a regra sozinha era o bug: virava erro de constraint, com
            // uma mensagem que não ajuda ninguém. Vai o complemento junto, com
            // um padrão que o criador ajusta em seguida.
            const emSeteDias = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
            void onAcao("r-" + aula.id, () => atualizarAula(aula.id, {
              unlockRule: regra,
              unlockDays: regra === "drip" ? (aula.unlockDays ?? 7) : null,
              unlockAt: regra === "date" ? (aula.unlockAt ?? emSeteDias) : null,
            }));
          }}
          title={REGRAS.find((r) => r.id === aula.unlockRule)?.ajuda}
          className="shrink-0 rounded-lg border border-border bg-muted px-2 py-1.5 text-[11px] text-foreground"
        >
          {REGRAS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>

        {aula.kind === "video" ? (
          <label className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${aula.videoKey ? "border-emerald-500/40 text-emerald-500" : "border-border text-muted-foreground"}`}>
            {enviando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {aula.videoKey ? "Trocar vídeo" : "Vídeo"}
            <input type="file" accept="video/*" className="hidden" onChange={enviar("video")} disabled={ocupado !== null} />
          </label>
        ) : aula.kind === "live" ? null : (
          <label className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${aula.filePath ? "border-emerald-500/40 text-emerald-500" : "border-border text-muted-foreground"}`}>
            {enviando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {aula.filePath ? "Trocar arquivo" : "Arquivo"}
            <input
              type="file"
              accept={aula.kind === "ebook" ? "application/pdf" : undefined}
              className="hidden"
              disabled={ocupado !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                void onAcao("up-" + aula.id, async () => {
                  await subirMaterialDaAula(cursoId, aula.id, file);
                  toast.success("Material publicado.");
                });
              }}
            />
          </label>
        )}

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
        {/* "Data fixa" sem data se comportava como "Liberada", em silêncio:
            `course-engine` só tranca quando `unlockAt` existe. Agora a data é
            pedida — e o CHECK do banco recusa a regra sem ela. */}
        {aula.unlockRule === "date" && (
          <label className="inline-flex items-center gap-1">
            Abre em
            <input
              type="datetime-local"
              defaultValue={aula.unlockAt ? aula.unlockAt.slice(0, 16) : ""}
              onBlur={(e) => void onAcao("dt-" + aula.id, () => atualizarAula(aula.id, {
                unlockAt: e.target.value ? new Date(e.target.value).toISOString() : null,
              }))}
              className="rounded border border-border bg-muted px-1.5 py-0.5 text-foreground"
            />
          </label>
        )}
        {aula.unlockRule === "date" && !aula.unlockAt && (
          <span className="text-amber-500">escolha a data, senão a aula abre para todo mundo</span>
        )}
        {aula.unlockRule === "drip" && !aula.unlockDays && (
          <span className="text-amber-500">defina em quantos dias abre</span>
        )}
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
        {aula.kind === "video" && !aula.videoKey && (
          <span className="text-amber-500">sem vídeo publicado</span>
        )}
        {(aula.kind === "ebook" || aula.kind === "download") && !aula.filePath && (
          <span className="text-amber-500">sem arquivo publicado</span>
        )}
        {aula.kind === "live" && (
          <span>encontro ao vivo · ponha o link na descrição</span>
        )}
        {aula.requireWatermark && <span>marca d&apos;água ligada</span>}
        {aula.allowDownload && <span>o aluno pode baixar</span>}

        {/* A isca. Aula grátis abre para quem ainda NÃO comprou, enquanto o
            curso estiver na loja — é o que Kiwify e Hotmart chamam de
            degustação, e é o que faz a pessoa decidir comprar. */}
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={aula.isPreview}
            onChange={(e) => void onAcao("p-" + aula.id, () =>
              atualizarAula(aula.id, { isPreview: e.target.checked }))}
            disabled={ocupado !== null}
          />
          <span className={aula.isPreview ? "font-bold text-emerald-500" : ""}>
            {aula.isPreview ? "grátis — aparece para quem não comprou" : "aula grátis (isca)"}
          </span>
        </label>
      </div>
    </div>
  );
}

/**
 * Cartão do curso — onde o curso deixa de ser só um título.
 *
 * Preço, descrição e capa já vinham carregados de `listarCursosGeridos` e eram
 * descartados pela tela. Agora são editáveis, e ao lado deles fica a única
 * coisa que o criador NÃO controla: a publicação.
 *
 * O ciclo é rascunho → em análise → no ar. Quem coloca no ar é a FitMind, e
 * está escrito na tela — porque o criador precisa saber por que o curso dele
 * ainda não aparece na loja.
 */
function CursoCard({
  curso,
  modulos,
  aulas,
  editando,
  onEditar,
  ocupado,
  onSalvar,
  onCapa,
  onEnviar,
  onVoltar,
  onNovoModulo,
}: {
  curso: CursoAdmin;
  modulos: number;
  aulas: number;
  editando: boolean;
  onEditar: (v: boolean) => void;
  ocupado: string | null;
  onSalvar: (campos: { title?: string; description?: string | null; price?: number }) => Promise<void>;
  onCapa: (file: File) => Promise<void>;
  onEnviar: () => Promise<void>;
  onVoltar: () => Promise<void>;
  onNovoModulo: () => Promise<void>;
}) {
  const [titulo, setTitulo] = useState(curso.title);
  const [descricao, setDescricao] = useState(curso.description ?? "");
  const [preco, setPreco] = useState(String(curso.price ?? 0));

  // O curso trocado por baixo (seletor) precisa recarregar os campos, senão o
  // formulário mostra os dados do curso anterior.
  useEffect(() => {
    setTitulo(curso.title);
    setDescricao(curso.description ?? "");
    setPreco(String(curso.price ?? 0));
  }, [curso.id, curso.title, curso.description, curso.price]);

  const noAr = curso.status === "active";
  const emAnalise = curso.status === "pending_review";
  const tomDoStatus = noAr
    ? "bg-emerald-500/15 text-emerald-500"
    : emAnalise
      ? "bg-amber-500/15 text-amber-500"
      : "bg-muted text-muted-foreground";

  return (
    <div className="mb-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-foreground">{curso.title}</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tomDoStatus}`}>
              {rotuloDoStatus(curso.status)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {modulos} {modulos === 1 ? "módulo" : "módulos"} ·{" "}
            {aulas} {aulas === 1 ? "aula" : "aulas"} ·{" "}
            {Number(curso.price || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onEditar(!editando)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-accent"
        >
          <Pencil className="h-3 w-3" />
          {editando ? "Fechar" : "Editar"}
        </button>
      </div>

      {editando && (
        <div className="mt-3 grid gap-2 rounded-xl bg-muted p-3">
          <label className="grid gap-1 text-[11px] text-muted-foreground">
            Nome do curso
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground"
            />
          </label>

          <label className="grid gap-1 text-[11px] text-muted-foreground">
            Descrição
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground"
            />
          </label>

          <label className="grid gap-1 text-[11px] text-muted-foreground">
            Preço (R$)
            <input
              type="number"
              min={0}
              step="0.01"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              className="w-32 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={ocupado !== null}
              onClick={() => void onSalvar({
                title: titulo,
                description: descricao.trim() ? descricao : null,
                price: Number(preco) || 0,
              })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
            >
              {ocupado === "salvar-curso" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Salvar
            </button>

            <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-accent">
              {ocupado === "capa-curso" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
              {curso.coverUrl ? "Trocar capa" : "Capa"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={ocupado !== null}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onCapa(f); e.target.value = ""; }}
              />
            </label>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={ocupado !== null}
          onClick={() => void onNovoModulo()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
        >
          {ocupado === "novo-modulo" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Novo módulo
        </button>

        {/* Curso no ar não volta por aqui: tirar da loja é decisão da FitMind,
            não do criador — pode haver quem já comprou. */}
        {!noAr && !emAnalise && (
          <button
            type="button"
            disabled={ocupado !== null || aulas === 0}
            title={aulas === 0 ? "Publique pelo menos uma aula antes de enviar." : undefined}
            onClick={() => void onEnviar()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground hover:bg-accent disabled:opacity-50"
          >
            {ocupado === "enviar-curso" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar para aprovação
          </button>
        )}

        {emAnalise && (
          <button
            type="button"
            disabled={ocupado !== null}
            onClick={() => void onVoltar()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-accent disabled:opacity-60"
          >
            {ocupado === "voltar-curso" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
            Voltar para rascunho
          </button>
        )}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        {noAr
          ? "Este curso está na loja. Mudanças de conteúdo valem na hora para quem já comprou."
          : emAnalise
            ? "Na fila da FitMind. Enquanto estiver em análise ele não aparece na loja."
            : "Rascunho: só você enxerga. Ele entra na loja depois que a FitMind aprovar."}
      </p>
    </div>
  );
}

export default CreatorCoursesPanel;
