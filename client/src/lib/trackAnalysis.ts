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

export interface TrackPause {
  id: string;
  startIndex: number;
  endIndex: number;
  startTimestamp: Date;
  endTimestamp: Date;
  durationSeconds: number;
  lat: number;
  lng: number;
  observation?: string;
  nearbyCommercialPoint?: string;
  distanceFromCommercialMeters?: number;
  commercialAddress?: string;
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
  pausesOver3Min: TrackPause[];
}

/**
 * Formata números no padrão brasileiro / Sistema Internacional:
 * vírgula para casas decimais e ponto para milhares (ex.: 1.234,5).
 */
export function formatPtBrNumber(value: number, minDecimals = 1, maxDecimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

/**
 * Formata duração em segundos no padrão legível pt-BR.
 */
export function formatTimePtBr(seconds: number): string {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const mins = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  if (hours > 0) {
    return `${hours}h ${mins}min ${secs}s`;
  }
  if (mins > 0) {
    return `${mins}min ${secs}s`;
  }
  return `${secs}s`;
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
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

    // Extrai observação textual entre o timestamp e a coordenada
    let observation = "";
    if (tsMatch) {
      const afterTs = line.slice(line.indexOf(tsMatch[0]) + tsMatch[0].length);
      const coordPos = afterTs.indexOf(coordMatch[0]);
      if (coordPos >= 0) {
        observation = afterTs.slice(0, coordPos).replace(/^[,\s;]+|[,\s;]+$/g, "").trim();
      }
    }

    const read = (label: string): number | undefined => {
      const found = line.match(new RegExp(label + "=(-?\\d+(?:\\.\\d+)?)"));
      return found ? Number(found[1]) : undefined;
    };

    // Suporte a metadados posicionais CSV padrão: , dir, alt, speed, speed_acc, acc, dist, time;
    const matchIndex = line.indexOf(coordMatch[0]);
    const remainder = line.slice(matchIndex + coordMatch[0].length).replace(/;+$/, "").trim();
    const csvTokens = remainder.startsWith(",")
      ? remainder.slice(1).split(",").map((t) => t.trim())
      : [];

    const getCsvNum = (idx: number): number | undefined => {
      if (idx < csvTokens.length) {
        const val = Number(csvTokens[idx]);
        if (Number.isFinite(val)) return val;
      }
      return undefined;
    };

    const bearingDegrees = read("direção") ?? getCsvNum(0);
    const altitudeMeters = read("altitude") ?? getCsvNum(1);
    const speedKmh = read("velocidade") ?? getCsvNum(2);
    const accuracyMeters = read("precisão") ?? getCsvNum(4);
    const segmentDistanceMeters = read("distância_segmento") ?? getCsvNum(5);
    const timeSincePreviousSeconds = read("tempo_desde_anterior") ?? getCsvNum(6);

    points.push({
      timestamp,
      lat,
      lng,
      speedKmh,
      bearingDegrees,
      altitudeMeters,
      accuracyMeters,
      segmentDistanceMeters,
      timeSincePreviousSeconds,
      observation: observation || (line.includes("permanência") ? "permanência" : "intervalo"),
    });
  }

  return points;
}

/**
 * Identifica paradas/pausas no deslocamento superiores a 3 minutos (180 segundos).
 */
