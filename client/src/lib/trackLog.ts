export const LOG_RECORD_SEPARATOR = "\r\n";
export const LOG_HEADER = "[timestamp], obs, lat, lng, dir, alt, speed, speed_acc, acc, dist, time;";

export interface TrackPointReference {
  lat: number;
  lng: number;
  timestampMs: number;
}

export interface AutomaticCaptureItem {
  latitude: number;
  longitude: number;
  speedKmh?: number;
  accuracy?: number;
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isLogHeaderLine(line: string): boolean {
  return /^\[timestamp(?:\s+yyyymmddhhmmss)?\]/i.test(line.trim());
}

export function ensureLogHeader(text: string): string {
  const bodyLines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !isLogHeaderLine(line));
  const body = bodyLines.join(LOG_RECORD_SEPARATOR);
  return body ? `${LOG_HEADER}${LOG_RECORD_SEPARATOR}${body}${LOG_RECORD_SEPARATOR}` : `${LOG_HEADER}${LOG_RECORD_SEPARATOR}`;
}

export function appendLogRecord(existing: string, record: string): string {
  const base = ensureLogHeader(existing).trimEnd();
  const cleanedRecord = record.trim().replace(/^;\s*/, "").replace(/;+$/, "").trim();
  return `${base}${LOG_RECORD_SEPARATOR}; ${cleanedRecord}${LOG_RECORD_SEPARATOR}`;
}

export function formatGpsMetadata(data: {
  speedKmh?: number;
  bearingDegrees?: number;
  altitudeMeters?: number;
  speedAccuracyKmh?: number;
  accuracy?: number;
}): string {
  const values = [
    Number.isFinite(data.bearingDegrees) ? data.bearingDegrees!.toFixed(1) : "",
    Number.isFinite(data.altitudeMeters) ? data.altitudeMeters!.toFixed(1) : "",
    Number.isFinite(data.speedKmh) ? data.speedKmh!.toFixed(1) : "",
    Number.isFinite(data.speedAccuracyKmh) ? data.speedAccuracyKmh!.toFixed(1) : "",
    Number.isFinite(data.accuracy) ? data.accuracy!.toFixed(1) : "",
  ];
  return `, ${values.join(", ")}`;
}

export function formatSegmentMetadata(previous: TrackPointReference | null, current: TrackPointReference): string {
  if (!previous || !Number.isFinite(previous.timestampMs) || !Number.isFinite(current.timestampMs)) return ", , ";
  const elapsedSeconds = (current.timestampMs - previous.timestampMs) / 1000;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > 86400) return ", , ";
  const segmentDistance = distanceMeters(previous.lat, previous.lng, current.lat, current.lng);
  return `, ${segmentDistance.toFixed(1)}, ${elapsedSeconds.toFixed(1)}`;
}

export function isAnomalousAutomaticCapture(
  item: AutomaticCaptureItem,
  previous: TrackPointReference | null,
  timestampMs: number,
  stationary = false,
): boolean {
  const speed = Number(item.speedKmh);
  if (stationary && Number.isFinite(speed) && Math.abs(speed) > 2.5) return true;
  if (Number.isFinite(speed) && (speed < -1 || speed > 220)) return true;
  // Acurácia até 85m aceita condições de celulares em bolso/cidade, descartando apenas antenas grosseiras
  if (Number.isFinite(item.accuracy) && Number(item.accuracy) > 85) return true;
  if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) return true;
  if (Math.abs(item.latitude) > 90 || Math.abs(item.longitude) > 180) return true;
  if (item.latitude === 0 && item.longitude === 0) return true;
  if (previous && Number.isFinite(timestampMs)) {
    if (timestampMs <= previous.timestampMs) return true;
    const elapsed = (timestampMs - previous.timestampMs) / 1000;
    if (elapsed <= 0 || elapsed > 86400) return true;
    const segmentDistance = distanceMeters(previous.lat, previous.lng, item.latitude, item.longitude);
    const segmentSpeed = (segmentDistance / elapsed) * 3.6;
    if (segmentSpeed > 220) return true;
    if (stationary && segmentSpeed > 2.5) return true;
    // Deriva estática grosseira: salto maior que 50m em intervalo curto enquanto o sensor relata speed < 1.5
    if (Number.isFinite(speed) && speed < 1.5 && segmentDistance > 50 && elapsed < 20) return true;
  }
  return false;
}

export function timestampToMillis(timestamp: string): number {
  if (!/^\d{14}$/.test(timestamp)) return NaN;
  return new Date(
    Number(timestamp.slice(0, 4)), Number(timestamp.slice(4, 6)) - 1, Number(timestamp.slice(6, 8)),
    Number(timestamp.slice(8, 10)), Number(timestamp.slice(10, 12)), Number(timestamp.slice(12, 14)),
  ).getTime();
}

export interface PendingLocationLike extends AutomaticCaptureItem {
  timestamp?: string;
  mode?: "interval" | "stationary";
  gpsTimeMs?: number;
}

export interface AcceptedPendingLocation<T extends PendingLocationLike = PendingLocationLike> {
  item: T;
  timestamp: string;
  timestampMs: number;
}

