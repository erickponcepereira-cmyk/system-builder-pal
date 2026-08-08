import { describe, expect, it } from "vitest";
import { analyzeRunningSamples } from "@/lib/running-metrics";

const METERS_PER_LONGITUDE_DEGREE_AT_EQUATOR = 111_320;

function sampleAt({ meters, seconds, accuracyM = 5 }: { meters: number; seconds: number; accuracyM?: number }) {
  return {
    capturedAt: seconds * 1_000,
    latitude: 0,
    longitude: meters / METERS_PER_LONGITUDE_DEGREE_AT_EQUATOR,
    accuracyM,
    altitudeM: null,
    speedMps: null,
    headingDegrees: null,
  };
}

describe("analyzeRunningSamples", () => {
  it("contabiliza uma corrida plausível", () => {
    const result = analyzeRunningSamples([
      sampleAt({ meters: 0, seconds: 0 }),
      sampleAt({ meters: 100, seconds: 30 }),
      sampleAt({ meters: 200, seconds: 60 }),
      sampleAt({ meters: 300, seconds: 90 }),
    ]);

    expect(result.classification).toBe("run");
    expect(result.isCounted).toBe(true);
    expect(result.distanceM).toBeGreaterThan(295);
    expect(result.excludedDistanceM).toBe(0);
  });

  it("exclui uma sequência sustentada de veículo", () => {
    const points = Array.from({ length: 7 }, (_, index) => sampleAt({
      meters: index * 60,
      seconds: index * 5,
    }));
    const result = analyzeRunningSamples(points);

    expect(result.classification).toBe("vehicle_suspected");
    expect(result.isCounted).toBe(false);
    expect(result.distanceM).toBe(0);
    expect(result.excludedDistanceM).toBeGreaterThan(300);
  });

  it("não soma um ponto de GPS impreciso", () => {
    const result = analyzeRunningSamples([
      sampleAt({ meters: 0, seconds: 0 }),
      sampleAt({ meters: 100, seconds: 30, accuracyM: 80 }),
      sampleAt({ meters: 110, seconds: 60 }),
    ]);

    expect(result.points[1].qualityStatus).toBe("ignored_accuracy");
    expect(result.distanceM).toBeGreaterThan(100);
    expect(result.distanceM).toBeLessThan(120);
  });
});
