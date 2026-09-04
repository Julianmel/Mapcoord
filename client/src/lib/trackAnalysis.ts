export interface TrackPoint {
  timestamp: Date;
  lat: number;
  lng: number;
  speedKmh?: number;
  bearingDegrees?: number;
  altitudeMeters?: number;
  accuracyMeters?: number;
  segmentDistanceMeters?: number;
  timeSincePreviousSeconds?: number;
  observation?: string;
}

export interface TrackMetrics {
  pointsCount: number;
  firstTimestamp?: Date;
  lastTimestamp?: Date;
  durationSeconds: number;
  movingSeconds: number;
  totalDistanceMeters: number;
  totalDistanceKm: number;
  averageSpeedKmh: number;
  maxReportedSpeedKmh?: number;
  averageReportedSpeedKmh?: number;
  averageSegmentDistanceMeters?: number;
  averageSegmentTimeSeconds?: number;
  averageAccuracyMeters?: number;
  largestGapSeconds: number;
  stationaryStopsCount: number;
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function parseTrackLog(data: string): TrackPoint[] {
  const lines = data.split(/\r?\n+/);
  const points: TrackPoint[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/^;\s*/, "").trim();
    if (!line) continue;

    const tsMatch = line.match(/\[(\d{14})\]/);
    let timestamp = new Date();
    if (tsMatch) {
      const raw = tsMatch[1];
      timestamp = new Date(
        Number(raw.slice(0, 4)),
        Number(raw.slice(4, 6)) - 1,
        Number(raw.slice(6, 8)),
        Number(raw.slice(8, 10)),
        Number(raw.slice(10, 12)),
        Number(raw.slice(12, 14))
      );
    }

    const coordMatch = line.match(/(-?\d{1,3}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/);
    if (!coordMatch) continue;

    const lat = Number(coordMatch[1]);
    const lng = Number(coordMatch[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      continue;
    }

    const read = (label: string): number | undefined => {
      const found = line.match(new RegExp(label + "=(-?\\d+(?:\\.\\d+)?)"));
      return found ? Number(found[1]) : undefined;
    };

    points.push({
      timestamp,
      lat,
      lng,
      speedKmh: read("velocidade"),
      bearingDegrees: read("direção"),
      altitudeMeters: read("altitude"),
      accuracyMeters: read("precisão"),
      segmentDistanceMeters: read("distância_segmento"),
      timeSincePreviousSeconds: read("tempo_desde_anterior"),
      observation: line.includes("permanência") ? "permanência" : "intervalo",
    });
  }

  return points;
}

export function computeTrackMetrics(data: string): TrackMetrics | null {
  const points = parseTrackLog(data);
  if (points.length === 0) return null;

  let totalMeters = 0;
  let movingSeconds = 0;
  let largestGapSeconds = 0;
  let stationaryStopsCount = 0;

  for (let i = 1; i < points.length; i++) {
    const gap = Math.max(0, (points[i].timestamp.getTime() - points[i - 1].timestamp.getTime()) / 1000);
    largestGapSeconds = Math.max(largestGapSeconds, gap);

    const dist = distanceMeters(points[i - 1], points[i]);
    if (dist < 3.0) {
      stationaryStopsCount++;
    }

    if (gap > 0 && gap <= 60) {
      totalMeters += dist;
      movingSeconds += gap;
    }
  }

  const durationSeconds = Math.max(
    0,
    (points[points.length - 1].timestamp.getTime() - points[0].timestamp.getTime()) / 1000
  );
  const averageSpeedKmh = movingSeconds > 0 ? (totalMeters / movingSeconds) * 3.6 : 0;

  const segmentDistances = points
    .map((p) => p.segmentDistanceMeters)
    .filter((v): v is number => v !== undefined && Number.isFinite(v));
  const recordedSegmentTimes = points
    .map((p) => p.timeSincePreviousSeconds)
    .filter((v): v is number => v !== undefined && Number.isFinite(v));
  const reportedSpeeds = points
    .map((p) => p.speedKmh)
    .filter((v): v is number => v !== undefined && Number.isFinite(v));
  const accuracyValues = points
    .map((p) => p.accuracyMeters)
    .filter((v): v is number => v !== undefined && Number.isFinite(v));

  return {
    pointsCount: points.length,
    firstTimestamp: points[0].timestamp,
    lastTimestamp: points[points.length - 1].timestamp,
    durationSeconds,
    movingSeconds,
    totalDistanceMeters: totalMeters,
    totalDistanceKm: totalMeters / 1000,
    averageSpeedKmh,
    maxReportedSpeedKmh: reportedSpeeds.length ? Math.max(...reportedSpeeds) : undefined,
    averageReportedSpeedKmh: reportedSpeeds.length
      ? reportedSpeeds.reduce((a, b) => a + b, 0) / reportedSpeeds.length
      : undefined,
    averageSegmentDistanceMeters: segmentDistances.length
      ? segmentDistances.reduce((a, b) => a + b, 0) / segmentDistances.length
      : undefined,
    averageSegmentTimeSeconds: recordedSegmentTimes.length
      ? recordedSegmentTimes.reduce((a, b) => a + b, 0) / recordedSegmentTimes.length
      : undefined,
    averageAccuracyMeters: accuracyValues.length
      ? accuracyValues.reduce((a, b) => a + b, 0) / accuracyValues.length
      : undefined,
    largestGapSeconds,
    stationaryStopsCount,
  };
}

export function formatTrackSummary(metrics: TrackMetrics): string {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      return hours + "h " + remMins + "min " + secs + "s";
    }
    return mins > 0 ? mins + "min " + secs + "s" : secs + "s";
  };

