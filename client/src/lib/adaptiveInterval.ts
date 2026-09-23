/**
 * Cálculo de Amostragem GPS Adaptativa (Versão 6.3.2 - Issue #6)
 *
 * Regra: Frequência inversamente proporcional à velocidade em deslocamento.
 * - Quanto menor a velocidade, maior a frequência de pontos (intervalo de tempo menor em segundos).
 * - Quanto maior a velocidade, menor a frequência de pontos (intervalo de tempo maior em segundos).
 */

export interface AdaptiveIntervalConfig {
  baseIntervalSeconds?: number;
}

/**
 * Calcula o intervalo ideal de coleta em segundos com base na velocidade instantânea em km/h.
 *
 * Escala calibrada:
 * - v <= 3,0 km/h: Pausa / marcha lenta (mantém base, tratada pelo detector de pausas)
 * - 3,0 < v <= 12,0 km/h: 2s (30 pts/min - manobras, curvas de esquina, caminhada rápida)
 * - 12,0 < v <= 25,0 km/h: 3s (20 pts/min - trânsito urbano residencial / quebra-molas)
 * - 25,0 < v <= 45,0 km/h: 4s (15 pts/min - avenidas urbanas e vias principais)
 * - 45,0 < v <= 70,0 km/h: 6s (10 pts/min - vias arteriais e tráfego fluido)
 * - v > 70,0 km/h: 8s (7,5 pts/min - rodovias em velocidade de cruzeiro)
 *
 * @param speedKmh Velocidade instantânea do veículo em km/h
 * @param baseIntervalSeconds Intervalo base configurado pelo usuário (padrão: 2s)
 * @returns Intervalo dinâmico em segundos (inteiro >= 1)
 */
export function calculateAdaptiveInterval(
  speedKmh: number,
  baseIntervalSeconds: number = 2
): number {
  const base = Math.max(1, Math.round(baseIntervalSeconds || 2));

  // Velocidade nula ou de parada (tratada pela regra de pausa separadamente)
  if (!Number.isFinite(speedKmh) || speedKmh <= 3.0) {
    return base;
  }

  // 1. Baixa velocidade: 3.1 a 12.0 km/h
  // Frequência alta (intervalo de 2s) para máxima resolução em curvas e manobras
  if (speedKmh <= 12.0) {
    return Math.max(2, base);
  }

  // 2. Velocidade urbana local: 12.1 a 25.0 km/h
  // Frequência média-alta (intervalo de 3s)
  if (speedKmh <= 25.0) {
    return Math.max(3, Math.round(base * 1.5));
  }

  // 3. Vias arteriais e avenidas: 25.1 a 45.0 km/h
  // Frequência média (intervalo de 4s)
  if (speedKmh <= 45.0) {
    return Math.max(4, Math.round(base * 2.0));
  }

  // 4. Vias expressas / início de rodovia: 45.1 a 70.0 km/h
  // Frequência moderada (intervalo de 6s)
  if (speedKmh <= 70.0) {
    return Math.max(6, Math.round(base * 3.0));
  }

  // 5. Rodovias em velocidade de cruzeiro: > 70.0 km/h
  // Frequência reduzida (intervalo de 8s, mantendo teto seguro para curvas de rodovia)
  return Math.max(8, Math.round(base * 4.0));
}

/**
 * Avalia se houve mudança angular de direção (curva fechada) que justifique
 * antecipar o registro antes do intervalo normal de tempo.
 *
 * @param bearingDeltaDegrees Diferença angular em graus entre leituras consecutivas (0° a 180°)
 * @param distanceMeters Distância percorrida desde o último ponto registrado
 * @param elapsedSeconds Segundos decorridos desde o último ponto registrado
 */
export function shouldForcePointOnCurvature(
  bearingDeltaDegrees: number,
  distanceMeters: number,
  elapsedSeconds: number
): boolean {
  if (elapsedSeconds < 1.0) return false;
  // Curva fechada com deflexão >= 15° e pelo menos 15 metros percorridos
  if (Math.abs(bearingDeltaDegrees) >= 15 && distanceMeters >= 15) return true;
  // Deslocamento expressivo em reta ou arco longo (>= 40m)
  if (distanceMeters >= 40 && elapsedSeconds >= 2.0) return true;
  return false;
}
