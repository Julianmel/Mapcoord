import { describe, expect, it } from "vitest";
import {
  appendLogRecord,
  ensureLogHeader,
  filterNativePendingLocations,
  isAnomalousAutomaticCapture,
  timestampToMillis,
} from "../client/src/lib/trackLog";

const firstPoint = { lat: -16.74305, lng: -49.08752, timestampMs: timestampToMillis("20260828120000") };

 describe("track log capture guards", () => {
  it("normalizes the compact header and terminates every line with CRLF", () => {
    const result = appendLogRecord(
      "[timestamp], obs, lat, lng, dir, alt, speed, speed_acc, acc, dist, time;\n",
      "[20260828120000] Coleta #1, -16.743050,-49.087520",
    );

    expect(result).toBe(
      "[timestamp], obs, lat, lng, dir, alt, speed, speed_acc, acc, dist, time;\r\n; [20260828120000] Coleta #1, -16.743050,-49.087520\r\n",
    );
    expect(ensureLogHeader(result).split("\r\n").every((line, index, lines) => index === lines.length - 1 || line.length > 0)).toBe(true);
  });

  it("produces export content with a compact header and CRLF records", () => {
    const exported = ensureLogHeader("[20260828120000] Coleta #1, -16.743050,-49.087520;\n[20260828120005] Coleta #2, -16.743051,-49.087521;");
    const lines = exported.split("\r\n");

    expect(lines[0]).toBe("[timestamp], obs, lat, lng, dir, alt, speed, speed_acc, acc, dist, time;");
    expect(exported).toContain("\r\n");
    expect(exported.endsWith("\r\n")).toBe(true);
    expect(exported).not.toContain("\n\n");
  });

  it("rejects duplicate or out-of-order timestamps before import", () => {
    const duplicateTimestamp = timestampToMillis("20260828120000");
    const olderTimestamp = timestampToMillis("20260828115959");
    const item = { latitude: firstPoint.lat, longitude: firstPoint.lng, speedKmh: 0.2, accuracy: 5 };

    expect(isAnomalousAutomaticCapture(item, firstPoint, duplicateTimestamp)).toBe(true);
    expect(isAnomalousAutomaticCapture(item, firstPoint, olderTimestamp)).toBe(true);
  });

  it("filters the native queue sequentially without importing duplicates", () => {
    const pending = [
      { latitude: firstPoint.lat, longitude: firstPoint.lng, speedKmh: 0.2, accuracy: 5, timestamp: "20260828120005", mode: "interval" as const },
      { latitude: firstPoint.lat, longitude: firstPoint.lng, speedKmh: 0.2, accuracy: 5, timestamp: "20260828120005", mode: "interval" as const },
      { latitude: -16.90, longitude: -49.30, speedKmh: 2, accuracy: 5, timestamp: "20260828120010", mode: "interval" as const },
      { latitude: firstPoint.lat, longitude: firstPoint.lng, speedKmh: 0.2, accuracy: 5, timestamp: "20260828120004", mode: "interval" as const },
    ];
    const result = filterNativePendingLocations(pending, firstPoint, () => "20260828120020");

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.timestamp).toBe("20260828120005");
    expect(result.rejectedCount).toBe(3);
  });

  it("rejects teleportation and implausible GPS speed jumps", () => {
    const item = { latitude: -16.90, longitude: -49.30, speedKmh: 2, accuracy: 5 };
    const nextTimestamp = timestampToMillis("20260828120010");

    expect(isAnomalousAutomaticCapture(item, firstPoint, nextTimestamp)).toBe(true);
  });

  it("rejects moving points in stationary mode while accepting near-zero speed", () => {
    const nextTimestamp = timestampToMillis("20260828120010");
    const moving = { latitude: firstPoint.lat, longitude: firstPoint.lng, speedKmh: 8, accuracy: 5 };
    const stationary = { latitude: firstPoint.lat, longitude: firstPoint.lng, speedKmh: 0.3, accuracy: 5 };

    expect(isAnomalousAutomaticCapture(moving, firstPoint, nextTimestamp, true)).toBe(true);
    expect(isAnomalousAutomaticCapture(stationary, firstPoint, nextTimestamp, true)).toBe(false);
  });
});
