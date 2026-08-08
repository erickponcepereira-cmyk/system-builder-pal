import { Capacitor } from "@capacitor/core";

export type ForegroundLocationPoint = {
  capturedAt: number;
  latitude: number;
  longitude: number;
  accuracyM: number;
  altitudeM: number | null;
  speedMps: number | null;
  headingDegrees: number | null;
};

export type ForegroundLocationWatch = {
  stop: () => Promise<void>;
};

export type StartForegroundLocationWatchOptions = {
  onPoint: (point: ForegroundLocationPoint) => void;
  onError: (message: string) => void;
};

function toPoint(position: GeolocationPosition | {
  timestamp: number;
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    speed: number | null;
    heading: number | null;
  };
}): ForegroundLocationPoint {
  return {
    capturedAt: position.timestamp || Date.now(),
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyM: position.coords.accuracy,
    altitudeM: position.coords.altitude ?? null,
    speedMps: position.coords.speed ?? null,
    headingDegrees: position.coords.heading ?? null,
  };
}

function locationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/denied|permission/i.test(message)) return "Permita a localização precisa para registrar a corrida.";
  if (/disabled|location services/i.test(message)) return "Ative a localização do aparelho para registrar a corrida.";
  return "Não foi possível obter a localização. Tente novamente em uma área aberta.";
}

/**
 * Inicia GPS somente enquanto esta tela estiver ativa. Este módulo não pede
 * permissão de segundo plano e não tenta continuar a corrida com o app fechado.
 */
export async function startForegroundLocationWatch(
  options: StartForegroundLocationWatchOptions,
): Promise<ForegroundLocationWatch> {
  if (Capacitor.isNativePlatform()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    let permission = await Geolocation.checkPermissions();
    if (permission.location === "prompt" || permission.location === "prompt-with-rationale") {
      permission = await Geolocation.requestPermissions({ permissions: ["location"] });
    }
    if (permission.location !== "granted") {
      throw new Error("Location permission denied");
    }

    const id = await Geolocation.watchPosition(
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
        minimumUpdateInterval: 5_000,
        interval: 5_000,
        enableLocationFallback: true,
      },
      (position, error) => {
        if (error || !position) {
          options.onError(locationErrorMessage(error));
          return;
        }
        options.onPoint(toPoint(position));
      },
    );
    return { stop: () => Geolocation.clearWatch({ id }) };
  }

  if (!navigator.geolocation) {
    throw new Error("Location is not available");
  }

  const id = navigator.geolocation.watchPosition(
    (position) => options.onPoint(toPoint(position)),
    (error) => options.onError(locationErrorMessage(error)),
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15_000,
    },
  );

  return {
    stop: async () => navigator.geolocation.clearWatch(id),
  };
}
