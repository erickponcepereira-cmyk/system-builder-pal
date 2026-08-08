import type { ForegroundLocationPoint } from "@/lib/foreground-location";

const EARTH_RADIUS_M = 6_371_000;
const MAX_ACCURACY_M = 35;
const MAX_PLAUSIBLE_SPEED_MPS = 15;
const BIKE_SPEED_MPS = 6.95; // 25 km/h por ao menos 60 s
const VEHICLE_SPEED_MPS = 11.95; // 43 km/h por ao menos 30 s

export type RunningPointQuality =
  | "accepted"
  | "ignored_accuracy"
  | "ignored_timestamp"
  | "ignored_jump"
  | "suspected_bike"
  | "suspected_vehicle";

export type RunningClassification =
  | "run"
  | "bike_suspected"
  | "vehicle_suspected"
  | "mixed"
  | "unknown";

export type RunningSample = ForegroundLocationPoint & {
  /** Marca o primeiro ponto depois de uma pausa para não contar o deslocamento pausado. */
  segmentStart?: boolean;
};

export type AnalyzedRunningPoint = RunningSample & {
  sequence: number;
  qualityStatus: RunningPointQuality;
  segmentDistanceM: number;
  segmentDurationS: number;
  segmentSpeedMps: number | null;
};

export type RunningSplit = {
  kmNumber: number;
  durationSeconds: number;
  paceSecondsPerKm: number;
};

export type RunningAnalysis = {
  points: AnalyzedRunningPoint[];
  splits: RunningSplit[];
  distanceM: number;
  excludedDistanceM: number;
  movingSeconds: number;
  averagePaceSecondsPerKm: number | null;
  bestPaceSecondsPerKm: number | null;
  averageSpeedMps: number | null;
  maxSpeedMps: number | null;
  classification: RunningClassification;
  isCounted: boolean;
  validationReason: string | null;
};

type SuspectKind = "bike" | "vehicle";

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineMeters(a: Pick<RunningSample, "latitude" | "longitude">, b: Pick<RunningSample, "latitude" | "longitude">) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function markSustainedSuspect(points: AnalyzedRunningPoint[], kind: SuspectKind) {
  const threshold = kind === "vehicle" ? VEHICLE_SPEED_MPS : BIKE_SPEED_MPS;
  const minimumDuration = kind === "vehicle" ? 30 : 60;
  const suspectQuality: RunningPointQuality = kind === "vehicle" ? "suspected_vehicle" : "suspected_bike";
  let group: AnalyzedRunningPoint[] = [];

  const apply = () => {
    const duration = group.reduce((sum, point) => sum + point.segmentDurationS, 0);
    if (duration >= minimumDuration) {
      group.forEach((point) => {
        point.qualityStatus = suspectQuality;
      });
    }
    group = [];
  };

  for (const point of points) {
    const isCandidate =
      point.qualityStatus === "accepted" &&
      (point.segmentSpeedMps ?? 0) >= threshold &&
      point.segmentDistanceM > 0;
    if (isCandidate) group.push(point);
    else apply();
  }
  apply();
}

function buildSplits(points: AnalyzedRunningPoint[]): RunningSplit[] {
  const splits: RunningSplit[] = [];
  let distanceInCurrentKm = 0;
  let secondsInCurrentKm = 0;

  for (const point of points) {
    if (point.qualityStatus !== "accepted" || point.segmentDistanceM <= 0) continue;
    let distanceLeft = point.segmentDistanceM;
    let secondsLeft = point.segmentDurationS;

    while (distanceLeft > 0) {
      const distanceUntilSplit = 1_000 - distanceInCurrentKm;
      const distanceForPart = Math.min(distanceLeft, distanceUntilSplit);
      const secondsForPart = point.segmentDistanceM > 0
        ? secondsLeft * (distanceForPart / distanceLeft)
        : 0;

      distanceInCurrentKm += distanceForPart;
      secondsInCurrentKm += secondsForPart;
      distanceLeft -= distanceForPart;
      secondsLeft -= secondsForPart;

      if (distanceInCurrentKm >= 999.999) {
        const durationSeconds = Math.max(1, Math.round(secondsInCurrentKm));
        splits.push({
          kmNumber: splits.length + 1,
          durationSeconds,
          paceSecondsPerKm: durationSeconds,
        });
        distanceInCurrentKm = 0;
        secondsInCurrentKm = 0;
      }
    }
  }

  return splits;
}

/**
 * Recalcula a atividade a partir de pontos GPS, sem confiar em quilômetros
 * enviados pelo dispositivo. Pontos ruins e trechos sustentados em velocidade
 * de bicicleta/carro ficam armazenados para auditoria, mas fora do total.
 */