export function findTrackPauses(points: TrackPoint[]): TrackPause[] {
  const pauses: TrackPause[] = [];
  if (points.length < 2) return pauses;

  // 1. Pausas por intervalo/lacuna temporal onde a posição permaneceu a mesma (distância <= 35m)
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const gap = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
    const dist = distanceMeters(prev, curr);

    if (gap >= 180 && dist <= 35) {
      pauses.push({
        id: `pause-gap-${i}`,
        startIndex: i - 1,
        endIndex: i,
        startTimestamp: prev.timestamp,
        endTimestamp: curr.timestamp,
        durationSeconds: gap,
        lat: prev.lat,
        lng: prev.lng,
        observation: prev.observation || "pausa detectada",
      });
    }
  }

  // 2. Pausas por permanência prolongada num mesmo local (cluster com raio <= 25m por >= 180s)
  let clusterStart = 0;
  for (let i = 1; i < points.length; i++) {
    const distFromAnchor = distanceMeters(points[clusterStart], points[i]);
    if (distFromAnchor > 25) {
      const dur = (points[i - 1].timestamp.getTime() - points[clusterStart].timestamp.getTime()) / 1000;
      if (dur >= 180) {
        // Evita duplicar se já foi adicionado como gap
        const alreadyExists = pauses.some(
          (p) => Math.abs(p.startTimestamp.getTime() - points[clusterStart].timestamp.getTime()) < 30000
        );
        if (!alreadyExists) {
          pauses.push({
            id: `pause-cluster-${clusterStart}`,
            startIndex: clusterStart,
            endIndex: i - 1,
            startTimestamp: points[clusterStart].timestamp,
            endTimestamp: points[i - 1].timestamp,
            durationSeconds: dur,
            lat: points[clusterStart].lat,
            lng: points[clusterStart].lng,
            observation: points[clusterStart].observation || "permanência prolongada",
          });
        }
      }
      clusterStart = i;
    }
  }

  // Verifica se o último trecho permaneceu parado até o fim
  const finalDur = (points[points.length - 1].timestamp.getTime() - points[clusterStart].timestamp.getTime()) / 1000;
  if (finalDur >= 180) {
    const alreadyExists = pauses.some(
      (p) => Math.abs(p.startTimestamp.getTime() - points[clusterStart].timestamp.getTime()) < 30000
    );
    if (!alreadyExists) {
      pauses.push({
        id: `pause-cluster-end-${clusterStart}`,
        startIndex: clusterStart,
        endIndex: points.length - 1,
        startTimestamp: points[clusterStart].timestamp,
        endTimestamp: points[points.length - 1].timestamp,
        durationSeconds: finalDur,
        lat: points[clusterStart].lat,
        lng: points[clusterStart].lng,
        observation: points[clusterStart].observation || "permanência ao fim",
      });
    }
  }

  return pauses;
}

/**
 * Consulta estabelecimento comercial próximo (em raio de 3 a 15 metros) via Overpass / Nominatim.
 */
