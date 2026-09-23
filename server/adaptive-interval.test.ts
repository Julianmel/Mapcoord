import { describe, it, expect } from "vitest";
import { calculateAdaptiveInterval, shouldForcePointOnCurvature } from "../client/src/lib/adaptiveInterval";

describe("calculateAdaptiveInterval", () => {
  it("mantém base quando velocidade for nula ou <= 3.0 km/h (em parada/marcha lenta)", () => {
    expect(calculateAdaptiveInterval(0, 2)).toBe(2);
    expect(calculateAdaptiveInterval(1.5, 2)).toBe(2);
    expect(calculateAdaptiveInterval(3.0, 2)).toBe(2);
  });

  it("atribui intervalo de 2s para velocidades baixas (3.1 a 12 km/h - alta frequência)", () => {
    expect(calculateAdaptiveInterval(3.6, 2)).toBe(2);
    expect(calculateAdaptiveInterval(6.7, 2)).toBe(2);
    expect(calculateAdaptiveInterval(8.6, 2)).toBe(2);
    expect(calculateAdaptiveInterval(12.0, 2)).toBe(2);
  });

  it("atribui intervalo de 3s para velocidades urbanas locais (12.1 a 25 km/h)", () => {
    expect(calculateAdaptiveInterval(15.0, 2)).toBe(3);
    expect(calculateAdaptiveInterval(20.8, 2)).toBe(3);
    expect(calculateAdaptiveInterval(25.0, 2)).toBe(3);
  });

  it("atribui intervalo de 4s para avenidas (25.1 a 45 km/h)", () => {
    expect(calculateAdaptiveInterval(30.0, 2)).toBe(4);
    expect(calculateAdaptiveInterval(31.6, 2)).toBe(4);
    expect(calculateAdaptiveInterval(42.0, 2)).toBe(4);
    expect(calculateAdaptiveInterval(45.0, 2)).toBe(4);
  });

  it("atribui intervalo de 6s para vias expressas (45.1 a 70 km/h)", () => {
    expect(calculateAdaptiveInterval(50.0, 2)).toBe(6);
    expect(calculateAdaptiveInterval(60.0, 2)).toBe(6);
    expect(calculateAdaptiveInterval(70.0, 2)).toBe(6);
  });

  it("atribui intervalo de 8s para rodovias (> 70 km/h - menor frequência)", () => {
    expect(calculateAdaptiveInterval(75.0, 2)).toBe(8);
    expect(calculateAdaptiveInterval(90.0, 2)).toBe(8);
    expect(calculateAdaptiveInterval(110.0, 2)).toBe(8);
  });
});

describe("shouldForcePointOnCurvature", () => {
  it("força ponto quando há variação angular >= 15° com deslocamento >= 15m", () => {
    expect(shouldForcePointOnCurvature(18, 16, 2.0)).toBe(true);
    expect(shouldForcePointOnCurvature(10, 16, 2.0)).toBe(false);
  });

  it("força ponto em grandes deslocamentos acumulados (>= 40m)", () => {
    expect(shouldForcePointOnCurvature(5, 45, 2.5)).toBe(true);
  });

  it("não força se decorreu menos de 1 segundo", () => {
    expect(shouldForcePointOnCurvature(30, 50, 0.5)).toBe(false);
  });
});