  return [
    "📊 **Resumo Analítico do Percurso:**",
    "- **Pontos registrados:** " + metrics.pointsCount,
    metrics.firstTimestamp ? "- **Início:** " + metrics.firstTimestamp.toLocaleTimeString("pt-BR") + " (" + metrics.firstTimestamp.toLocaleDateString("pt-BR") + ")" : "",
    metrics.lastTimestamp ? "- **Fim:** " + metrics.lastTimestamp.toLocaleTimeString("pt-BR") + " (" + metrics.lastTimestamp.toLocaleDateString("pt-BR") + ")" : "",
    "- **Duração total decorrida:** " + formatTime(metrics.durationSeconds),
    "- **Tempo em movimento útil:** " + formatTime(metrics.movingSeconds),
    "- **Distância acumulada:** " + metrics.totalDistanceKm.toFixed(3) + " km (" + metrics.totalDistanceMeters.toFixed(1) + " m)",
    "- **Velocidade média em movimento:** " + metrics.averageSpeedKmh.toFixed(2) + " km/h",
    metrics.maxReportedSpeedKmh !== undefined ? "- **Velocidade máxima registrada:** " + metrics.maxReportedSpeedKmh.toFixed(2) + " km/h" : "",
    metrics.averageReportedSpeedKmh !== undefined ? "- **Velocidade instantânea média:** " + metrics.averageReportedSpeedKmh.toFixed(2) + " km/h" : "",
    metrics.averageAccuracyMeters !== undefined ? "- **Precisão média do GPS:** ±" + metrics.averageAccuracyMeters.toFixed(1) + " m" : "",
    metrics.largestGapSeconds > 10 ? "- **Maior intervalo sem dados (lacuna):** " + formatTime(metrics.largestGapSeconds) : "",
    metrics.stationaryStopsCount > 0 ? "- **Paradas/permanências detectadas:** " + metrics.stationaryStopsCount : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function answerDisplacementQuestion(question: string, logData: string): string {
  const metrics = computeTrackMetrics(logData);
  if (!metrics) {
    return "Não há registros de coordenadas válidos na área de dados. Faça uma captura ou carregue um log antes de fazer perguntas sobre o deslocamento.";
  }

  const q = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (q.includes("velocidade") || q.includes("rapido") || q.includes("km/h")) {
    const parts = [
      "🚗 **Velocidade do deslocamento:**",
      "• **Velocidade média em movimento:** " + metrics.averageSpeedKmh.toFixed(2) + " km/h (calculada considerando segmentos ativos de até 60s).",
    ];
    if (metrics.maxReportedSpeedKmh !== undefined) {
      parts.push("• **Maior velocidade instantânea:** " + metrics.maxReportedSpeedKmh.toFixed(2) + " km/h.");
    }
    if (metrics.averageReportedSpeedKmh !== undefined) {
      parts.push("• **Velocidade instantânea média reportada pelo sensor GPS:** " + metrics.averageReportedSpeedKmh.toFixed(2) + " km/h.");
    }
    return parts.join("\n");
  }

  if (q.includes("distancia") || q.includes("km") || q.includes("metros") || q.includes("quilometro") || q.includes("longe")) {
    return [
      "📏 **Distância percorrida:**",
      "• **Distância total acumulada:** " + metrics.totalDistanceKm.toFixed(3) + " km (" + metrics.totalDistanceMeters.toFixed(1) + " metros).",
      metrics.averageSegmentDistanceMeters !== undefined
        ? "• **Distância média por ponto:** " + metrics.averageSegmentDistanceMeters.toFixed(1) + " metros."
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (q.includes("tempo") || q.includes("duracao") || q.includes("minuto") || q.includes("segundo") || q.includes("hora") || q.includes("inicio") || q.includes("fim")) {
    const mins = Math.floor(metrics.durationSeconds / 60);
    const secs = Math.round(metrics.durationSeconds % 60);
    return [
      "⏱️ **Tempo do percurso:**",
      "• **Início:** " + (metrics.firstTimestamp ? metrics.firstTimestamp.toLocaleTimeString("pt-BR") : ""),
      "• **Fim:** " + (metrics.lastTimestamp ? metrics.lastTimestamp.toLocaleTimeString("pt-BR") : ""),
      "• **Duração total:** " + (mins > 0 ? mins + " min e " : "") + secs + " segundos.",
      "• **Tempo efetivo de deslocamento:** " + Math.round(metrics.movingSeconds) + " segundos.",
    ].join("\n");
  }

  if (q.includes("lacuna") || q.includes("falha") || q.includes("perda") || q.includes("sinal") || q.includes("parada") || q.includes("precisao")) {
    return [
      "🛰️ **Qualidade e Estabilidade do GPS:**",
      "- **Maior intervalo sem dados (lacuna):** " + Math.round(metrics.largestGapSeconds) + " segundos.",
      metrics.averageAccuracyMeters !== undefined
        ? "- **Precisão média do sinal:** ±" + metrics.averageAccuracyMeters.toFixed(1) + " metros."
        : "",
      metrics.stationaryStopsCount > 0
        ? "- **Registros em repouso/parada:** " + metrics.stationaryStopsCount + " ponto(s)."
        : "",
      "\n💡 *Dica:* Lacunas prolongadas durante a captura no celular geralmente ocorrem por otimização agressiva de bateria do Android ou perda temporária de visada com os satélites GPS.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return formatTrackSummary(metrics);
}