export async function fetchNearbyCommercialPoint(
  lat: number,
  lng: number
): Promise<{ name: string; type?: string; distanceMeters?: number; fullAddress?: string }> {
  try {
    // 1. Tenta Overpass API procurando nós comerciais próximos (shop, amenity, commercial, office)
    const overpassQuery = `[out:json][timeout:6];(node(around:20,${lat},${lng})["shop"];node(around:20,${lat},${lng})["amenity"];node(around:20,${lat},${lng})["commercial"];node(around:20,${lat},${lng})["office"];way(around:20,${lat},${lng})["shop"];);out center 3;`;
    const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(overpassUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.elements && data.elements.length > 0) {
        let bestElement = data.elements[0];
        let minD = 999;
        for (const el of data.elements) {
          const elLat = el.lat ?? el.center?.lat;
          const elLng = el.lon ?? el.center?.lon;
          if (elLat && elLng) {
            const d = distanceMeters({ lat, lng }, { lat: elLat, lng: elLng });
            if (d < minD) {
              minD = d;
              bestElement = el;
            }
          }
        }

        const tags = bestElement.tags || {};
        const name = tags.name || tags.brand || tags.operator;
        const category = tags.shop || tags.amenity || tags.commercial || tags.office || "Comércio";
        if (name) {
          return {
            name,
            type: category,
            distanceMeters: Math.round(minD * 10) / 10,
          };
        }
      }
    }
  } catch {
    // Se Overpass falhar, segue para Nominatim reverse geocode
  }

  // 2. Fallback para Nominatim reverse geocode detalhado
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=19&addressdetails=1&extratags=1`;
    const res = await fetch(nominatimUrl, {
      headers: { "User-Agent": "Mapcoord/6.3 (mapcoord@app)" },
    });
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const road = addr.road || addr.pedestrian || addr.suburb || "Localidade";
      const suburb = addr.suburb || addr.city_district || "";
      const city = addr.city || addr.town || "";
      const addressParts = [road, suburb, city].filter(Boolean).join(", ");

      const extratags = data.extratags || {};
      const poiName = extratags.name || (data.category === "amenity" || data.category === "shop" ? data.name : undefined);

      if (poiName) {
        return {
          name: poiName,
          type: data.type || "Comércio",
          distanceMeters: 3,
          fullAddress: addressParts,
        };
      }

      return {
        name: `Nenhum comércio cadastrado a 3 m (Próximo a: ${addressParts})`,
        fullAddress: addressParts,
      };
    }
  } catch {
    // Falha de rede
  }

  return {
    name: "Nenhum ponto comercial cadastrado no raio de 3 m",
  };
}

export function computeTrackMetrics(data: string): TrackMetrics | null {
  const points = parseTrackLog(data);
  if (points.length === 0) return null;

  let totalMeters = 0;
  let movingSeconds = 0;
  let largestGapSeconds = 0;
  let stationaryStopsCount = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const gap = Math.max(0, (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000);
    largestGapSeconds = Math.max(largestGapSeconds, gap);

    const dist = distanceMeters(prev, curr);
    const derivedSpeedKmh = gap > 0 ? (dist / gap) * 3.6 : 0;
    const isPaused = curr.observation?.includes("pausa detectada") || curr.speedKmh === 0;

    // Se a distância for menor que 2.0m ou velocidade quase nula, conta como parada
    if (dist < 2.5 || (curr.speedKmh !== undefined && curr.speedKmh < 1.0)) {
      stationaryStopsCount++;
    }

    // Filtra anomalias de teletransporte (velocidade > 25 km/h para caminhada em gaps curtos <= 40s)
    // e evita acumular jitter durante pausas paradas (< 1.5m)
    const isTeleportAnomaly = derivedSpeedKmh > 25 && gap <= 40 && dist > 80;
    const isStationaryJitter = dist < 1.8 && derivedSpeedKmh < 1.0;

    if (gap > 0 && gap <= 60 && !isTeleportAnomaly) {
      if (!isStationaryJitter) {
        totalMeters += dist;
      }
      if (!isPaused && derivedSpeedKmh >= 1.0) {
        movingSeconds += gap;
      }
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

  const pausesOver3Min = findTrackPauses(points);

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
    pausesOver3Min,
  };
}

export function formatTrackSummary(metrics: TrackMetrics): string {
  const summaryLines = [
    "📊 **Resumo Analítico do Percurso:**",
    "- **Pontos registrados:** " + formatPtBrNumber(metrics.pointsCount, 0, 0),
    metrics.firstTimestamp
      ? "- **Início:** " + metrics.firstTimestamp.toLocaleTimeString("pt-BR") + " (" + metrics.firstTimestamp.toLocaleDateString("pt-BR") + ")"
      : "",
    metrics.lastTimestamp
      ? "- **Fim:** " + metrics.lastTimestamp.toLocaleTimeString("pt-BR") + " (" + metrics.lastTimestamp.toLocaleDateString("pt-BR") + ")"
      : "",
    "- **Duração total decorrida:** " + formatTimePtBr(metrics.durationSeconds),
    "- **Tempo em movimento útil:** " + formatTimePtBr(metrics.movingSeconds),
    "- **Distância acumulada:** " + formatPtBrNumber(metrics.totalDistanceKm, 2, 3) + " km (" + formatPtBrNumber(metrics.totalDistanceMeters, 1, 1) + " m)",
    "- **Velocidade média em movimento:** " + formatPtBrNumber(metrics.averageSpeedKmh, 1, 2) + " km/h",
    metrics.maxReportedSpeedKmh !== undefined
      ? "- **Velocidade máxima registrada:** " + formatPtBrNumber(metrics.maxReportedSpeedKmh, 1, 2) + " km/h"
      : "",
    metrics.averageReportedSpeedKmh !== undefined
      ? "- **Velocidade instantânea média:** " + formatPtBrNumber(metrics.averageReportedSpeedKmh, 1, 2) + " km/h"
      : "",
    metrics.averageAccuracyMeters !== undefined
      ? "- **Precisão média do GPS:** ±" + formatPtBrNumber(metrics.averageAccuracyMeters, 1, 1) + " m"
      : "",
    metrics.largestGapSeconds > 10
      ? "- **Maior intervalo sem dados (lacuna):** " + formatTimePtBr(metrics.largestGapSeconds)
      : "",
    metrics.stationaryStopsCount > 0
      ? "- **Paradas/permanências detectadas:** " + formatPtBrNumber(metrics.stationaryStopsCount, 0, 0)
      : "",
  ];

  if (metrics.pausesOver3Min && metrics.pausesOver3Min.length > 0) {
    summaryLines.push(
      "",
      `⏸️ **Pausas no Movimento Superiores a 3 Minutos (${metrics.pausesOver3Min.length}):**`
    );
    metrics.pausesOver3Min.forEach((p, idx) => {
      const dur = formatTimePtBr(p.durationSeconds);
      const start = p.startTimestamp.toLocaleTimeString("pt-BR");
      const end = p.endTimestamp.toLocaleTimeString("pt-BR");
      const coords = `${formatPtBrNumber(p.lat, 6, 6)}, ${formatPtBrNumber(p.lng, 6, 6)}`;
      const poi = p.nearbyCommercialPoint ? ` — Ponto comercial (raio 3m): ${p.nearbyCommercialPoint}` : "";
      summaryLines.push(`  ${idx + 1}. Das ${start} às ${end} (${dur}) em [${coords}]${poi}`);
    });
  }

  return summaryLines.filter(Boolean).join("\n");
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
      "• **Velocidade média em movimento:** " + formatPtBrNumber(metrics.averageSpeedKmh, 1, 2) + " km/h (calculada considerando segmentos ativos de até 60s).",
    ];
    if (metrics.maxReportedSpeedKmh !== undefined) {
      parts.push("• **Maior velocidade instantânea:** " + formatPtBrNumber(metrics.maxReportedSpeedKmh, 1, 2) + " km/h.");
    }
    if (metrics.averageReportedSpeedKmh !== undefined) {
      parts.push("• **Velocidade instantânea média reportada pelo sensor GPS:** " + formatPtBrNumber(metrics.averageReportedSpeedKmh, 1, 2) + " km/h.");
    }
    return parts.join("\n");
  }

  if (q.includes("distancia") || q.includes("km") || q.includes("metros") || q.includes("quilometro") || q.includes("longe")) {
    return [
      "📏 **Distância percorrida:**",
      "• **Distância total acumulada:** " + formatPtBrNumber(metrics.totalDistanceKm, 2, 3) + " km (" + formatPtBrNumber(metrics.totalDistanceMeters, 1, 1) + " metros).",
      metrics.averageSegmentDistanceMeters !== undefined
        ? "• **Distância média por ponto:** " + formatPtBrNumber(metrics.averageSegmentDistanceMeters, 1, 1) + " metros."
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (q.includes("tempo") || q.includes("duracao") || q.includes("minuto") || q.includes("segundo") || q.includes("hora") || q.includes("inicio") || q.includes("fim")) {
    return [
      "⏱️ **Tempo do percurso:**",
      "• **Início:** " + (metrics.firstTimestamp ? metrics.firstTimestamp.toLocaleTimeString("pt-BR") : ""),
      "• **Fim:** " + (metrics.lastTimestamp ? metrics.lastTimestamp.toLocaleTimeString("pt-BR") : ""),
      "• **Duração total:** " + formatTimePtBr(metrics.durationSeconds),
      "• **Tempo efetivo de deslocamento:** " + formatTimePtBr(metrics.movingSeconds),
    ].join("\n");
  }

  if (q.includes("pausa") || q.includes("parada") || q.includes("comercio") || q.includes("comercial") || q.includes("loja")) {
    if (metrics.pausesOver3Min.length === 0) {
      return "Não foram detectadas pausas superiores a 3 minutos neste percurso.";
    }
    return [
      `⏸️ **Pausas superiores a 3 minutos detectadas (${metrics.pausesOver3Min.length}):**`,
      ...metrics.pausesOver3Min.map((p, idx) => {
        return `• Parada #${idx + 1}: ${formatTimePtBr(p.durationSeconds)} (das ${p.startTimestamp.toLocaleTimeString("pt-BR")} às ${p.endTimestamp.toLocaleTimeString("pt-BR")}) em ${formatPtBrNumber(p.lat, 6, 6)}, ${formatPtBrNumber(p.lng, 6, 6)}.`;
      }),
    ].join("\n");
  }

  return formatTrackSummary(metrics);
}
