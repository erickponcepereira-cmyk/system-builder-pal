import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Lock,
  Play,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getLessonPlayback, type LessonPlayback } from "@/lib/course-playback.functions";
import {
  flatten,
  lessonStates,
  loadCourse,
  percentual,
  proximaAula,
  salvarProgresso,
  type Course,
  type Lesson,
} from "@/lib/course-engine";

/** Salva a posição no máximo a cada 15s: escrever a cada frame seria absurdo. */
const INTERVALO_SALVAR_MS = 15_000;

const mmss = (s: number | null) => {
  if (!s) return "";
  const m = Math.floor(s / 60);
  return m >= 60 ? Math.floor(m / 60) + "h" + String(m % 60).padStart(2, "0") : m + " min";
};

export function CoursePlayer({ productId }: { productId: string }) {
  const [course, setCourse] = useState<Course | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [aulaAtiva, setAulaAtiva] = useState<Lesson | null>(null);

  const recarregar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErro("Faça login para acessar o curso."); setLoading(false); return; }

    const { data: profile } = await supabase
      .from("profiles").select("id").eq("user_id", user.id).maybeSingle();
    const { data: student } = profile?.id
      ? await supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle()
      : { data: null };

    const sid = (student as { id?: string } | null)?.id ?? null;
    setStudentId(sid);

    const c = await loadCourse(productId, sid);
    if (!c) {
      setErro("Curso não encontrado, ou você ainda não tem acesso a ele.");
      setLoading(false);
      return;
    }
    setCourse(c);
    setAbertos((prev) => (prev.size ? prev : new Set(c.modules.slice(0, 1).map((m) => m.id))));
    setLoading(false);
  }, [productId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const estados = useMemo(
    () => (course ? lessonStates(course, null) : new Map()),
    [course],
  );
  const pct = course ? percentual(course) : 0;
  const proxima = course ? proximaAula(course, null) : null;
  const totalAulas = course ? flatten(course).length : 0;
  const feitas = course
    ? flatten(course).filter((l) => course.progress.get(l.id)?.completedAt).length
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (erro || !course) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Lock className="mx-auto mb-3 h-7 w-7 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">{erro}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="pt-1">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Curso</p>
        <h1 className="text-2xl font-bold text-foreground">{course.title}</h1>
        {course.description && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{course.description}</p>
        )}
      </header>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: pct + "%" }} />
        </div>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {feitas} de {totalAulas} aulas · {pct}% concluído
        </p>
        {proxima && (
          <button
            type="button"
            onClick={() => setAulaAtiva(proxima)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
          >
            <Play className="h-4 w-4" />
            {feitas === 0 ? "Começar" : "Continuar"}: {proxima.title}
          </button>
        )}
      </section>

      {course.modules.map((m) => {
        const aberto = abertos.has(m.id);
        return (
          <section key={m.id} className="overflow-hidden rounded-2xl border border-border bg-card">
            <button
              type="button"
              onClick={() =>
                setAbertos((prev) => {
                  const n = new Set(prev);
                  if (n.has(m.id)) n.delete(m.id); else n.add(m.id);
                  return n;
                })
              }
              className="flex w-full items-center gap-2 bg-muted px-4 py-3 text-left"
            >
              {aberto ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 text-sm font-bold text-foreground">{m.title}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {m.lessons.length} {m.lessons.length === 1 ? "aula" : "aulas"}
              </span>
            </button>

            {aberto &&
              m.lessons.map((l) => {
                const st = estados.get(l.id);
                const travada = st?.estado === "travada";
                return (
                  <button
                    key={l.id}
                    type="button"
                    disabled={travada}
                    onClick={() => setAulaAtiva(l)}
                    className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left disabled:cursor-not-allowed"
                  >
                    <span
                      className={
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg " +
                        (st?.estado === "concluida"
                          ? "bg-emerald-500/15 text-emerald-500"
                          : st?.estado === "atual"
                            ? "bg-primary text-primary-foreground"
                            : travada
                              ? "bg-muted text-muted-foreground"
                              : "bg-muted text-foreground")
                      }
                    >
                      {st?.estado === "concluida" ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : travada ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={
                          "block text-xs font-medium leading-snug " +
                          (travada ? "text-muted-foreground" : "text-foreground")
                        }
                      >
                        {l.title}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        {travada && st.estado === "travada" ? st.motivo : mmss(l.durationSeconds)}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[9px] uppercase text-muted-foreground">
                      {l.kind === "video" ? "vídeo" : l.kind}
                    </span>
                  </button>
                );
              })}
          </section>
        );
      })}

      {aulaAtiva && (
        <PlayerSheet
          lesson={aulaAtiva}
          studentId={studentId}
          onClose={() => setAulaAtiva(null)}
          onConcluida={async () => {
            await recarregar();
            setAulaAtiva(null);
          }}
        />
      )}
    </div>
  );
}

function PlayerSheet({
  lesson,
  studentId,
  onClose,
  onConcluida,
}: {
  lesson: Lesson;
  studentId: string | null;
  onClose: () => void;
  onConcluida: () => void;
}) {
  const buscar = useServerFn(getLessonPlayback);
  const [pb, setPb] = useState<LessonPlayback | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ultimoSalvo = useRef(0);

  useEffect(() => {
    let vivo = true;
    setPb(null);
    setErro(null);
    buscar({ data: { lessonId: lesson.id } })
      .then((r: unknown) => { if (vivo) setPb(r as LessonPlayback); })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível abrir a aula.");
      });
    return () => { vivo = false; };
  }, [lesson.id, buscar]);

  /** Guarda a posição de tempos em tempos, para retomar depois. */
  const aoProgredir = () => {
    const v = videoRef.current;
    if (!v || !studentId) return;
    const agora = Date.now();
    if (agora - ultimoSalvo.current < INTERVALO_SALVAR_MS) return;
    ultimoSalvo.current = agora;
    void salvarProgresso(studentId, lesson.id, { posicaoSegundos: v.currentTime }).catch(() => {});
  };

  const concluir = async () => {
    if (!studentId) { toast.error("Só alunos registram progresso."); return; }
    setSalvando(true);
    try {
      await salvarProgresso(studentId, lesson.id, {
        concluida: true,
        posicaoSegundos: videoRef.current?.currentTime ?? 0,
      });
      toast.success("Aula concluída.");
      onConcluida();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/90 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-card p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={lesson.title}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-base font-bold text-foreground">{lesson.title}</h2>
          <button type="button" onClick={onClose} className="shrink-0 text-xs font-bold text-muted-foreground">
            Fechar
          </button>
        </div>

        {erro && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
            <p className="flex items-start gap-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {erro}
            </p>
          </div>
        )}

        {!pb && !erro && (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-muted">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {pb && (
          <>
            {/* A marca d'água fica FORA do elemento de vídeo, sobreposta.
                Não impede gravação — nada impede. Ela identifica quem gravou,
                que é o que efetivamente trava revenda. */}
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                src={pb.url}
                controls
                controlsList={pb.permiteBaixar ? undefined : "nodownload"}
                onContextMenu={(e) => { if (!pb.permiteBaixar) e.preventDefault(); }}
                onLoadedMetadata={(e) => {
                  if (pb.posicaoSegundos > 0) e.currentTarget.currentTime = pb.posicaoSegundos;
                }}
                onTimeUpdate={aoProgredir}
                onPause={aoProgredir}
                className="aspect-video w-full"
              />
              {pb.marcaDagua && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-3 select-none rounded bg-black/35 px-2 py-1 font-mono text-[10px] text-white/70"
                >
                  {pb.marcaDagua}
                </span>
              )}
            </div>

            {lesson.description && (
              <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                {lesson.description}
              </p>
            )}

            <button
              type="button"
              onClick={concluir}
              disabled={salvando}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Concluir e ir para a próxima
            </button>

            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              Link temporário, válido por 4 horas e ligado à sua conta.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default CoursePlayer;
