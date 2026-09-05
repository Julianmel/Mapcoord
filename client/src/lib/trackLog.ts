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
  if (Number.isFinite(speed) && (speed < -1 || speed > 180)) return true;
  if (Number.isFinite(item.accuracy) && Number(item.accuracy) > 150) return true;
  if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) return true;
  if (previous && Number.isFinite(timestampMs)) {
    const segmentDistance = distanceMeters(previous.lat, previous.lng, item.latitude, item.longitude);
    const elapsed = (timestampMs - previous.timestampMs) / 1000;
    if (elapsed > 0 && elapsed <= 86400) {
      const segmentSpeed = (segmentDistance / elapsed) * 3.6;
      if (segmentSpeed > 180) return true;
      if (stationary && segmentSpeed > 2.5) return true;
    } else if (elapsed <= 0) {
      // Ponto no mesmo segundo: só rejeita se for salto absurdo (> 100m em 0s)
      if (segmentDistance > 100) return true;
    }
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
    const timestamp = /^\d{14}$/.test(item.timestamp ?? "") ? item.timestamp! : fallbackTimestamp();
    const timestampMs = timestampToMillis(timestamp);
    const stationary = item.mode === "stationary";
    const rejected =
      (stationary && (!Number.isFinite(item.speedKmh) || Math.abs(Number(item.speedKmh)) > 2.5)) ||
      isAnomalousAutomaticCapture(item, cursor, timestampMs, stationary);
    if (rejected) {
      rejectedCount += 1;
      consecutiveRejected += 1;
      // Se acumular 3 rejeições seguidas, ressincroniza o cursor com o ponto atual
      if (consecutiveRejected >= 3 && Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && Number(item.accuracy ?? 0) <= 150) {
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