export function analyzeRunningSamples(samples: RunningSample[]): RunningAnalysis {
  const ordered = [...samples]
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Number.isFinite(point.capturedAt))
    .sort((a, b) => a.capturedAt - b.capturedAt);

  const points: AnalyzedRunningPoint[] = [];
  let previousAccepted: RunningSample | null = null;

  for (const sample of ordered) {
    const base: AnalyzedRunningPoint = {
      ...sample,
      sequence: points.length,
      qualityStatus: "accepted",
      segmentDistanceM: 0,
      segmentDurationS: 0,
      segmentSpeedMps: null,
    };

    if (sample.accuracyM > MAX_ACCURACY_M) {
      base.qualityStatus = "ignored_accuracy";
      points.push(base);
      continue;
    }

    if (sample.segmentStart || !previousAccepted) {
      previousAccepted = sample;
      points.push(base);
      continue;
    }

    const durationS = (sample.capturedAt - previousAccepted.capturedAt) / 1_000;
    if (durationS <= 0 || durationS > 90) {
      base.qualityStatus = "ignored_timestamp";
      previousAccepted = sample;
      points.push(base);
      continue;
    }

    const distanceM = haversineMeters(previousAccepted, sample);
    const computedSpeedMps = distanceM / durationS;
    if (computedSpeedMps > MAX_PLAUSIBLE_SPEED_MPS) {
      base.qualityStatus = "ignored_jump";
      points.push(base);
      continue;
    }

    base.segmentDistanceM = distanceM;
    base.segmentDurationS = durationS;
    base.segmentSpeedMps = computedSpeedMps;
    previousAccepted = sample;
    points.push(base);
  }

  // Veículo vem antes: uma sequência de carro também excede o limiar de bike.
  markSustainedSuspect(points, "vehicle");
  markSustainedSuspect(points, "bike");

  const included = points.filter((point) => point.qualityStatus === "accepted");
  const bikes = points.filter((point) => point.qualityStatus === "suspected_bike");
  const vehicles = points.filter((point) => point.qualityStatus === "suspected_vehicle");
  const distanceM = included.reduce((sum, point) => sum + point.segmentDistanceM, 0);
  const excludedDistanceM = [...bikes, ...vehicles].reduce((sum, point) => sum + point.segmentDistanceM, 0);
  const movingSeconds = included.reduce((sum, point) => sum + point.segmentDurationS, 0);
  const vehicleDistance = vehicles.reduce((sum, point) => sum + point.segmentDistanceM, 0);
  const bikeDistance = bikes.reduce((sum, point) => sum + point.segmentDistanceM, 0);
  const reviewedDistance = distanceM + excludedDistanceM;
  const splits = buildSplits(points);

  let classification: RunningClassification = "unknown";
  let validationReason: string | null = null;
  if (reviewedDistance > 0) {
    if (vehicleDistance / reviewedDistance >= 0.5) {
      classification = "vehicle_suspected";
      validationReason = "A maior parte do percurso ficou acima de 43 km/h por pelo menos 30 segundos.";
    } else if (bikeDistance / reviewedDistance >= 0.5) {
      classification = "bike_suspected";
      validationReason = "A maior parte do percurso ficou acima de 25 km/h por pelo menos 60 segundos.";
    } else if (excludedDistanceM > 0) {
      classification = "mixed";
      validationReason = "Trechos com velocidade incompatível com corrida foram excluídos do total.";
    } else {
      classification = "run";
    }
  }

  const isCounted = classification === "run" || classification === "mixed";
  const averagePaceSecondsPerKm = distanceM > 0 ? Math.round(movingSeconds / (distanceM / 1_000)) : null;
  const bestPaceSecondsPerKm = splits.length > 0
    ? Math.min(...splits.map((split) => split.paceSecondsPerKm))
    : null;
  const speeds = included.map((point) => point.segmentSpeedMps).filter((speed): speed is number => speed != null && speed > 0);

  return {
    points: points.map((point) => ({
      ...point,
      segmentDistanceM: round(point.segmentDistanceM),
      segmentDurationS: round(point.segmentDurationS, 3),
      segmentSpeedMps: point.segmentSpeedMps == null ? null : round(point.segmentSpeedMps, 3),
    })),
    splits,
    distanceM: round(distanceM),
    excludedDistanceM: round(excludedDistanceM),
    movingSeconds: Math.round(movingSeconds),
    averagePaceSecondsPerKm,
    bestPaceSecondsPerKm,
    averageSpeedMps: movingSeconds > 0 ? round(distanceM / movingSeconds, 3) : null,
    maxSpeedMps: speeds.length > 0 ? round(Math.max(...speeds), 3) : null,
    classification,
    isCounted,
    validationReason,
  };
}