export function filterNativePendingLocations<T extends PendingLocationLike>(
  items: T[],
  previous: TrackPointReference | null,
  fallbackTimestamp: () => string,
): { accepted: AcceptedPendingLocation<T>[]; rejectedCount: number } {
  let cursor = previous;
  const accepted: AcceptedPendingLocation<T>[] = [];
  let rejectedCount = 0;
  let consecutiveRejected = 0;

  for (const item of items) {
    let timestamp = /^\d{14}$/.test(item.timestamp ?? "") ? item.timestamp! : fallbackTimestamp();
    let timestampMs = timestampToMillis(timestamp);

    // Se o timestamp coincidir com o anterior devido à precisão de segundos, mas temos gpsTimeMs sequencial válido
    if (cursor && timestampMs <= cursor.timestampMs) {
      if (item.gpsTimeMs && item.gpsTimeMs > cursor.timestampMs) {
        timestampMs = cursor.timestampMs + 1000;
        const d = new Date(timestampMs);
        timestamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
      }
    }

    const stationary = item.mode === "stationary";
    const rejected =
      (stationary && (!Number.isFinite(item.speedKmh) || Math.abs(Number(item.speedKmh)) > 2.5)) ||
      isAnomalousAutomaticCapture(item, cursor, timestampMs, stationary);
    if (rejected) {
      rejectedCount += 1;
      consecutiveRejected += 1;
      if (
        consecutiveRejected >= 3 &&
        Number.isFinite(item.latitude) &&
        Number.isFinite(item.longitude) &&
        Number(item.accuracy ?? 0) <= 85
      ) {
        cursor = { lat: item.latitude, lng: item.longitude, timestampMs };
        consecutiveRejected = 0;
      }
      continue;
    }
    consecutiveRejected = 0;
    accepted.push({ item, timestamp, timestampMs });
    cursor = { lat: item.latitude, lng: item.longitude, timestampMs };
  }

  return { accepted, rejectedCount };
}

/**
 * Atualiza o prefixo da linha (antes da coordenada), inserindo ou complementando
 * a observação com o texto informado (ex.: "Ponto corrigido manualmente").
 */
export function updatePrefixObservation(prefix: string, newObservation: string): string {
  // Caso com timestamp: ex: "; [20260828120000] Coleta #1, " ou "[20260828120000], "
  const tsMatch = prefix.match(/^(\s*;?\s*\[\d{14}\])\s*(.*?)([,\s;]*)$/);
  if (tsMatch) {
    const leaderWithTs = tsMatch[1];
    const existingObs = tsMatch[2].replace(/^[,\s;]+|[,\s;]+$/g, "").trim();
    let finalObs = "";
    if (existingObs) {
      finalObs = existingObs.includes(newObservation) ? existingObs : `${existingObs} - ${newObservation}`;
    } else {
      finalObs = newObservation;
    }
    return `${leaderWithTs} ${finalObs}, `;
  }

  // Caso sem timestamp, mas com texto de observação antes da coordenada: ex: "Ponto 1, "
  const noTsMatch = prefix.match(/^(\s*;?\s*)(.*?)([,\s;]+)$/);
  if (noTsMatch) {
    const leader = noTsMatch[1];
    const existingObs = noTsMatch[2].replace(/^[,\s;]+|[,\s;]+$/g, "").trim();
    if (existingObs) {
      const finalObs = existingObs.includes(newObservation) ? existingObs : `${existingObs} - ${newObservation}`;
      return `${leader}${finalObs}, `;
    }
  }

  return prefix;
}

/**
 * Atualiza a latitude e longitude do ponto com o índice especificado no texto do log,
 * preservando timestamps, observações, metadados, formatação e quebras de linha.
 * Se informado newObservation, adiciona ou atualiza a observação do ponto.
 */
export function updateCoordInText(
  currentText: string,
  pointIndex: number,
  newLat: number,
  newLng: number,
  newObservation?: string,
): string {
  const newline = currentText.includes("\r\n") ? "\r\n" : "\n";
  const lines = currentText.split(/\r?\n/);
  let coordCount = 0;
  let didUpdate = false;

  const newLines = lines.map((line) => {
    const clean = line.replace(/^;\s*/, "").replace(/;\s*$/, "").trim();
    if (!clean || isLogHeaderLine(clean)) return line;

    const hasTimestamp = /\[\d{14}\]/.test(line);
    const regex = /(-?\d{1,3}\.\d+)\s*[,;\t]\s*(-?\d{1,3}\.\d+)/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    let modifiedLine = "";
    let lineMatched = false;

    while ((match = regex.exec(line)) !== null) {
      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        if (coordCount === pointIndex) {
          lineMatched = true;
          let prefix = line.slice(lastIndex, match.index);
          if (newObservation) {
            prefix = updatePrefixObservation(prefix, newObservation);
          }
          modifiedLine += prefix + `${newLat.toFixed(6)},${newLng.toFixed(6)}`;
          lastIndex = match.index + match[0].length;
          coordCount++;
          didUpdate = true;
        } else {
          coordCount++;
        }

        // Se a linha possui timestamp, ela contém apenas uma coordenada geográfica principal;
        // os números restantes na linha são metadados (dir, alt, speed, acc, dist, time).
        if (hasTimestamp) {
          break;
        }
      }
    }

    if (lineMatched) {
      modifiedLine += line.slice(lastIndex);
      return modifiedLine;
    }

    return line;
  });

  if (!didUpdate) {
    return currentText;
  }

  return newLines.join(newline);
}
