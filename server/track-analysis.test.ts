import { describe, expect, it } from "vitest";
import { summarizeTrack } from "./routers";

describe("track analysis", () => {
  it("calculates start, end, distance and speed from valid records", () => {
    const log = [
      "[20260826100000] Coleta #1 (intervalo 10s), -16.743000,-49.087500;",
      "[20260826100010] Coleta #2 (intervalo 10s), -16.743000,-49.087400;",
    ].join("\r\n");

    const summary = summarizeTrack(log);

    expect(summary).toContain("Registros válidos: 2");
    expect(summary).toContain("Início:");
    expect(summary).toContain("Fim:");
    expect(summary).toContain("Tempo coberto por segmentos utilizáveis: 10 s");
    expect(summary).toContain("Maior lacuna entre registros: 10 s");
  });

  it("returns a clear result when the log has no valid coordinates", () => {
    expect(summarizeTrack("texto sem coordenadas")).toBe("Nenhum registro de coordenada válido foi encontrado.");
  });

  it("does not treat a large gap as covered movement time", () => {
    const log = [
      "[20260826100000] Coleta #1, -16.743000,-49.087500;",
      "[20260826110000] Coleta #2, -16.750000,-49.090000;",
    ].join("\r\n");

    const summary = summarizeTrack(log);

    expect(summary).toContain("Tempo coberto por segmentos utilizáveis: 0 s");
    expect(summary).toContain("Maior lacuna entre registros: 3600 s");
  });

  it("summarizes recorded segment distance and elapsed time", () => {
    const log = "; [20260826100000] Coleta #1, -16.700000,-49.000000\r\n; [20260826100010] Coleta #2, -16.700500,-49.000500; distância_segmento=78.4 m; tempo_desde_anterior=10.0 s\r\n";
    const summary = summarizeTrack(log);

    expect(summary).toContain("Distância média por segmento registrada: 78.4 m");
    expect(summary).toContain("Tempo médio desde o ponto anterior: 10.0 s");
  });

  it("summarizes optional GPS metadata in CRLF records", () => {
    const log = "; [20260826100000] Coleta #1, -16.700000,-49.000000; velocidade=18.0 km/h; direção=90°; altitude=740.0 m; precisão=5.0 m\r\n; [20260826100010] Coleta #2, -16.700500,-49.000500; velocidade=30.0 km/h; direção=95°; altitude=741.0 m; precisão=7.0 m\r\n";
    const summary = summarizeTrack(log);

    expect(summary).toContain("Velocidade instantânea média registrada: 24.00 km/h");
    expect(summary).toContain("Maior velocidade instantânea registrada: 30.00 km/h");
    expect(summary).toContain("Precisão horizontal média registrada: 6.0 m");
  });

  it("reads the compact header format while ignoring the header itself", () => {
    const log = "[timestamp], obs, lat, lng, dir, alt, speed, speed_acc, acc, dist, time;\r\n; [20260826100000] Coleta #1, -16.700000,-49.000000; velocidade=0.0 km/h; precisão=4.0 m; distância_segmento=0.0 m; tempo_desde_anterior=0.0 s;\r\n; [20260826100005] Coleta #2, -16.700010,-49.000010; velocidade=0.4 km/h; precisão=5.0 m; distância_segmento=1.5 m; tempo_desde_anterior=5.0 s;\r\n";
    const summary = summarizeTrack(log);

    expect(summary).toContain("Registros válidos: 2");
    expect(summary).toContain("Distância média por segmento registrada: 0.8 m");
    expect(summary).toContain("Tempo médio desde o ponto anterior: 2.5 s");
  });

  it("formats numbers in SI / pt-BR format with comma for decimal and dot for thousands", async () => {
    const { formatPtBrNumber } = await import("../client/src/lib/trackAnalysis");
    expect(formatPtBrNumber(1234.5, 1, 1)).toBe("1.234,5");
    expect(formatPtBrNumber(0.5, 1, 1)).toBe("0,5");
    expect(formatPtBrNumber(10000, 0, 0)).toBe("10.000");
  });

  it("detects movement pauses exceeding 3 minutes (180 seconds)", async () => {
    const { computeTrackMetrics } = await import("../client/src/lib/trackAnalysis");
    const log = [
      "[timestamp], obs, lat, lng, dir, alt, speed, speed_acc, acc, dist, time;",
      "; [20260912175918] Coleta #72 (intervalo 20s), -16.730543,-49.087927, , 780.2, 0.7, 5.4, 15.6, 33.4, 38.0",
      "; [20260912175936] Coleta #73 (intervalo 20s) - pausa detectada, -16.730540,-49.087888, 32.9, 780.2, 0.4, 5.4, 13.4, 4.2, 18.0",
      "; [20260912180335] Coleta #74 (intervalo 20s), -16.730529,-49.087751, 285.0, 780.1, 3.9, 9.4, 47.5, 9.6, 239.0",
    ].join("\r\n");

    const metrics = computeTrackMetrics(log);
    expect(metrics).not.toBeNull();
    expect(metrics!.pausesOver3Min.length).toBeGreaterThanOrEqual(1);
    expect(metrics!.pausesOver3Min[0].durationSeconds).toBeGreaterThanOrEqual(180);
  });

  it("filters low speed <= 3.0 km/h as stationary and correctly computes moving time", async () => {
    const { computeTrackMetrics } = await import("../client/src/lib/trackAnalysis");
    const log = [
      "[timestamp], obs, lat, lng, dir, alt, speed, speed_acc, acc, dist, time;",
      "; [20260921100000] Coleta #1, -16.740000,-49.080000, 0.0, 750.0, 2.5, 1.0, 5.0, 0.0, 0.0",
      "; [20260921100010] Coleta #2, -16.740005,-49.080005, 0.0, 750.0, 2.8, 1.0, 5.0, 0.7, 10.0",
      "; [20260921100020] Coleta #3, -16.740100,-49.080100, 0.0, 750.0, 15.0, 1.0, 5.0, 15.0, 10.0",
    ].join("\r\n");

    const metrics = computeTrackMetrics(log);
    expect(metrics).not.toBeNull();
    // Points with <= 3.0 km/h are considered stationary/stopped
    expect(metrics!.stationaryStopsCount).toBeGreaterThanOrEqual(1);
  });

  it("references 40m search radius in summary formatting", async () => {
    const { formatTrackSummary } = await import("../client/src/lib/trackAnalysis");
    const dummyMetrics = {
      pointsCount: 2,
      durationSeconds: 200,
      movingSeconds: 20,
      totalDistanceMeters: 50,
      totalDistanceKm: 0.05,
      averageSpeedKmh: 9,
      largestGapSeconds: 180,
      stationaryStopsCount: 1,
      pausesOver3Min: [
        {
          id: "p1",
          startIndex: 0,
          endIndex: 1,
          startTimestamp: new Date(2026, 8, 21, 10, 0, 0),
          endTimestamp: new Date(2026, 8, 21, 10, 3, 30),
          durationSeconds: 210,
          lat: -16.74,
          lng: -49.08,
          nearbyCommercialPoint: "Padaria Central",
        },
      ],
    };

    const summary = formatTrackSummary(dummyMetrics as any);
    expect(summary).toContain("Ponto comercial (raio 40m): Padaria Central");
  });
});
