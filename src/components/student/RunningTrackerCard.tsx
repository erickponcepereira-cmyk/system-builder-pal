import { useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, Flag, Footprints, MapPin, Pause, Play, Square, Timer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { startForegroundLocationWatch, type ForegroundLocationWatch } from "@/lib/foreground-location";
import {
  analyzeRunningSamples,
  type RunningAnalysis,
  type RunningClassification,
  type RunningSample,
} from "@/lib/running-metrics";

const CONSENT_VERSION = "gps-running-foreground-v1-2026-08";

type TrackerState = "idle" | "starting" | "running" | "paused" | "finishing";

type HistoryRow = {
  id: string;
  started_at: string;
  elapsed_seconds: number;
  distance_meters: number;
  average_pace_seconds_per_km: number | null;
  status: "active" | "completed" | "invalid" | "discarded";
  activity_classification: RunningClassification;
  is_counted: boolean;
  validation_reason: string | null;
};

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3_600);
  const m = Math.floor((safe % 3_600) / 60);
  const s = safe % 60;
  return h > 0
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatPace(seconds: number | null) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function classificationLabel(value: RunningClassification) {
  switch (value) {
    case "run": return "Corrida validada";
    case "mixed": return "Corrida com trechos excluídos";
    case "bike_suspected": return "Bicicleta suspeita";
    case "vehicle_suspected": return "Veículo suspeito";
    default: return "Dados insuficientes";
  }
}

function historyDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function RunningTrackerCard({ studentId }: { studentId: string }) {
  const [state, setState] = useState<TrackerState>("idle");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [schemaReady, setSchemaReady] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [hasConsent, setHasConsent] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [currentPace, setCurrentPace] = useState<number | null>(null);
  const [gpsWarning, setGpsWarning] = useState<string | null>(null);

  const watchRef = useRef<ForegroundLocationWatch | null>(null);
  const samplesRef = useRef<RunningSample[]>([]);
  const shouldStartNewSegmentRef = useRef(true);
  const recordingRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const activePeriodStartedAtRef = useRef<number | null>(null);
  const elapsedBeforeCurrentPeriodRef = useRef(0);
  const consentAcceptedAtRef = useRef<string | null>(null);

  const loadHistory = async () => {
    setLoadingHistory(true);
    const consentResult = await supabase
      .from("running_tracking_consents" as never)
      .select("accepted_at,revoked_at" as never)
      .eq("student_id" as never, studentId as never)
      .maybeSingle();

    if (consentResult.error && (consentResult.error as { code?: string }).code !== "42P01") {
      console.error("[Running] consent load", consentResult.error);
    }
    const consent = consentResult.data as { accepted_at?: string; revoked_at?: string | null } | null;
    const consentActive = Boolean(consent?.accepted_at && !consent?.revoked_at);
    setHasConsent(consentActive);
    consentAcceptedAtRef.current = consentActive ? consent?.accepted_at || null : null;

    const historyResult = await supabase
      .from("running_activities" as never)
      .select("id,started_at,elapsed_seconds,distance_meters,average_pace_seconds_per_km,status,activity_classification,is_counted,validation_reason" as never)
      .eq("student_id" as never, studentId as never)
      .neq("status" as never, "discarded" as never)
      .order("started_at" as never, { ascending: false })
      .limit(5);

    if (historyResult.error) {
      const code = (historyResult.error as { code?: string }).code;
      if (code === "42P01") setSchemaReady(false);
      else {
        console.error("[Running] history load", historyResult.error);
        toast.error("Não foi possível carregar suas corridas.");
      }
    } else {
      setSchemaReady(true);
      setHistory(((historyResult.data as HistoryRow[] | null) || []));
    }
    setLoadingHistory(false);
  };

  useEffect(() => {
    void loadHistory();
    return () => {
      recordingRef.current = false;
      void watchRef.current?.stop();
    };
    // O aluno não muda durante a montagem do cartão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  useEffect(() => {
    if (state !== "running") return;
    const timer = window.setInterval(() => {
      const activeStartedAt = activePeriodStartedAtRef.current;
      if (!activeStartedAt) return;
      setElapsedSeconds(elapsedBeforeCurrentPeriodRef.current + Math.floor((Date.now() - activeStartedAt) / 1_000));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [state]);

  const currentElapsed = () => {
    const activeStartedAt = activePeriodStartedAtRef.current;
    return elapsedBeforeCurrentPeriodRef.current + (activeStartedAt ? Math.floor((Date.now() - activeStartedAt) / 1_000) : 0);
  };

  const stopWatch = async () => {
    recordingRef.current = false;
    const currentWatch = watchRef.current;
    watchRef.current = null;
    if (currentWatch) await currentWatch.stop().catch(() => undefined);
  };

  const updateLiveMetrics = (samples: RunningSample[]) => {
    const analysis = analyzeRunningSamples(samples);
    setDistanceM(analysis.distanceM);
    const last = analysis.points[analysis.points.length - 1];
    if (last?.qualityStatus === "accepted" && (last.segmentSpeedMps || 0) > 0.4) {
      setCurrentPace(Math.round(1_000 / (last.segmentSpeedMps || 1)));
    }
    if (last?.qualityStatus === "suspected_bike") {
      setGpsWarning("Velocidade de bicicleta identificada. O trecho será excluído do total.");
    } else if (last?.qualityStatus === "suspected_vehicle") {
      setGpsWarning("Velocidade de veículo identificada. O trecho será excluído do total.");
    }
  };

  const beginLocationWatch = async () => {
    recordingRef.current = true;
    try {
      watchRef.current = await startForegroundLocationWatch({
        onPoint: (point) => {
          if (!recordingRef.current) return;
          const sample: RunningSample = {
            ...point,
            segmentStart: shouldStartNewSegmentRef.current,
          };
          shouldStartNewSegmentRef.current = false;
          const samples = [...samplesRef.current, sample];
          samplesRef.current = samples;
          updateLiveMetrics(samples);
        },
        onError: (message) => setGpsWarning(message),
      });
    } catch (error) {
      recordingRef.current = false;
      throw error;
    }
  };

  const ensureConsent = async () => {
    if (consentAcceptedAtRef.current) return consentAcceptedAtRef.current;
    if (!consentChecked) throw new Error("Confirme o uso da localização antes de iniciar.");

    const now = new Date().toISOString();
    const result = await supabase
      .from("running_tracking_consents" as never)
      .upsert({
        student_id: studentId,
        policy_version: CONSENT_VERSION,
        accepted_at: now,
        revoked_at: null,
      } as never, { onConflict: "student_id" })
      .select("accepted_at" as never)
      .single();

    if (result.error) throw result.error;
    const acceptedAt = (result.data as { accepted_at?: string } | null)?.accepted_at || now;
    consentAcceptedAtRef.current = acceptedAt;
    setHasConsent(true);
    return acceptedAt;
  };

  const start = async () => {
    setState("starting");
    setGpsWarning(null);
    try {
      await ensureConsent();
      samplesRef.current = [];
      shouldStartNewSegmentRef.current = true;
      elapsedBeforeCurrentPeriodRef.current = 0;
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setDistanceM(0);
      setCurrentPace(null);
      await beginLocationWatch();
      activePeriodStartedAtRef.current = Date.now();
      setState("running");
      toast.success("Corrida iniciada. Aguarde o GPS estabilizar.");
    } catch (error) {
      setState("idle");
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a corrida.");
    }
  };

  const pause = async () => {
    const elapsed = currentElapsed();
    elapsedBeforeCurrentPeriodRef.current = elapsed;
    activePeriodStartedAtRef.current = null;
    setElapsedSeconds(elapsed);
    shouldStartNewSegmentRef.current = true;
    await stopWatch();
    setState("paused");
  };

  const resume = async () => {
    setState("starting");
    setGpsWarning(null);
    shouldStartNewSegmentRef.current = true;
    try {
      await beginLocationWatch();
      activePeriodStartedAtRef.current = Date.now();
      setState("running");
    } catch (error) {
      setState("paused");
      toast.error(error instanceof Error ? error.message : "Não foi possível retomar a localização.");
    }
  };

  const resetSession = () => {
    samplesRef.current = [];
    recordingRef.current = false;
    shouldStartNewSegmentRef.current = true;
    startedAtRef.current = null;
    activePeriodStartedAtRef.current = null;
    elapsedBeforeCurrentPeriodRef.current = 0;
    setElapsedSeconds(0);
    setDistanceM(0);
    setCurrentPace(null);
    setGpsWarning(null);
    setState("idle");
  };

  const persistRun = async (analysis: RunningAnalysis, elapsed: number, consentAt: string) => {
    const startedAt = new Date(startedAtRef.current || Date.now()).toISOString();
    const endedAt = new Date().toISOString();
    const status = analysis.isCounted ? "completed" : "invalid";
    const activityResult = await supabase
      .from("running_activities" as never)
      .insert({
        student_id: studentId,
        started_at: startedAt,
        ended_at: endedAt,
        elapsed_seconds: elapsed,
        moving_seconds: analysis.movingSeconds,
        distance_meters: analysis.distanceM,
        excluded_distance_meters: analysis.excludedDistanceM,
        average_pace_seconds_per_km: analysis.averagePaceSecondsPerKm,
        best_pace_seconds_per_km: analysis.bestPaceSecondsPerKm,
        average_speed_mps: analysis.averageSpeedMps,
        max_speed_mps: analysis.maxSpeedMps,
        status,
        activity_classification: analysis.classification,
        is_counted: analysis.isCounted,
        validation_reason: analysis.validationReason,
        location_consent_at: consentAt,
      } as never)
      .select("id" as never)
      .single();

    if (activityResult.error) throw activityResult.error;
    const activityId = (activityResult.data as { id?: string } | null)?.id;
    if (!activityId) throw new Error("A corrida foi salva sem identificador.");

    try {
      const pointRows = analysis.points.map((point) => ({
        activity_id: activityId,
        sequence: point.sequence,
        captured_at: new Date(point.capturedAt).toISOString(),
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy_m: point.accuracyM,
        altitude_m: point.altitudeM,
        speed_mps: point.speedMps,
        heading_degrees: point.headingDegrees,
        segment_distance_m: point.segmentDistanceM,
        segment_duration_seconds: point.segmentDurationS,
        segment_speed_mps: point.segmentSpeedMps,
        quality_status: point.qualityStatus,
      }));
      for (let index = 0; index < pointRows.length; index += 100) {
        const insert = await supabase
          .from("running_track_points" as never)
          .insert(pointRows.slice(index, index + 100) as never);
        if (insert.error) throw insert.error;
      }

      if (analysis.splits.length) {
        const insert = await supabase
          .from("running_splits" as never)
          .insert(analysis.splits.map((split) => ({
            activity_id: activityId,
            km_number: split.kmNumber,
            duration_seconds: split.durationSeconds,
            pace_seconds_per_km: split.paceSecondsPerKm,
          })) as never);
        if (insert.error) throw insert.error;
      }
    } catch (error) {
      await supabase.from("running_activities" as never).delete().eq("id" as never, activityId as never);
      throw error;
    }
  };

  const finish = async () => {
    const validPoints = samplesRef.current.filter((sample) => sample.accuracyM <= 35);
    if (validPoints.length < 2) {
      toast.error("Ainda não há sinal de GPS suficiente. Aguarde dois pontos precisos antes de finalizar.");
      return;
    }

    setState("finishing");
    const elapsed = currentElapsed();
    elapsedBeforeCurrentPeriodRef.current = elapsed;
    activePeriodStartedAtRef.current = null;
    await stopWatch();

    try {
      const consentAt = await ensureConsent();
      const analysis = analyzeRunningSamples(samplesRef.current);
      await persistRun(analysis, elapsed, consentAt);
      if (analysis.isCounted) {
        toast.success(`${(analysis.distanceM / 1_000).toFixed(2)} km salvos na sua evolução.`);
      } else {
        toast.warning("Atividade salva como não contabilizada por velocidade incompatível com corrida.");
      }
      resetSession();
      await loadHistory();
    } catch (error) {
      setState("paused");
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a corrida.");
    }
  };

  const cancel = async () => {
    if (!confirm("Cancelar esta corrida? Os pontos desta sessão não serão salvos.")) return;
    await stopWatch();
    resetSession();
  };

  const deleteActivity = async (id: string) => {
    if (!confirm("Apagar esta corrida e sua rota? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("running_activities" as never).delete().eq("id" as never, id as never);
    if (error) toast.error("Não foi possível apagar a corrida.");
    else {
      toast.success("Corrida apagada.");
      await loadHistory();
    }
  };

  if (!schemaReady) {
    return (
      <section className="rounded-2xl bg-card p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <h2 className="text-sm font-bold text-foreground">Corrida GPS</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">O módulo de corrida está sendo ativado. Atualize o banco de dados antes de liberar esta tela aos alunos.</p>
          </div>
        </div>
      </section>
    );
  }

  const active = state === "running" || state === "paused" || state === "starting" || state === "finishing";

  return (
    <section className="overflow-hidden rounded-2xl bg-card">
      <div className="border-b border-white/5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
              <Footprints className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Corrida GPS <span className="text-[10px] font-semibold text-primary">BETA</span></h2>
              <p className="text-[11px] text-muted-foreground">Distância, pace e validação de percurso</p>
            </div>
          </div>
          <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
        </div>
      </div>

      <div className="p-4">
        {active ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-muted/30 p-2.5">
                <Timer className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">Tempo</p>
                <p className="text-base font-bold tabular-nums text-foreground">{formatDuration(elapsedSeconds)}</p>
              </div>
              <div className="rounded-xl bg-muted/30 p-2.5">
                <Activity className="mx-auto mb-1 h-4 w-4 text-primary" />
                <p className="text-[10px] text-muted-foreground">Distância</p>
                <p className="text-base font-bold tabular-nums text-primary">{(distanceM / 1_000).toFixed(2)} <span className="text-[10px]">km</span></p>
              </div>
              <div className="rounded-xl bg-muted/30 p-2.5">
                <Flag className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">Pace atual</p>
                <p className="text-base font-bold tabular-nums text-foreground">{formatPace(currentPace)} <span className="text-[10px]">/km</span></p>
              </div>
            </div>

            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              {state === "paused" ? "Corrida pausada. O deslocamento enquanto pausada não entra no percurso." : state === "finishing" ? "Salvando percurso..." : "GPS em primeiro plano — mantenha esta tela aberta durante o teste."}
            </p>
            {gpsWarning && (
              <div className="mt-3 flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <p>{gpsWarning}</p>
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {state === "running" ? (
                <button type="button" onClick={() => void pause()} className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-3 text-sm font-bold text-foreground">
                  <Pause className="h-4 w-4" /> Pausar
                </button>
              ) : (
                <button type="button" disabled={state !== "paused"} onClick={() => void resume()} className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-3 text-sm font-bold text-foreground disabled:opacity-50">
                  <Play className="h-4 w-4" /> Retomar
                </button>
              )}
              <button type="button" disabled={state === "starting" || state === "finishing"} onClick={() => void finish()} className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
                <Square className="h-4 w-4" /> Finalizar
              </button>
              <button type="button" disabled={state === "finishing"} onClick={() => void cancel()} className="col-span-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50">Cancelar sem salvar</button>
            </div>
          </>
        ) : (
          <>
            {!hasConsent && (
              <label className="mb-3 flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
                <input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
                <span>Autorizo o uso da minha localização precisa durante esta corrida para calcular rota, km e pace. A rota fica privada e pode ser apagada por mim.</span>
              </label>
            )}
            <div className="rounded-xl bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">Teste em primeiro plano</p>
              <p className="mt-1">Este primeiro teste registra somente corrida com o app aberto. Trechos sustentados em velocidade de bicicleta ou carro são excluídos e podem invalidar a atividade.</p>
            </div>
            <button type="button" disabled={!hasConsent && !consentChecked} onClick={() => void start()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
              <Play className="h-4 w-4" /> Iniciar corrida
            </button>
          </>
        )}

        <div className="mt-5 border-t border-white/5 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Últimas corridas</h3>
            {loadingHistory && <span className="text-[10px] text-muted-foreground">Carregando...</span>}
          </div>
          {!loadingHistory && history.length === 0 && <p className="py-2 text-center text-xs text-muted-foreground">Sua primeira corrida aparecerá aqui.</p>}
          <div className="space-y-2">
            {history.map((run) => (
              <article key={run.id} className="flex items-center gap-3 rounded-xl bg-muted/20 p-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${run.is_counted ? "bg-primary/15" : "bg-amber-400/10"}`}>
                  {run.is_counted ? <Footprints className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-bold text-foreground">{(Number(run.distance_meters) / 1_000).toFixed(2)} km <span className="font-normal text-muted-foreground">· {formatDuration(Number(run.elapsed_seconds))}</span></p>
                    <p className="shrink-0 text-xs font-bold text-primary">{formatPace(run.average_pace_seconds_per_km)}<span className="text-[10px]">/km</span></p>
                  </div>
                  <p className={`mt-0.5 truncate text-[10px] ${run.is_counted ? "text-muted-foreground" : "text-amber-300"}`} title={run.validation_reason || undefined}>{classificationLabel(run.activity_classification)} · {historyDate(run.started_at)}</p>
                </div>
                <button type="button" onClick={() => void deleteActivity(run.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-red-400" aria-label="Apagar corrida">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
