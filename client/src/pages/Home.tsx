/*
 * Design: Cartográfico Técnico
 * Layout split-screen: painel de entrada à esquerda (desktop), empilhado no topo (mobile).
 * Paleta: slate escuro com acento cyan (#06b6d4).
 * Tipografia: Space Grotesk (títulos), Inter (labels), JetBrains Mono (dados).
 *
 * Funcionalidades:
 * - Círculos com raio ajustável via slider (1m a 5m, 1 casa decimal)
 * - Labels numéricas como Marker clássica com icon SVG (anchor centralizado)
 * - Seletor de cores para 4 elementos com paleta de 32 cores em escala espectro
 * - Persistência de cores via localStorage
 */

import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { MapView } from "@/components/Map";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { MapPin, Trash2, Navigation, CheckCircle2, XCircle, Palette, RotateCcw, X, Crosshair, Loader2, Play, Square, Download, Maximize2, Minimize2, Save, RefreshCcw, Clock, Route, Sparkles, Focus } from "lucide-react";
import { useIsMobile } from "@/hooks/useMobile";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { answerDisplacementQuestion } from "@/lib/trackAnalysis";
import {
  appendLogRecord,
  distanceMeters,
  ensureLogHeader,
  formatGpsMetadata,
  filterNativePendingLocations,
  isAnomalousAutomaticCapture,
  formatSegmentMetadata,
  isLogHeaderLine,
  timestampToMillis,
} from "@/lib/trackLog";

interface ParsedCoord {
  lat: number;
  lng: number;
  observation?: string;
  timestamp?: string;
}

interface CircleRef {
  circle: L.Circle;
  marker: L.Marker;
  center: [number, number];
}

interface ColorConfig {
  numberColor: string;
  numberCircleColor: string;
  circleFillColor: string;
  circleBorderColor: string;
}

const RADIUS_MIN = 1;
const RADIUS_MAX = 5;
const STORAGE_KEY = "mapa-coordenadas-colors";
const DATA_STORAGE_KEY = "mapa-coordenadas-data";
const CONTINUOUS_STORAGE_KEY = "mapa-coordenadas-continuous";
const STATIONARY_MIN_SECONDS = 5;
const STATIONARY_MOVEMENT_THRESHOLD_METERS = 3;

// Estado da captura contínua persistido no localStorage
interface ContinuousCaptureState {
  active: boolean;
  interval: number;
  startedAt: number;
  lastCaptureTime: number;
  sequenceCount: number;
}

interface NativeLocationCapture {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: string;
  intervalSeconds?: number;
  mode?: "interval" | "stationary";
  waitSeconds?: number;
  speedKmh?: number;
  bearingDegrees?: number;
  altitudeMeters?: number;
  speedAccuracyKmh?: number;
  gpsTimeMs?: number;
}

interface NativeDiagnostics {
  bridge: boolean;
  foregroundLocation: boolean;
  backgroundLocation: boolean;
  notifications: boolean;
  service: "active" | "stopped" | "error";
  mode: "interval" | "stationary";
  error: string;
  lastTimestamp: string;
  lastLatitude: string;
  lastLongitude: string;
  pendingCount: number;
  intervalSeconds: number;
  stationaryWaitSeconds: number;
  instantSpeedKmh?: number;
  lastSegmentDistanceMeters?: number;
  elapsedSincePreviousSeconds?: number;
  stationaryElapsedSeconds?: number;
}

interface NativeGpsBridge {
  start: (intervalSeconds: number) => void;
  startStationary?: (waitSeconds: number) => void;
  stop: () => void;
  getPendingLocations: () => string;
  clearPendingLocations: () => void;
  saveTextFile?: (filename: string, content: string) => boolean;
  isAvailable?: () => boolean;
  getDiagnostics?: () => string;
}

function getNativeGpsBridge(): NativeGpsBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as Window & { AndroidGps?: NativeGpsBridge }).AndroidGps;
  return bridge ?? null;
}

function saveContinuousState(state: ContinuousCaptureState | null) {
  if (state === null) {
    localStorage.removeItem(CONTINUOUS_STORAGE_KEY);
  } else {
    try {
      localStorage.setItem(CONTINUOUS_STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }
}

function loadContinuousState(): ContinuousCaptureState | null {
  try {
    const saved = localStorage.getItem(CONTINUOUS_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}

// Gera timestamp no formato AAAAMMDDhhmmss
const getTimestamp = (): string => {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  const hour = now.getHours().toString().padStart(2, "0");
  const minute = now.getMinutes().toString().padStart(2, "0");
  const second = now.getSeconds().toString().padStart(2, "0");
  return `${year}${month}${day}${hour}${minute}${second}`;
};

// Formata timestamp para leitura humana
const formatTimestamp = (ts: string): string => {
  if (ts.length !== 14) return ts;
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}`;
};

const DEFAULT_COLORS: ColorConfig = {
  numberColor: "#ffffff",
  numberCircleColor: "#0a4a82",
  circleFillColor: "#87CEEB",
  circleBorderColor: "#0a4a82",
};

/**
 * Paleta de 32 cores organizadas em escala do espectro da luz:
 * Vermelhos -> Laranjas -> Amarelos -> Verdes -> Cianos -> Azuis -> Roxos -> Magentas
 */
const SPECTRUM_PALETTE = [
  // Vermelhos (0-7)
  "#FF0000", "#FF3333", "#FF6666", "#FF9999", "#CC0000", "#990000", "#CC3333", "#8B0000",
  // Laranjas (8-11)
  "#FF8C00", "#FFA500", "#FFB347", "#FFCC80",
  // Amarelos (12-15)
  "#FFD700", "#FFEA00", "#FFFF00", "#FFFF66",
  // Verdes (16-19)
  "#00FF00", "#33FF33", "#00CC00", "#008000",
  // Cianos/Teal (20-23)
  "#00FFFF", "#00CED1", "#008B8B", "#20B2AA",
  // Azuis (24-27)
  "#0000FF", "#4169E1", "#0047AB", "#00008B",
  // Roxos (28-29)
  "#800080", "#9932CC",
  // Magentas/Rosas (30-31)
  "#FF00FF", "#FF1493",
];

const COLOR_LABELS: Record<keyof ColorConfig, string> = {
  numberColor: "Cor do número",
  numberCircleColor: "Círculo do número",
  circleFillColor: "Círculo de raio (preenchimento)",
  circleBorderColor: "Borda do círculo de raio",
};

function loadColors(): ColorConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_COLORS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_COLORS };
}

function saveColors(colors: ColorConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
}

function loadSavedData(): string {
  try {
    return localStorage.getItem(DATA_STORAGE_KEY) || "";
  } catch {}
  return "";
}

// Limite de espaço: localStorage tem ~5MB por domínio. Usamos trim se necessário.
const MAX_STORAGE_BYTES = 4 * 1024 * 1024; // 4MB (deixa 1MB de folga)


function saveData(text: string) {
  const normalizedText = text.trim() ? ensureLogHeader(text) : "";
  try {
    // Se o texto excede o limite, trunca mantendo o início (dados mais antigos)
    const safeText = normalizedText.length * 2 > MAX_STORAGE_BYTES
      ? normalizedText.substring(0, Math.floor(MAX_STORAGE_BYTES / 2) - 100)
      : normalizedText;
    localStorage.setItem(DATA_STORAGE_KEY, safeText);
  } catch {
    // Se localStorage estiver cheio, tentar truncar e salvar de novo
    try {
      const safeLength = Math.floor(MAX_STORAGE_BYTES / 2) - 100;
      localStorage.setItem(DATA_STORAGE_KEY, normalizedText.substring(0, safeLength));
    } catch {}
  }
}




/**
 * Cria o ícone DivIcon Leaflet para o marcador numérico.
 * O ícone é um círculo SVG com as cores configuradas e número centralizado.
 */
function createMarkerIcon(
  index: number,
  colors: ColorConfig,
  variant: "normal" | "start" | "end" | "waypoint" = "normal"
): L.DivIcon {
  if (variant === "start") {
    const size = 14;
    const half = size / 2;
    return L.divIcon({
      className: "custom-map-marker",
      html: `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${half}" cy="${half}" r="${half - 1}" fill="#16a34a" stroke="#ffffff" stroke-width="1.5"/>
        <circle cx="${half}" cy="${half}" r="2.5" fill="#ffffff"/>
      </svg>`.trim(),
      iconSize: [size, size],
      iconAnchor: [half, half],
    });
  }

  if (variant === "end") {
    const size = 14;
    const half = size / 2;
    return L.divIcon({
      className: "custom-map-marker",
      html: `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${half}" cy="${half}" r="${half - 1}" fill="#dc2626" stroke="#ffffff" stroke-width="1.5"/>
        <circle cx="${half}" cy="${half}" r="2.5" fill="#ffffff"/>
      </svg>`.trim(),
      iconSize: [size, size],
      iconAnchor: [half, half],
    });
  }

  if (variant === "waypoint") {
    const size = 10;
    const half = size / 2;
    return L.divIcon({
      className: "custom-map-marker",
      html: `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${half}" cy="${half}" r="${half - 1}" fill="#f59e0b" stroke="#ffffff" stroke-width="1"/>
      </svg>`.trim(),
      iconSize: [size, size],
      iconAnchor: [half, half],
    });
  }

  // Marcador normal (compacto, 13px)
  const size = 13;
  const half = size / 2;
  const r = half - 1;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${half}" cy="${half}" r="${r}" fill="${colors.numberCircleColor}" stroke="${colors.numberCircleColor}" stroke-width="1"/>
      <text x="${half}" y="${half}" text-anchor="middle" dominant-baseline="central" fill="${colors.numberColor}" font-family="'JetBrains Mono',monospace" font-size="7" font-weight="700">${index + 1}</text>
    </svg>
  `.trim();

  return L.divIcon({
    className: "custom-map-marker",
    html: svg,
    iconSize: [size, size],
    iconAnchor: [half, half],
  });
}

export default function Home() {
  // The useAuth hook provides authentication state.
  // To implement login/logout, call logout(), or start login from an event
  // handler: onClick={() => startLogin()} (imported from "@/const"). Never call
  // startLogin() during render (no href={startLogin()}) — it mints a one-time
  // nonce cookie and must run only at the moment of navigation.
  let { user, loading, error, isAuthenticated, logout } = useAuth();

  const [inputText, setInputText] = useState("");
  const [coords, setCoords] = useState<ParsedCoord[]>([]);
  const [radius, setRadius] = useState(3); // metros
  const [status, setStatus] = useState<{ type: "success" | "error" | "info" | "idle"; message: string }>({
    type: "idle",
    message: "",
  });
  const [activeCircles, setActiveCircles] = useState<CircleRef[]>([]);
  const [colors, setColors] = useState<ColorConfig>(loadColors);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedElement, setSelectedElement] = useState<keyof ColorConfig | null>(null);
  const [capturingGPS, setCapturingGPS] = useState(false);
  const [continuousCapture, setContinuousCapture] = useState(false);
  const [captureInterval, setCaptureInterval] = useState(5);
  const [stationaryCapture, setStationaryCapture] = useState(false);
  const [stationaryWaitSeconds, setStationaryWaitSeconds] = useState(STATIONARY_MIN_SECONDS);
  const [stationaryElapsedSeconds, setStationaryElapsedSeconds] = useState(0);
  const continuousIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stationaryWatchIdRef = useRef<number | null>(null);
  const stationaryTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stationaryStableSinceRef = useRef<number | null>(null);
  const stationaryAnchorRef = useRef<{ lat: number; lng: number } | null>(null);
  const stationaryLastPositionRef = useRef<GeolocationPosition | null>(null);
  const stationaryHasCapturedRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastKnownPositionRef = useRef<GeolocationPosition | null>(null);
  const captureIntervalRef2 = useRef<number>(5);
  const watchPositionIdRef = useRef<number | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const sequenceCounterRef = useRef<number>(0);
  const lastCaptureTimeRef = useRef<number>(0);
  const wasInBackgroundRef = useRef<boolean>(false);
  const resumedFromStorageRef = useRef<boolean>(false);
  const continuousStateRef = useRef<ContinuousCaptureState | null>(null);
  const nativeImportingRef = useRef(false);
  const lastRecordedPointRef = useRef<{ lat: number; lng: number; timestampMs: number } | null>(null);
  const addSegmentMetadata = (lat: number, lng: number, timestamp: string) => {
    const current = { lat, lng, timestampMs: timestampToMillis(timestamp) };
    const metadata = formatSegmentMetadata(lastRecordedPointRef.current, current);
    lastRecordedPointRef.current = current;
    return metadata;
  };
  const [observationText, setObservationText] = useState("");
  const [showObservationModal, setShowObservationModal] = useState(false);
  const [mapClickedCoord, setMapClickedCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const longPressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isMobile = useIsMobile();
  const [dataLoaded, setDataLoaded] = useState(false);
  const [autoLoadEnabled, setAutoLoadEnabled] = useState(false);
  const [showLine, setShowLine] = useState(false);
  const polylineRef = useRef<L.Polyline | null>(null);
  const [showTrackAnalysis, setShowTrackAnalysis] = useState(false);
  const [analysisMessages, setAnalysisMessages] = useState<Message[]>([]);
  const [nativeDiagnostics, setNativeDiagnostics] = useState<NativeDiagnostics | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [mounted, setMounted] = useState(false);

  // Carregar configuração de auto-save e dados do localStorage ao montar
  // Os dados são SEMPRE restaurados do localStorage ao carregar a página
  useEffect(() => {
    if (mounted) return;
    setMounted(true);
    const savedText = loadSavedData();
    if (savedText) {
      setInputText(savedText);
      // Parsear e preparar para renderizar no mapa quando o mapa estiver pronto
      const parsed = parseCoordenadas(savedText);
      if (parsed.length > 0) {
        setCoords(parsed);
        const lastParsed = parsed[parsed.length - 1];
        if (lastParsed.timestamp) {
          lastRecordedPointRef.current = {
            lat: lastParsed.lat,
            lng: lastParsed.lng,
            timestampMs: timestampToMillis(lastParsed.timestamp),
          };
        }
      }
      // Atualizar contador sequencial baseado no último número encontrado
      const lastSeqMatch = savedText.match(/Coleta\s*#(\d+)/g);
      if (lastSeqMatch && lastSeqMatch.length > 0) {
        const lastNum = parseInt(lastSeqMatch[lastSeqMatch.length - 1].replace(/[^\d]/g, ""));
        if (!isNaN(lastNum)) {
          sequenceCounterRef.current = lastNum;
        }
      }
    }

    // Importar pontos capturados pelo serviço Android uma única vez.
    const nativeBridge = getNativeGpsBridge();
    if (nativeBridge && !nativeImportingRef.current) {
      nativeImportingRef.current = true;
      try {
        const raw = nativeBridge.getPendingLocations();
        const pending = JSON.parse(raw) as NativeLocationCapture[];
        const validPending = Array.isArray(pending)
          ? pending.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
          : [];

        if (validPending.length > 0) {
          let next = loadSavedData();
          let importedCount = 0;
          const validation = filterNativePendingLocations(validPending, lastRecordedPointRef.current, getTimestamp);
          for (const { item, timestamp, timestampMs } of validation.accepted) {
            const interval = Number.isFinite(item.intervalSeconds) ? item.intervalSeconds : 5;
            const wait = Number.isFinite(item.waitSeconds) ? item.waitSeconds : interval;
            const stationary = item.mode === "stationary";
            sequenceCounterRef.current += 1;
            const currentPoint = { lat: item.latitude, lng: item.longitude, timestampMs };
            const segmentMetadata = formatSegmentMetadata(lastRecordedPointRef.current, currentPoint);
            const entry = stationary
              ? `[${timestamp}] Coleta #${sequenceCounterRef.current} (permanência ${wait}s), ${item.latitude.toFixed(6)},${item.longitude.toFixed(6)}${formatGpsMetadata(item)}${segmentMetadata}`
              : `[${timestamp}] Coleta #${sequenceCounterRef.current} (intervalo ${interval}s), ${item.latitude.toFixed(6)},${item.longitude.toFixed(6)}${formatGpsMetadata(item)}${segmentMetadata}`;
            lastRecordedPointRef.current = currentPoint;
            next = appendLogRecord(next, entry);
            importedCount += 1;
          }

          // Salvar antes de confirmar ao serviço que a fila foi processada.
          saveData(next);
          setInputText(next);
          if (autoLoadEnabled) setCoords(parseCoordenadas(next));
          nativeBridge.clearPendingLocations();
          setStatus({ type: "success", message: `${importedCount} ponto(s) capturado(s) em background foram importados${validation.rejectedCount > 0 ? "; anomalias descartadas" : ""}.` });
        }
      } catch {
        setStatus({ type: "error", message: "Não foi possível importar os pontos capturados em background." });
      } finally {
        nativeImportingRef.current = false;
      }
    }

    setDataLoaded(true);

    // =============================================
    // RETOMADA AUTOMÁTICA: Se a captura contínua estava ativa quando a página foi destruída,
    // retomar agora com o mesmo intervalo (sem compensação retroativa)
    // =============================================
    const savedContinuous = loadContinuousState();
    if (savedContinuous && savedContinuous.active) {
      const interval = savedContinuous.interval;
      const nativeBridge = getNativeGpsBridge();
      lastCaptureTimeRef.current = Date.now();
      wasInBackgroundRef.current = false;
      continuousStateRef.current = savedContinuous;
      sequenceCounterRef.current = savedContinuous.sequenceCount || 0;

      // Ativar UI
      setContinuousCapture(true);
      setCaptureInterval(interval);
      captureIntervalRef2.current = interval;

      if (nativeBridge) {
        nativeBridge.start(interval);
        setStatus({ type: "success", message: `Captura nativa retomada (a cada ${interval}s), inclusive em background.` });
        resumedFromStorageRef.current = true;
        return;
      }

      // watchPosition
      watchPositionIdRef.current = navigator.geolocation.watchPosition(
        (pos) => { lastKnownPositionRef.current = pos; },
        () => {},
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );

      const recordCapture = (position: GeolocationPosition, timestamp = getTimestamp()) => {
        const { latitude, longitude, speed, accuracy } = position.coords;
        const speedKmh = speed != null && Number.isFinite(speed) ? speed * 3.6 : undefined;
        const timestampMs = timestampToMillis(timestamp);
        if (isAnomalousAutomaticCapture({ latitude, longitude, speedKmh, accuracy }, lastRecordedPointRef.current, timestampMs)) {
          setStatus({ type: "info", message: "Leitura automática descartada por possível anomalia de deslocamento." });
          return;
        }
        sequenceCounterRef.current += 1;
        const observation = `Coleta #${sequenceCounterRef.current} (intervalo ${interval}s)`;
        const novaCoord = `[${timestamp}] ${observation}, ${latitude.toFixed(6)},${longitude.toFixed(6)}${formatGpsMetadata({
          speedKmh,
          bearingDegrees: position.coords.heading != null && Number.isFinite(position.coords.heading) ? position.coords.heading : undefined,
          altitudeMeters: position.coords.altitude != null && Number.isFinite(position.coords.altitude) ? position.coords.altitude : undefined,
          accuracy,
        })}${addSegmentMetadata(latitude, longitude, timestamp)}`;
        setInputText((prev) => appendLogRecord(prev, novaCoord));
      };

      const doCapture = () => {
        lastCaptureTimeRef.current = Date.now();
        // Atualizar estado persistente a cada captura
        if (continuousStateRef.current) {
          continuousStateRef.current.lastCaptureTime = Date.now();
          continuousStateRef.current.sequenceCount = sequenceCounterRef.current;
          saveContinuousState(continuousStateRef.current);
        }
        let resolved = false;
        const timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            if (lastKnownPositionRef.current) {
              recordCapture(lastKnownPositionRef.current, getTimestamp());
            } else {
              // Sem posição conhecida - tentar sem timeout curto
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  lastKnownPositionRef.current = pos;
                  recordCapture(pos, getTimestamp());
                },
                () => {
                  setStatus({ type: "error", message: "GPS indisponível. Verifique as permissões de localização." });
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
              );
            }
          }
        }, 2000);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeoutId);
            lastKnownPositionRef.current = pos;
            recordCapture(pos, getTimestamp());
          },
          () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              if (lastKnownPositionRef.current) {
                recordCapture(lastKnownPositionRef.current, getTimestamp());
              }
            }
          },
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 2000 }
        );
      };

      // Captura inicial imediata
      doCapture();

      // Intervalo principal
      continuousIntervalRef.current = setInterval(doCapture, interval * 1000);

      setStatus({ type: "success", message: `Captura contínua retomada automaticamente (a cada ${interval}s).` });
      resumedFromStorageRef.current = true;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistir no localStorage a cada mudança no inputText
  // Só NÃO salva se o texto for vazio E o localStorage já estiver vazio
  useEffect(() => {
    if (!dataLoaded) return; // Esperar o load inicial
    saveData(inputText);

  }, [inputText, dataLoaded]);

  // =============================================
  // EFEITO: Ao voltar do background, re-adquirir Wake Lock
  // (a captura contínua já está rodando via setInterval no onClick/mount)
  // =============================================
  useEffect(() => {
    if (!continuousCapture && !stationaryCapture) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        if (wasInBackgroundRef.current) {
          wasInBackgroundRef.current = false;

          // Se a página foi recarregada (remontada), a retomada já foi feita no mount
          if (continuousCapture && resumedFromStorageRef.current) {
            resumedFromStorageRef.current = false;
            return;
          }

          // Re-adquirir Wake Lock ao voltar ao foreground
          try {
            wakeLockRef.current = await navigator.wakeLock.request('screen');
          } catch {}

          setStatus({
            type: "info",
            message: continuousCapture
              ? `Captura contínua ativa (a cada ${captureIntervalRef2.current}s)...`
              : `Coletar pausas no movimento ativa; aguardando ${stationaryWaitSeconds}s sem deslocamento...`,
          });
        }
      } else {
        // Entrando em background
        wasInBackgroundRef.current = true;
        // Liberar Wake Lock (será re-adquirido ao voltar)
        if (wakeLockRef.current) {
          wakeLockRef.current.release().catch(() => {});
          wakeLockRef.current = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [continuousCapture, stationaryCapture, stationaryWaitSeconds]);

  // =============================================
  // EFEITO: Wake Lock agressivo
  // =============================================
  useEffect(() => {
    if (!continuousCapture && !stationaryCapture) return;
    const acquireWakeLock = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        const lock = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current = lock;
        lock.addEventListener('release', () => {
          if ((continuousCapture || stationaryCapture) && document.visibilityState === 'visible') {
            acquireWakeLock();
          }
        });
      } catch {
        setTimeout(() => {
          if (continuousCapture || stationaryCapture) acquireWakeLock();
        }, 1000);
      }
    };
    acquireWakeLock();
  }, [continuousCapture, stationaryCapture]);

  const mapRef = useRef<L.Map | null>(null);



  // Limpar timer de long-press ao desmontar
  const cleanupLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearInterval(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setLongPressProgress(0);
  }, []);

  const handleCaptureAndClose = useCallback(() => {
    const obs = observationText.trim();
    const timestamp = getTimestamp();

    if (mapClickedCoord) {
      // Captura por long-press no mapa
      const lat = mapClickedCoord.lat.toFixed(6);
      const lng = mapClickedCoord.lng.toFixed(6);
      const coordPart = obs ? `${obs}, ${lat},${lng}` : `${lat},${lng}`;
      const novaCoord = `[${timestamp}] ${coordPart}${addSegmentMetadata(mapClickedCoord.lat, mapClickedCoord.lng, timestamp)}`;
      setInputText((prev) => {
        return appendLogRecord(prev, novaCoord);
      });
      setObservationText("");
      setMapClickedCoord(null);
      setShowObservationModal(false);
      setStatus({ type: "success", message: `Coordenada do mapa adicionada: ${lat}, ${lng} às ${formatTimestamp(timestamp)}` });
    } else {
      // Captura por GPS
      if (!navigator.geolocation) {
        setStatus({ type: "error", message: "Geolocalização não suportada neste navegador." });
        setShowObservationModal(false);
        return;
      }
      setCapturingGPS(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude.toFixed(6);
          const lng = position.coords.longitude.toFixed(6);
          const coordPart = obs ? `${obs}, ${lat},${lng}` : `${lat},${lng}`;
          const novaCoord = `[${timestamp}] ${coordPart}${formatGpsMetadata({
            speedKmh: position.coords.speed != null && Number.isFinite(position.coords.speed) ? position.coords.speed * 3.6 : undefined,
            bearingDegrees: position.coords.heading != null && Number.isFinite(position.coords.heading) ? position.coords.heading : undefined,
            altitudeMeters: position.coords.altitude != null && Number.isFinite(position.coords.altitude) ? position.coords.altitude : undefined,
            accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
          })}${addSegmentMetadata(position.coords.latitude, position.coords.longitude, timestamp)}`;
          setInputText((prev) => appendLogRecord(prev, novaCoord));
          setObservationText("");
          setCapturingGPS(false);
          setShowObservationModal(false);
          setStatus({ type: "success", message: `Posição capturada: ${lat}, ${lng} às ${formatTimestamp(timestamp)}` });
        },
        (error) => {
          setCapturingGPS(false);
          const msgs: Record<number, string> = {
            1: "Permissão de localização negada.",
            2: "Localização indisponível.",
            3: "Tempo esgotado ao obter localização.",
          };
          setStatus({ type: "error", message: msgs[error.code] || "Erro ao obter localização." });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }, [observationText, mapClickedCoord]);

  const parseCoordenadas = useCallback((texto: string): ParsedCoord[] => {
    const linhas = texto.split(/\r?\n+/).map((p) => p.trim()).filter(Boolean);
    const resultado: ParsedCoord[] = [];
    linhas.forEach((linha) => {
      let par = linha.replace(/^;\s*/, "").replace(/;\s*$/, "").trim();
      if (!par || isLogHeaderLine(par)) return;

      const tsMatch = par.match(/^\[(\d{14})\]/);
      const timestamp = tsMatch ? tsMatch[1] : "";
      if (tsMatch) {
        par = par.slice(tsMatch[0].length).trim();
      }

      // Procura lat e lng (dois floats válidos separados por vírgula, ponto-e-vírgula ou tabulação)
      const coordMatch = par.match(/(-?\d{1,3}\.\d+)\s*[,;\t]\s*(-?\d{1,3}\.\d+)/);
      if (!coordMatch) return;

      const lat = Number(coordMatch[1]);
      const lng = Number(coordMatch[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

      const matchIndex = par.indexOf(coordMatch[0]);
      const observation = par.slice(0, matchIndex).replace(/^[,\s;]+|[,\s;]+$/g, "").trim();

      resultado.push({ lat, lng, observation, timestamp });
    });
    return resultado;
  }, []);

  // Importa, em tempo real, os pontos produzidos pelo serviço Android.
  // A fila só é limpa depois que o log e o estado visual foram atualizados.
  const importNativePendingLocations = useCallback(() => {
    const nativeBridge = getNativeGpsBridge();
    if (!nativeBridge || nativeImportingRef.current) return;

    nativeImportingRef.current = true;
    try {
      const raw = nativeBridge.getPendingLocations();
      const pending = JSON.parse(raw) as NativeLocationCapture[];
      const validPending = Array.isArray(pending)
        ? pending.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
        : [];

      if (validPending.length === 0) return;

      let next = loadSavedData() || inputTextRef.current;
      let importedCount = 0;
      const validation = filterNativePendingLocations(validPending, lastRecordedPointRef.current, getTimestamp);
      for (const { item, timestamp, timestampMs } of validation.accepted) {
        const interval = Number.isFinite(item.intervalSeconds) ? item.intervalSeconds : captureIntervalRef2.current;
        const wait = Number.isFinite(item.waitSeconds) ? item.waitSeconds : interval;
        const stationary = item.mode === "stationary";
        sequenceCounterRef.current += 1;
        const currentPoint = { lat: item.latitude, lng: item.longitude, timestampMs };
        const segmentMetadata = formatSegmentMetadata(lastRecordedPointRef.current, currentPoint);
        const entry = stationary
          ? `[${timestamp}] Coleta #${sequenceCounterRef.current} (permanência ${wait}s), ${item.latitude.toFixed(6)},${item.longitude.toFixed(6)}${formatGpsMetadata(item)}${segmentMetadata}`
          : `[${timestamp}] Coleta #${sequenceCounterRef.current} (intervalo ${interval}s), ${item.latitude.toFixed(6)},${item.longitude.toFixed(6)}${formatGpsMetadata(item)}${segmentMetadata}`;
        lastRecordedPointRef.current = currentPoint;
        next = appendLogRecord(next, entry);
        importedCount += 1;
      }

      saveData(next);
      setInputText(next);
      if (autoLoadEnabled) setCoords(parseCoordenadas(next));
      nativeBridge.clearPendingLocations();
      setStatus({ type: "success", message: `${importedCount} ponto(s) sincronizado(s) do GPS nativo${validation.rejectedCount > 0 ? "; anomalias/duplicidades descartadas" : ""}.` });
    } catch {
      setStatus({ type: "error", message: "Não foi possível sincronizar os pontos do GPS nativo." });
    } finally {
      nativeImportingRef.current = false;
    }
  }, [autoLoadEnabled, parseCoordenadas]);

  // Escuta evento disparado quando a captura é parada via notificação Android
  useEffect(() => {
    const handleNativeStopped = () => {
      setContinuousCapture(false);
      setStationaryCapture(false);
      if (continuousIntervalRef.current) {
        clearInterval(continuousIntervalRef.current);
        continuousIntervalRef.current = null;
      }
      if (watchPositionIdRef.current) {
        navigator.geolocation.clearWatch(watchPositionIdRef.current);
        watchPositionIdRef.current = null;
      }
      if (stationaryTickerRef.current) {
        clearInterval(stationaryTickerRef.current);
        stationaryTickerRef.current = null;
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      continuousStateRef.current = null;
      saveContinuousState(null);
      setStatus({ type: "info", message: "Captura interrompida via notificação." });
    };

    window.addEventListener("native-location-stopped", handleNativeStopped);
    return () => window.removeEventListener("native-location-stopped", handleNativeStopped);
  }, []);

  // Mantém o diagnóstico Android visível e atualizado enquanto o WebView está aberto.
  useEffect(() => {
    const bridge = getNativeGpsBridge();
    if (!bridge) {
      setNativeDiagnostics(null);
      return;
    }
    const refresh = () => {
      try {
        const raw = bridge.getDiagnostics?.();
        if (raw) {
          const diag = JSON.parse(raw) as NativeDiagnostics;
          setNativeDiagnostics(diag);
          // Se o serviço nativo parou pela notificação, sincroniza a UI do app imediatamente
          if (diag.service === "stopped") {
            setContinuousCapture(prev => {
              if (prev) {
                continuousStateRef.current = null;
                saveContinuousState(null);
              }
              return false;
            });
            setStationaryCapture(prev => (prev ? false : prev));
          }
        }
      } catch {
        setNativeDiagnostics({
          bridge: true, foregroundLocation: false, backgroundLocation: false,
          notifications: false, service: "error", mode: "interval", error: "Diagnóstico indisponível",
          lastTimestamp: "", lastLatitude: "", lastLongitude: "", pendingCount: 0,
          intervalSeconds: 0, stationaryWaitSeconds: 0,
        });
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Enquanto a tela estiver aberta, sincroniza a fila nativa sem exigir recarga.
  useEffect(() => {
    if (!dataLoaded || !getNativeGpsBridge()) return;
    importNativePendingLocations();
    const syncTimer = window.setInterval(importNativePendingLocations, 1000);
    return () => window.clearInterval(syncTimer);
  }, [dataLoaded, importNativePendingLocations]);

  const handleCarregar = useCallback(() => {
    if (!inputText.trim()) {
      setStatus({ type: "error", message: "Cole as coordenadas no campo acima." });
      return;
    }

    const parsed = parseCoordenadas(inputText);

    if (parsed.length === 0) {
      setStatus({ type: "error", message: "Nenhuma coordenada válida encontrada. Verifique o formato." });
      return;
    }

    setCoords(parsed);
    setStatus({ type: "success", message: `${parsed.length} ponto(s) plotado(s) com sucesso.` });
    saveData(inputText);


    // Limpa overlays anteriores
    activeCircles.forEach((c) => {
      c.circle.remove();
      c.marker.remove();
    });

    prevCoordsCountRef.current = parsed.length;
    if (mapRef.current) {
      renderizarNoMapa(parsed, mapRef.current);
    }
  }, [inputText, parseCoordenadas, activeCircles]);

  const prevCoordsCountRef = useRef(0);

  const renderizarNoMapa = useCallback((coordsList: ParsedCoord[], map: L.Map, options?: { followLatest?: boolean }) => {
    // Limpa overlays anteriores
    activeCirclesRef.current.forEach((c) => {
      c.circle.remove();
      c.marker.remove();
    });

    const newCircles: CircleRef[] = [];
    const latLngs: [number, number][] = [];

    coordsList.forEach((coord, index) => {
      const center: [number, number] = [coord.lat, coord.lng];
      latLngs.push(center);

      // Círculo com cores configuradas
      const circle = L.circle(center, {
        radius,
        color: colors.circleBorderColor,
        fillColor: colors.circleFillColor,
        fillOpacity: 0.3,
        weight: 1.5,
        opacity: 1.0,
      });

      // No modo "Traçar linha", NÃO adicionamos círculos de raio ao mapa
      if (!showLine) {
        circle.addTo(map);
      }

      const isFirst = index === 0;
      const isLast = index === coordsList.length - 1;
      const hasCustomObs = Boolean(coord.observation && !coord.observation.startsWith("Coleta #"));

      // No modo "Traçar linha", adiciona marcador apenas no Início, no Fim e em pontos com anotação manual
      // Isso impede poluir a linha com centenas de círculos colados
      const shouldRenderMarker = !showLine || isFirst || isLast || hasCustomObs;

      let marker: L.Marker;
      if (shouldRenderMarker) {
        const variant = showLine ? (isFirst ? "start" : isLast ? "end" : "waypoint") : "normal";
        const icon = createMarkerIcon(index, colors, variant);
        marker = L.marker(center, { icon });
        marker.addTo(map);

        const title = isFirst ? "Início do Percurso" : isLast ? "Fim / Ponto Atual" : `Ponto ${index + 1}`;
        const popupContent = `<div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; padding: 4px; color: #1e293b;">
          <strong style="color: ${isFirst ? '#16a34a' : isLast ? '#dc2626' : '#0284c7'};">${title}</strong>${coord.observation ? `<br/><span style="color: #16a34a; font-weight: 600;">${coord.observation}</span>` : ""}${coord.timestamp ? `<br/><span style="color: #d97706; font-size: 11px;">${formatTimestamp(coord.timestamp)}</span>` : ""}<br/>
          Lat: ${coord.lat.toFixed(6)}<br/>
          Lng: ${coord.lng.toFixed(6)}
        </div>`;

        marker.bindPopup(popupContent);
      } else {
        const icon = createMarkerIcon(index, colors, "normal");
        marker = L.marker(center, { icon });
      }

      const popupContentCircle = `<div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; padding: 4px; color: #1e293b;">
        <strong style="color: #0284c7;">Ponto ${index + 1}</strong>${coord.observation ? `<br/><span style="color: #16a34a; font-weight: 600;">${coord.observation}</span>` : ""}${coord.timestamp ? `<br/><span style="color: #d97706; font-size: 11px;">${formatTimestamp(coord.timestamp)}</span>` : ""}<br/>
        Lat: ${coord.lat.toFixed(6)}<br/>
        Lng: ${coord.lng.toFixed(6)}
      </div>`;
      circle.bindPopup(popupContentCircle);

      newCircles.push({ circle, marker, center });
    });

    setActiveCircles(newCircles);

    // Se a linha conectando os pontos estiver ativa, atualiza ou cria o polyline com traço fino e elegante (2.5px)
    if (showLine) {
      if (polylineRef.current) {
        polylineRef.current.setLatLngs(latLngs);
        polylineRef.current.setStyle({
          color: colors.numberCircleColor || "#dc2626",
          weight: 2.5,
          opacity: 0.9,
        });
      } else if (latLngs.length > 1) {
        polylineRef.current = L.polyline(latLngs, {
          color: colors.numberCircleColor || "#dc2626",
          weight: 2.5,
          opacity: 0.9,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(map);
      }
    } else {
      if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }
    }

    if (coordsList.length === 0) return;

    const latest = coordsList[coordsList.length - 1];

    if (options?.followLatest || autoLoadEnabled) {
      // Mantém o nível de zoom atual selecionado pelo usuário e desloca o centro para a coordenada mais recente.
      // Se o zoom estiver no nível inicial continental (ex: <= 5), aproxima automaticamente para zoom 16 para acompanhar o percurso.
      const currentZoom = map.getZoom();
      const targetZoom = currentZoom <= 5 ? 16 : currentZoom;
      map.setView([latest.lat, latest.lng], targetZoom, { animate: true });
    } else {
      // Ajuste inicial ou manual de enquadramento
      if (coordsList.length > 1) {
        map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40] });
      } else if (coordsList.length === 1) {
        map.setView([latest.lat, latest.lng], 16);
      }
    }
  }, [radius, colors, showLine, autoLoadEnabled]);

  // Auto-save e auto-update do mapa
  // Refs para evitar re-renders desnecessários no auto-save
  const inputTextRef = useRef(inputText);
  const activeCirclesRef = useRef(activeCircles);

  // Sincronizar refs com estado
  useEffect(() => { inputTextRef.current = inputText; }, [inputText]);
  useEffect(() => { activeCirclesRef.current = activeCircles; }, [activeCircles]);

  // Quando habilitado, qualquer registro novo atualiza imediatamente o estado e os marcadores do mapa.
  useEffect(() => {
    if (!autoLoadEnabled || !dataLoaded) return;
    const parsed = parseCoordenadas(inputText);
    setCoords(parsed);
    const isNewPointAdded = parsed.length > prevCoordsCountRef.current && prevCoordsCountRef.current > 0;
    prevCoordsCountRef.current = parsed.length;
    if (mapRef.current) {
      renderizarNoMapa(parsed, mapRef.current, { followLatest: isNewPointAdded || autoLoadEnabled });
    }
  }, [autoLoadEnabled, dataLoaded, inputText, parseCoordenadas, renderizarNoMapa]);

  // Atualizar raio dos círculos dinamicamente e reconstruir markers
  const handleRadiusChange = useCallback((newRadius: number) => {
    setRadius(newRadius);
    activeCircles.forEach((c, index) => {
      c.circle.setRadius(newRadius);
      const isFirst = index === 0;
      const isLast = index === activeCircles.length - 1;
      const variant = showLine ? (isFirst ? "start" : isLast ? "end" : "waypoint") : "normal";
      const icon = createMarkerIcon(index, colors, variant);
      c.marker.setIcon(icon);
    });
  }, [activeCircles, colors, showLine]);

  // Traçar/remover linha conectando todos os pontos
  const handleToggleLine = useCallback(() => {
    if (!mapRef.current) {
      setStatus({ type: "info", message: "Mapa não disponível." });
      return;
    }
    const currentCoords = coords.length > 0 ? coords : parseCoordenadas(inputText);
    if (currentCoords.length < 2) {
      setStatus({ type: "info", message: "Adicione pelo menos 2 pontos para traçar a linha." });
      return;
    }

    setShowLine((prev) => {
      const next = !prev;
      setStatus({
        type: next ? "success" : "info",
        message: next ? `Linha traçada conectando ${currentCoords.length} pontos.` : "Linha removida. Círculos de raio restaurados."
      });
      return next;
    });
  }, [coords, inputText, parseCoordenadas]);

  // Sempre que showLine alternar, atualiza a exibição no mapa imediatamente
  useEffect(() => {
    if (!mapRef.current) return;
    const currentCoords = coords.length > 0 ? coords : parseCoordenadas(inputText);
    if (currentCoords.length > 0) {
      renderizarNoMapa(currentCoords, mapRef.current, { followLatest: autoLoadEnabled });
    }
  }, [showLine]);

  // Enquadrar percurso inteiro a qualquer momento
  const handleFitAllBounds = useCallback(() => {
    if (!mapRef.current) return;
    const currentCoords = coords.length > 0 ? coords : parseCoordenadas(inputText);
    if (currentCoords.length === 0) {
      setStatus({ type: "info", message: "Nenhum ponto para enquadrar." });
      return;
    }
    const latLngs: [number, number][] = currentCoords.map(c => [c.lat, c.lng]);
    if (latLngs.length > 1) {
      mapRef.current.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40] });
    } else {
      mapRef.current.setView(latLngs[0], 16);
    }
    setStatus({ type: "info", message: "Mapa enquadrado em todo o percurso." });
  }, [coords, inputText, parseCoordenadas]);

  // Parar e limpar todos os recursos do modo de coleta por permanência
  const stopStationaryCapture = useCallback((message = "Coletar pausas no movimento interrompida.") => {
    const nativeBridge = getNativeGpsBridge();
    if (nativeBridge) {
      nativeBridge.stop();
    }
    if (stationaryWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(stationaryWatchIdRef.current);
      stationaryWatchIdRef.current = null;
    }
    if (stationaryTickerRef.current) {
      clearInterval(stationaryTickerRef.current);
      stationaryTickerRef.current = null;
    }
    stationaryStableSinceRef.current = null;
    stationaryAnchorRef.current = null;
    stationaryLastPositionRef.current = null;
    stationaryHasCapturedRef.current = false;
    setStationaryElapsedSeconds(0);
    setStationaryCapture(false);
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
    setStatus({ type: "info", message });
  }, []);

  // Iniciar coleta somente após o GPS confirmar permanência sem deslocamento
  const handleStartStationaryCapture = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus({ type: "error", message: "Geolocalização não suportada neste navegador." });
      return;
    }
    if (continuousCapture) {
      setStatus({ type: "info", message: "Pare primeiro a captura contínua por intervalo para usar a coleta por permanência." });
      return;
    }

    const waitStr = window.prompt(
      `Tempo de permanência imóvel, em segundos (mínimo ${STATIONARY_MIN_SECONDS}):`,
      String(stationaryWaitSeconds),
    );
    if (waitStr === null) return;

    const waitSeconds = Number.parseInt(waitStr, 10);
    if (!Number.isFinite(waitSeconds) || waitSeconds < STATIONARY_MIN_SECONDS) {
      setStatus({ type: "error", message: `Tempo inválido. Informe um número inteiro de pelo menos ${STATIONARY_MIN_SECONDS} segundos.` });
      return;
    }

    setStationaryWaitSeconds(waitSeconds);
    setStationaryElapsedSeconds(0);
    stationaryStableSinceRef.current = null;
    stationaryAnchorRef.current = null;
    stationaryLastPositionRef.current = null;
    stationaryHasCapturedRef.current = false;
    setStationaryCapture(true);
    const nativeBridge = getNativeGpsBridge();
    if (nativeBridge?.startStationary) {
      nativeBridge.startStationary(waitSeconds);
      setStatus({ type: "success", message: `Coleta nativa de pausas ativada: registra após ${waitSeconds}s sem deslocamento, inclusive em background.` });
      return;
    }
    setStatus({ type: "info", message: `Monitorando deslocamento. A coleta ocorrerá após ${waitSeconds}s imóvel.` });

    const recordCapture = (position: GeolocationPosition) => {
      const { latitude, longitude, speed, accuracy } = position.coords;
      const now = Date.now();
      const stableSince = stationaryStableSinceRef.current ?? now;
      const elapsedSeconds = Math.max(1, (now - stableSince) / 1000);
      const anchor = stationaryAnchorRef.current;
      const derivedSpeedKmh = anchor
        ? distanceMeters(anchor.lat, anchor.lng, latitude, longitude) / elapsedSeconds * 3.6
        : 0;
      const speedKmh = speed != null && Number.isFinite(speed) ? speed * 3.6 : derivedSpeedKmh;
      const timestamp = getTimestamp();
      const timestampMs = timestampToMillis(timestamp);
      if (!Number.isFinite(speedKmh) || speedKmh > 2.5 || isAnomalousAutomaticCapture({ latitude, longitude, speedKmh, accuracy }, lastRecordedPointRef.current, timestampMs, true)) {
        setStatus({ type: "info", message: "Pausa não registrada: a velocidade ainda não está próxima de zero ou a posição foi considerada anômala." });
        stationaryHasCapturedRef.current = false;
        return;
      }
      sequenceCounterRef.current += 1;
      const lat = latitude.toFixed(6);
      const lng = longitude.toFixed(6);
      const novaCoord = `[${timestamp}] Coleta #${sequenceCounterRef.current} (permanência ${waitSeconds}s), ${lat},${lng}${formatGpsMetadata({
        speedKmh,
        bearingDegrees: position.coords.heading != null && Number.isFinite(position.coords.heading) ? position.coords.heading : undefined,
        altitudeMeters: position.coords.altitude != null && Number.isFinite(position.coords.altitude) ? position.coords.altitude : undefined,
        accuracy,
      })}${addSegmentMetadata(latitude, longitude, timestamp)}`;
      setInputText((prev) => appendLogRecord(prev, novaCoord));
      stationaryHasCapturedRef.current = true;
      setStatus({ type: "success", message: `Coleta realizada após ${waitSeconds}s sem deslocamento: ${lat}, ${lng}.` });
    };

    stationaryWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const current = { lat: position.coords.latitude, lng: position.coords.longitude };
        const now = Date.now();
        const anchor = stationaryAnchorRef.current;

        stationaryLastPositionRef.current = position;

        if (!anchor) {
          stationaryAnchorRef.current = current;
          stationaryStableSinceRef.current = now;
          stationaryHasCapturedRef.current = false;
          setStationaryElapsedSeconds(0);
          return;
        }

        const movedMeters = distanceMeters(anchor.lat, anchor.lng, current.lat, current.lng);
        if (movedMeters > STATIONARY_MOVEMENT_THRESHOLD_METERS) {
          stationaryAnchorRef.current = current;
          stationaryStableSinceRef.current = now;
          stationaryHasCapturedRef.current = false;
          setStationaryElapsedSeconds(0);
          setStatus({ type: "info", message: `Deslocamento de ${movedMeters.toFixed(1)}m detectado. Contagem reiniciada.` });
          return;
        }

        const stableSince = stationaryStableSinceRef.current ?? now;
        stationaryStableSinceRef.current = stableSince;
        const elapsedSeconds = Math.floor((now - stableSince) / 1000);
        setStationaryElapsedSeconds(Math.min(elapsedSeconds, waitSeconds));

        if (elapsedSeconds >= waitSeconds && !stationaryHasCapturedRef.current) {
          recordCapture(position);
        }
      },
      (error) => {
        const msgs: Record<number, string> = {
          1: "Permissão de localização negada.",
          2: "Localização indisponível.",
          3: "Tempo esgotado ao obter localização.",
        };
        setStatus({ type: "error", message: msgs[error.code] || "Erro ao monitorar a localização." });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );

    stationaryTickerRef.current = setInterval(() => {
      const stableSince = stationaryStableSinceRef.current;
      if (!stableSince) return;

      const elapsedSeconds = Math.floor((Date.now() - stableSince) / 1000);
      setStationaryElapsedSeconds(Math.min(elapsedSeconds, waitSeconds));

      // O GPS pode não emitir outro evento enquanto a pessoa está imóvel.
      // Nesse caso, a última posição recebida é a evidência disponível de estabilidade.
      if (elapsedSeconds >= waitSeconds && !stationaryHasCapturedRef.current && stationaryLastPositionRef.current) {
        recordCapture(stationaryLastPositionRef.current);
      }
    }, 1000);
  }, [continuousCapture, stationaryWaitSeconds]);

  const coordsRef = useRef(coords);
  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  const renderizarNoMapaRef = useRef(renderizarNoMapa);
  useEffect(() => {
    renderizarNoMapaRef.current = renderizarNoMapa;
  }, [renderizarNoMapa]);

  // handleMapReady: long-press (3s) captura a coordenada exata do clique/toque
  // Abordagem unificada:
  // 1. mousedown/touchstart: registra timestamp e inicia timer de 3s
  // 2. Timer de 3s: marca flag "readyToCapture"
  // 3. map.addListener('click'): se readyToCapture, captura lat/lng da API
  // 4. Se soltou antes de 3s: cancela, o click normal é ignorado
  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
    if (coordsRef.current.length > 0) {
      renderizarNoMapaRef.current(coordsRef.current, map);
    }

    const LONG_PRESS_DELAY = 3000;
    const TICK_INTERVAL = 100;

    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    let holdTimer: ReturnType<typeof setInterval> | null = null;
    let progress = 0;
    let cancelled = false;
    let isPressing = false;
    let readyToCapture = false;
    let lastClickLatLng: { lat: number; lng: number } | null = null;
    let lastPointerPosition: { clientX: number; clientY: number } | null = null;

    const cancelPress = () => {
      cancelled = true;
      isPressing = false;
      readyToCapture = false;
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      if (holdTimer) { clearInterval(holdTimer); holdTimer = null; }
      setLongPressProgress(0);
    };

    const mapDiv = map.getContainer();

    const pointFromPointer = (clientX: number, clientY: number) => {
      const rect = mapDiv.getBoundingClientRect();
      const containerPoint = L.point(clientX - rect.left, clientY - rect.top);
      return map.containerPointToLatLng(containerPoint);
    };

    const captureMapPoint = (latLng: { lat: number; lng: number }) => {
      setMapClickedCoord({ lat: latLng.lat, lng: latLng.lng });
      setShowObservationModal(true);
      setStatus({ type: "info", message: `Coordenada capturada: ${latLng.lat.toFixed(6)}, ${latLng.lng.toFixed(6)}` });
      cancelPress();
    };

    // Mantém um fallback de clique, mas o long-press principal usa a posição do ponteiro diretamente.
    const onMapClick = (e: L.LeafletMouseEvent) => {
      lastClickLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (readyToCapture) captureMapPoint(e.latlng);
    };
    map.on("click", onMapClick);

    // --- DESKTOP: mousedown com timer ---
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('.leaflet-control, .leaflet-popup, .custom-map-marker')) return;

      isPressing = true;
      cancelled = false;
      readyToCapture = false;
      lastPointerPosition = { clientX: e.clientX, clientY: e.clientY };
      progress = 0;
      setLongPressProgress(0);

      pressTimer = setTimeout(() => {
        if (cancelled) return;
        const point = lastPointerPosition && pointFromPointer(lastPointerPosition.clientX, lastPointerPosition.clientY);
        if (point) {
          captureMapPoint(point);
        } else {
          readyToCapture = true;
        }
      }, LONG_PRESS_DELAY);

      holdTimer = setInterval(() => {
        if (cancelled) return;
        progress += (TICK_INTERVAL / LONG_PRESS_DELAY) * 100;
        if (progress >= 100) progress = 100;
        setLongPressProgress(Math.round(progress));
      }, TICK_INTERVAL);
    };

    const onMouseUp = () => {
      // Se soltou antes de 3s, cancela. O click do mapa vai disparar
      // mas readyToCapture será false, então será ignorado.
      if (isPressing && !readyToCapture) cancelPress();
    };
    const onMouseLeave = () => {
      if (isPressing && !readyToCapture) cancelPress();
    };

    mapDiv.addEventListener("mousedown", onMouseDown, { capture: true });
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mouseleave", onMouseLeave);

    // --- MOBILE: touchstart com timer ---
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement;
      if (target.closest('.leaflet-control, .leaflet-popup, .custom-map-marker')) return;

      isPressing = true;
      cancelled = false;
      readyToCapture = false;
      const touch = e.touches[0];
      lastPointerPosition = { clientX: touch.clientX, clientY: touch.clientY };
      progress = 0;
      setLongPressProgress(0);

      pressTimer = setTimeout(() => {
        if (cancelled) return;
        const point = lastPointerPosition && pointFromPointer(lastPointerPosition.clientX, lastPointerPosition.clientY);
        if (point) {
          captureMapPoint(point);
        } else {
          readyToCapture = true;
        }
      }, LONG_PRESS_DELAY);

      holdTimer = setInterval(() => {
        if (cancelled) return;
        progress += (TICK_INTERVAL / LONG_PRESS_DELAY) * 100;
        if (progress >= 100) progress = 100;
        setLongPressProgress(Math.round(progress));
      }, TICK_INTERVAL);
    };

    const onTouchEnd = () => {
      // No mobile, o touchend acontece antes do 'click'
      // Se readyToCapture, mantemos o flag para o click handler capturar
      if (isPressing && !readyToCapture) cancelPress();
    };
    const onTouchCancel = () => { cancelPress(); };
    const onTouchMove = () => {
      if (isPressing) cancelPress();
    };

    mapDiv.addEventListener("touchstart", onTouchStart, { passive: true });
    mapDiv.addEventListener("touchend", onTouchEnd, { passive: true });
    mapDiv.addEventListener("touchcancel", onTouchCancel, { passive: true });
    mapDiv.addEventListener("touchmove", onTouchMove, { passive: true });

    // Cleanup
    return () => {
      cancelPress();
      map.off("click", onMapClick);
      mapDiv.removeEventListener("mousedown", onMouseDown, { capture: true });
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mouseleave", onMouseLeave);
      mapDiv.removeEventListener("touchstart", onTouchStart);
      mapDiv.removeEventListener("touchend", onTouchEnd);
      mapDiv.removeEventListener("touchcancel", onTouchCancel);
      mapDiv.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  const handleAskTrack = useCallback((question: string) => {
    const data = inputText.trim();
    if (!data) {
      setAnalysisMessages(previous => [...previous, { role: "assistant", content: "Ainda não há coordenadas na área de dados para analisar." }]);
      return;
    }
    setAnalysisMessages(previous => [...previous, { role: "user", content: question }]);
    setIsAnalyzing(true);
    setTimeout(() => {
      try {
        const answer = answerDisplacementQuestion(question, data);
        setAnalysisMessages(previous => [...previous, { role: "assistant", content: answer }]);
      } catch (err: any) {
        setAnalysisMessages(previous => [...previous, { role: "assistant", content: `Não foi possível analisar os dados: ${err?.message || "erro ao processar métricas"}` }]);
      } finally {
        setIsAnalyzing(false);
      }
    }, 150);
  }, [inputText]);

  const handleLimpar = useCallback(() => {
    if (stationaryCapture) {
      stopStationaryCapture("Coletar pausas no movimento interrompida e dados limpos.");
    }
    setInputText("");
    setCoords([]);
    setRadius(3);
    setStatus({ type: "idle", message: "" });
    sequenceCounterRef.current = 0;
    prevCoordsCountRef.current = 0;
    lastRecordedPointRef.current = null;

    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    activeCirclesRef.current.forEach((c) => {
      c.circle.remove();
      c.marker.remove();
    });
    activeCirclesRef.current = [];
    setActiveCircles([]);

    const nativeBridge = getNativeGpsBridge();
    if (nativeBridge?.clearPendingLocations) {
      nativeBridge.clearPendingLocations();
    }

    // Só limpar o localStorage via botão Limpar
    localStorage.removeItem(DATA_STORAGE_KEY);
  }, [stationaryCapture, stopStationaryCapture]);

  // Selecionar cor para um elemento
  const handleSelectColor = useCallback((colorKey: keyof ColorConfig, color: string) => {
    const newColors = { ...colors, [colorKey]: color };
    setColors(newColors);
    saveColors(newColors);
    setSelectedElement(null);

    // Atualiza os marcadores e círculos existentes sem precisar recarregar
    if (activeCircles.length > 0) {
      activeCircles.forEach((c, index) => {
        // Atualiza ícone do marcador
        const icon = createMarkerIcon(index, newColors);
        c.marker.setIcon(icon);

        // Atualiza círculo de raio
        if (colorKey === "circleFillColor") {
          c.circle.setStyle({ fillColor: color, fillOpacity: 0.3 });
        } else if (colorKey === "circleBorderColor") {
          c.circle.setStyle({ color: color });
        }
      });
    }
  }, [colors, activeCircles]);

  // Resetar cores para padrão
  const handleResetColors = useCallback(() => {
    setColors({ ...DEFAULT_COLORS });
    saveColors(DEFAULT_COLORS);
    setSelectedElement(null);

    // Atualiza os marcadores e círculos existentes
    if (activeCircles.length > 0) {
      activeCircles.forEach((c, index) => {
        const icon = createMarkerIcon(index, DEFAULT_COLORS);
        c.marker.setIcon(icon);
        c.circle.setStyle({
          fillColor: DEFAULT_COLORS.circleFillColor,
          fillOpacity: 0.3,
          color: DEFAULT_COLORS.circleBorderColor,
        });
      });
    }
  }, [activeCircles]);

  const formatRadius = useMemo(() => {
    return `${radius.toFixed(1)} m`;
  }, [radius]);

  // Cleanup no desmonte do componente
  useEffect(() => {
    return () => {
      if (continuousIntervalRef.current) {
        clearInterval(continuousIntervalRef.current);
        continuousIntervalRef.current = null;
      }
      if (stationaryWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(stationaryWatchIdRef.current);
        stationaryWatchIdRef.current = null;
      }
      if (stationaryTickerRef.current) {
        clearInterval(stationaryTickerRef.current);
        stationaryTickerRef.current = null;
      }
      if (watchPositionIdRef.current) {
        navigator.geolocation.clearWatch(watchPositionIdRef.current);
        watchPositionIdRef.current = null;
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, []);

  const displayedStationaryElapsedSeconds = stationaryCapture && nativeDiagnostics?.mode === "stationary" && Number.isFinite(nativeDiagnostics.stationaryElapsedSeconds)
    ? Math.min(nativeDiagnostics.stationaryElapsedSeconds ?? 0, stationaryWaitSeconds)
    : stationaryElapsedSeconds;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
        <img
          src="/manus-storage/logo_35b01b42.png"
          alt="Logo"
          className="w-7 h-7"
        />
        <h1 className="min-w-0 flex-1 truncate font-display font-semibold text-base text-foreground tracking-tight">
          Mapa de Coordenadas
        </h1>
        {coords.length > 0 && (
          <span className="text-xs font-mono text-muted-foreground ml-auto">
            {coords.length} ponto{coords.length !== 1 ? "s" : ""}
          </span>
        )}
      </header>

      {/* Main content */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        {/* Painel lateral de entrada — oculto no mobile quando mapa expandido */}
        <aside className={`${mapExpanded && isMobile ? "hidden" : "flex"} w-full md:w-[380px] lg:w-[420px] shrink-0 md:border-r border-b md:border-b-0 border-border bg-card px-4 py-4 md:px-5 md:py-5 flex-col gap-4 overflow-y-auto overscroll-contain md:h-full md:max-h-none max-h-[calc(100dvh-7.5rem)] min-h-0 z-10`}>
          {/* Cabeçalho do painel */}
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-display font-semibold text-primary uppercase tracking-[0.16em]">Painel de coleta</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Registre, revise e organize suas coordenadas.</p>
            </div>
            {coords.length > 0 && (
              <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] font-mono text-primary">
                {coords.length} ponto{coords.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Formato */}
          <div className="shrink-0 rounded-xl border border-border bg-background/70 p-3.5">
            <p className="mb-1.5 text-[11px] font-display font-semibold text-muted-foreground uppercase tracking-wider">Formato dos dados</p>
            <code className="block text-[11px] font-mono leading-relaxed text-primary break-words">
              [timestamp], obs, lat, lng, dir, alt, speed, speed_acc, acc, dist, time;
            </code>
          </div>

          {/* Ações de captura */}
          <section className="flex shrink-0 flex-col gap-2" aria-label="Ações de captura">
            <div className="flex items-center gap-2 px-1">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[10px] font-display font-semibold uppercase tracking-[0.16em] text-muted-foreground">Captura</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            {/* Botão Capturar GPS em destaque */}
          <Button
            onClick={() => setShowObservationModal(true)}
            disabled={capturingGPS}
            size="sm"
            className="w-full min-w-0 shrink-0 gap-2 h-11 whitespace-normal text-center text-sm leading-tight font-display font-semibold bg-primary text-primary-foreground border-primary hover:bg-primary/90 shadow-lg shadow-cyan-950/30 transition-all active:scale-[0.97] duration-160"
          >
            {capturingGPS ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Crosshair className="w-5 h-5" />
            )}
            Capturar GPS
          </Button>

          {/* Captura contínua */}
          {continuousCapture ? (
              <Button
                onClick={() => {
                  setContinuousCapture(false);
                  getNativeGpsBridge()?.stop();
                  // Parar timer local
                  if (continuousIntervalRef.current) {
                    clearInterval(continuousIntervalRef.current);
                    continuousIntervalRef.current = null;
                  }
                  if (watchPositionIdRef.current) {
                    navigator.geolocation.clearWatch(watchPositionIdRef.current);
                    watchPositionIdRef.current = null;
                  }
                  if (wakeLockRef.current) {
                    wakeLockRef.current.release().catch(() => {});
                    wakeLockRef.current = null;
                  }
                  // Remover estado persistente (não deve retomar)
                  continuousStateRef.current = null;
                  lastCaptureTimeRef.current = 0;
                  saveContinuousState(null);
                  lastKnownPositionRef.current = null;
                  setStatus({ type: "info", message: "Captura contínua interrompida." });
                }}
                variant="outline"
                size="sm"
                className="w-full min-w-0 gap-2 min-h-9 h-auto py-2 whitespace-normal text-center text-xs leading-tight border-red-700/40 text-red-400 hover:bg-red-950/30 hover:text-red-300 transition-all active:scale-[0.97] duration-160"
              >
                <Square className="w-3 h-3" />
                Parar captura contínua
              </Button>
            ) : (
              <Button
                onClick={async () => {
                  if (!navigator.geolocation) {
                    setStatus({ type: "error", message: "Geolocalização não suportada neste navegador." });
                    return;
                  }
                  if (stationaryCapture) {
                    setStatus({ type: "info", message: "Pare primeiro a Coletar pausas no movimento por permanência." });
                    return;
                  }
                  const intervalStr = prompt("Intervalo de captura (em segundos):", "5");
                  if (intervalStr === null) return;
                  const seconds = parseInt(intervalStr, 10);
                  if (isNaN(seconds) || seconds < 1) {
                    setStatus({ type: "error", message: "Intervalo inválido. Use um número >= 1." });
                    return;
                  }
                  const nativeBridge = getNativeGpsBridge();
                  setContinuousCapture(true);
                  setCaptureInterval(seconds);
                  captureIntervalRef2.current = seconds;
                  lastCaptureTimeRef.current = Date.now();
                  wasInBackgroundRef.current = false;

                  // Persistir estado no localStorage para retomada após page discard
                  continuousStateRef.current = {
                    active: true,
                    interval: seconds,
                    startedAt: Date.now(),
                    lastCaptureTime: Date.now(),
                    sequenceCount: sequenceCounterRef.current,
                  };
                  saveContinuousState(continuousStateRef.current);

                  setStatus({
                    type: "success",
                    message: nativeBridge
                      ? `Captura nativa ativada (a cada ${seconds}s), inclusive em background.`
                      : `Captura contínua ativada (a cada ${seconds}s). O navegador pode suspender a coleta em background.`,
                  });

                  if (nativeBridge) {
                    nativeBridge.start(seconds);
                    return;
                  }

                  // watchPosition para manter lastKnownPositionRef atualizado
                  watchPositionIdRef.current = navigator.geolocation.watchPosition(
                    (pos) => {
                      lastKnownPositionRef.current = pos;
                    },
                    () => {},
                    { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
                  );

                  // Função para registrar uma captura, descartando saltos implausíveis.
                  const recordCapture = (position: GeolocationPosition, timestamp = getTimestamp()) => {
                    const { latitude, longitude, speed, accuracy } = position.coords;
                    const speedKmh = speed != null && Number.isFinite(speed) ? speed * 3.6 : undefined;
                    const timestampMs = timestampToMillis(timestamp);
                    if (isAnomalousAutomaticCapture({ latitude, longitude, speedKmh, accuracy }, lastRecordedPointRef.current, timestampMs)) {
                      setStatus({ type: "info", message: "Leitura automática descartada por possível anomalia de deslocamento." });
                      return;
                    }
                    sequenceCounterRef.current += 1;
                    const observation = `Coleta #${sequenceCounterRef.current} (intervalo ${captureIntervalRef2.current}s)`;
                    const novaCoord = `[${timestamp}] ${observation}, ${latitude.toFixed(6)},${longitude.toFixed(6)}${formatGpsMetadata({
                      speedKmh,
                      bearingDegrees: position.coords.heading != null && Number.isFinite(position.coords.heading) ? position.coords.heading : undefined,
                      altitudeMeters: position.coords.altitude != null && Number.isFinite(position.coords.altitude) ? position.coords.altitude : undefined,
                      accuracy,
                    })}${addSegmentMetadata(latitude, longitude, timestamp)}`;
                    setInputText((prev) => appendLogRecord(prev, novaCoord));
                  };

                  // Intervalo PRINCIPAL: a cada N segundos, captura a posição com timeout curto
                  // Se o GPS não responder a tempo, usa a última posição conhecida
                  const doCapture = () => {
                    lastCaptureTimeRef.current = Date.now();
                    // Atualizar estado persistente a cada captura
                    if (continuousStateRef.current) {
                      continuousStateRef.current.lastCaptureTime = Date.now();
                      continuousStateRef.current.sequenceCount = sequenceCounterRef.current;
                      saveContinuousState(continuousStateRef.current);
                    }
                    
                    // Timeout para o GPS - se não responder em 2s, usa última posição
                    let resolved = false;
                    const timeoutId = setTimeout(() => {
                      if (!resolved) {
                        resolved = true;
                        if (lastKnownPositionRef.current) {
                          recordCapture(lastKnownPositionRef.current, getTimestamp());
                        } else {
                          // Sem posição conhecida - tentar sem timeout curto
                          navigator.geolocation.getCurrentPosition(
                            (pos) => {
                              lastKnownPositionRef.current = pos;
                              recordCapture(pos, getTimestamp());
                            },
                            () => {
                              // GPS completamente indisponível - registrar com zeros e mostrar erro
                              setStatus({ type: "error", message: "GPS indisponível. Verifique as permissões de localização." });
                            },
                            { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
                          );
                        }
                      }
                    }, 2000);

                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        if (resolved) return;
                        resolved = true;
                        clearTimeout(timeoutId);
                        lastKnownPositionRef.current = pos;
                        recordCapture(pos, getTimestamp());
                      },
                      () => {
                        // GPS falhou - usar última posição conhecida
                        if (!resolved) {
                          resolved = true;
                          clearTimeout(timeoutId);
                          if (lastKnownPositionRef.current) {
                            recordCapture(lastKnownPositionRef.current, getTimestamp());
                          }
                        }
                      },
                      { enableHighAccuracy: true, maximumAge: 5000, timeout: 2000 }
                    );
                  };

                  // Intervalo principal
                  continuousIntervalRef.current = setInterval(doCapture, seconds * 1000);

                  // Captura inicial imediata
                  doCapture();
                }}
                variant="outline"
                size="sm"
                disabled={stationaryCapture}
                className="w-full min-w-0 shrink-0 gap-2 min-h-9 h-auto py-2 whitespace-normal text-center text-xs leading-tight border-primary/40 text-primary hover:bg-primary/10 hover:text-primary transition-all active:scale-[0.97] duration-160 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="w-3 h-3" />
                Captura contínua (intervalo)
              </Button>
            )}

          {/* Coleta por permanência imóvel */}
          {stationaryCapture ? (
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => stopStationaryCapture()}
                variant="outline"
                size="sm"
                className="w-full min-w-0 gap-2 min-h-9 h-auto py-2 whitespace-normal text-center text-xs leading-tight border-red-700/40 text-red-400 hover:bg-red-950/30 hover:text-red-300 transition-all active:scale-[0.97] duration-160"
              >
                <Square className="w-3 h-3" />
                Parar Coletar pausas no movimento
              </Button>
              <div className="rounded-md border border-amber-700/30 bg-amber-950/10 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-amber-300">
                  <span>Imóvel por</span>
                  <span>{displayedStationaryElapsedSeconds}s / {stationaryWaitSeconds}s</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full bg-amber-400 transition-[width] duration-300"
                    style={{ width: `${Math.min((displayedStationaryElapsedSeconds / stationaryWaitSeconds) * 100, 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  A posição só será registrada depois de permanecer sem deslocamento.
                </p>
              </div>
            </div>
          ) : (
            <Button
              onClick={handleStartStationaryCapture}
              disabled={continuousCapture}
              variant="outline"
              size="sm"
                className="w-full min-w-0 gap-2 min-h-9 h-auto py-2 whitespace-normal text-center text-xs leading-tight border-amber-700/40 text-amber-300 hover:bg-amber-950/30 hover:text-amber-200 transition-all active:scale-[0.97] duration-160 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Clock className="w-3 h-3" />
              Coletar pausas no movimento
            </Button>
          )}

          </section>

          {/* Área principal de dados */}
          <div className="flex shrink-0 min-h-0 flex-col gap-2">
            <div className="flex shrink-0 items-center justify-between gap-3 px-1">
              <label htmlFor="coordinate-data" className="text-[11px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
                Dados da coleta
              </label>
              <span className="shrink-0 text-[10px] font-mono text-muted-foreground">
                {inputText.trim() ? `${inputText.length} caracteres` : "aguardando dados"}
              </span>
            </div>
            <Textarea
              id="coordinate-data"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="[AAAAMMDDhhmmss] observação, lat,lng; [AAAAMMDDhhmmss] observação, lat,lng"
              className="field-sizing-fixed h-[220px] min-h-[200px] max-h-[320px] w-full resize-y overflow-y-auto bg-background font-mono text-sm leading-relaxed border-border focus:border-primary/50 transition-colors"
            />
            <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
              Você pode editar o texto manualmente. Os dados permanecem salvos neste dispositivo.
            </p>
          </div>

          {nativeDiagnostics && (
            <section className="flex shrink-0 flex-col gap-2 rounded-xl border border-cyan-900/40 bg-cyan-950/10 p-3" aria-label="Diagnóstico do GPS Android">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-cyan-300">Diagnóstico Android</span>
                <span className={`text-[10px] font-mono ${nativeDiagnostics.service === "active" ? "text-emerald-400" : nativeDiagnostics.service === "error" ? "text-red-400" : "text-amber-300"}`}>
                  {nativeDiagnostics.service === "active" ? "serviço ativo" : nativeDiagnostics.service === "error" ? "erro" : "parado"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono text-muted-foreground">
                <span>Ponte: <b className={nativeDiagnostics.bridge ? "text-emerald-400" : "text-red-400"}>{nativeDiagnostics.bridge ? "OK" : "não detectada"}</b></span>
                <span>Localização: <b className={nativeDiagnostics.foregroundLocation ? "text-emerald-400" : "text-red-400"}>{nativeDiagnostics.foregroundLocation ? "permitida" : "negada"}</b></span>
                <span>Background: <b className={nativeDiagnostics.backgroundLocation ? "text-emerald-400" : "text-amber-300"}>{nativeDiagnostics.backgroundLocation ? "permitido" : "verificar"}</b></span>
                <span>Notificações: <b className={nativeDiagnostics.notifications ? "text-emerald-400" : "text-amber-300"}>{nativeDiagnostics.notifications ? "ativas" : "desativadas"}</b></span>
                <span>Modo: <b className="text-foreground">{nativeDiagnostics.mode === "stationary" ? `pausas ${nativeDiagnostics.stationaryWaitSeconds}s` : `intervalo ${nativeDiagnostics.intervalSeconds || "—"}s`}</b></span>
                <span>Pendentes: <b className="text-foreground">{nativeDiagnostics.pendingCount}</b></span>
                <span>Velocidade: <b className="text-foreground">{Number.isFinite(nativeDiagnostics.instantSpeedKmh) ? `${nativeDiagnostics.instantSpeedKmh!.toFixed(1)} km/h` : "—"}</b></span>
                <span>Último segmento: <b className="text-foreground">{Number.isFinite(nativeDiagnostics.lastSegmentDistanceMeters) ? `${nativeDiagnostics.lastSegmentDistanceMeters!.toFixed(1)} m` : "—"}</b></span>
                <span>Tempo desde anterior: <b className="text-foreground">{Number.isFinite(nativeDiagnostics.elapsedSincePreviousSeconds) ? `${nativeDiagnostics.elapsedSincePreviousSeconds!.toFixed(1)} s` : "—"}</b></span>
              </div>
              {(nativeDiagnostics.lastTimestamp || nativeDiagnostics.lastLatitude) && (
                <p className="break-all text-[10px] font-mono text-muted-foreground">
                  Último ponto: {nativeDiagnostics.lastTimestamp || "—"} · {nativeDiagnostics.lastLatitude || "—"},{nativeDiagnostics.lastLongitude || "—"}
                </p>
              )}
              {nativeDiagnostics.error && <p className="break-words text-[10px] text-red-300">{nativeDiagnostics.error}</p>}
            </section>
          )}

          {/* Ajustes de visualização */}
          <section className="flex shrink-0 flex-col gap-3 border-t border-border pt-4" aria-label="Ajustes de visualização">
            <div className="flex items-center gap-2 px-1">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[10px] font-display font-semibold uppercase tracking-[0.16em] text-muted-foreground">Visualização</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            {/* Slider de raio */}
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/70 p-3.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-display font-medium text-muted-foreground uppercase tracking-wider">
                Raio dos círculos
              </label>
              <span className="text-xs font-mono text-primary font-medium">
                {formatRadius}
              </span>
            </div>
            <Slider
              value={[radius]}
              min={RADIUS_MIN}
              max={RADIUS_MAX}
              step={0.1}
              onValueChange={(val) => handleRadiusChange(val[0])}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
              <span>{RADIUS_MIN}m</span>
              <span>{RADIUS_MAX}m</span>
            </div>
          </div>

          {/* Consultas inteligentes sobre o deslocamento */}
          <Button
            onClick={() => setShowTrackAnalysis(true)}
            variant="outline"
            className="w-full min-w-0 gap-2 min-h-10 h-auto py-2 whitespace-normal text-center leading-tight border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/10 transition-all active:scale-[0.97] duration-160"
          >
            <Sparkles className="w-4 h-4" />
            Perguntar sobre o deslocamento
          </Button>

          {/* Botão Configurar Cores */}
          <Button
            onClick={() => setShowColorPicker(true)}
            variant="outline"
            className="w-full min-w-0 gap-2 min-h-10 h-auto py-2 whitespace-normal text-center leading-tight border-primary/30 text-primary hover:bg-primary/10 transition-all active:scale-[0.97] duration-160"
          >
            <Palette className="w-4 h-4" />
            Configurar Cores
          </Button>

          {/* Botões principais */}
          <div className="grid grid-cols-1 min-[430px]:grid-cols-2 gap-2">
            <Button
              onClick={handleCarregar}
              className="w-full min-w-0 gap-2 whitespace-normal text-center leading-tight bg-primary hover:bg-primary/90 text-primary-foreground font-display font-medium transition-all active:scale-[0.97] duration-160"
            >
              <MapPin className="w-4 h-4" />
              Carregar
            </Button>
            <Button
              onClick={handleLimpar}
              variant="outline"
              className="w-full min-w-0 gap-2 whitespace-normal text-center leading-tight border-destructive/30 text-destructive hover:bg-destructive/10 transition-all active:scale-[0.97] duration-160"
            >
              <Trash2 className="w-4 h-4" />
              Limpar
            </Button>
          </div>
          <Button
            onClick={() => {
              const nextEnabled = !autoLoadEnabled;
              setAutoLoadEnabled(nextEnabled);
              if (nextEnabled) {
                const parsed = parseCoordenadas(inputText);
                setCoords(parsed);
                setStatus({ type: "success", message: parsed.length > 0 ? "Carregamento automático ativado." : "Carregamento automático ativado; aguardando novos pontos." });
              } else {
                setStatus({ type: "success", message: "Carregamento automático desativado." });
              }
            }}
            variant="outline"
            className={`w-full min-w-0 gap-2 whitespace-normal text-center leading-tight transition-all active:scale-[0.97] duration-160 ${autoLoadEnabled ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300" : "border-cyan-400/30 text-cyan-200 hover:bg-cyan-400/10"}`}
          >
            <RefreshCcw className="w-4 h-4" />
            {autoLoadEnabled ? "Carregamento automático: ativo" : "Carregar automaticamente"}
          </Button>

          {/* Ações de arquivo e percurso */}
          <div className="grid grid-cols-1 min-[430px]:grid-cols-2 gap-2">
            <Button
              onClick={handleToggleLine}
              variant="outline"
              className={`w-full min-w-0 min-h-9 h-auto py-2 gap-2 whitespace-normal text-center leading-tight transition-all active:scale-[0.97] duration-160 ${
                showLine
                  ? "border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
                  : "border-primary/30 text-primary hover:bg-primary/10"
              }`}
            >
              <Route className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">{showLine ? "Remover linha" : "Traçar linha"}</span>
            </Button>

            <Button
              onClick={handleFitAllBounds}
              variant="outline"
              className="w-full min-w-0 min-h-9 h-auto py-2 gap-2 whitespace-normal text-center leading-tight border-cyan-400/30 text-cyan-200 hover:bg-cyan-400/10 transition-all active:scale-[0.97] duration-160"
            >
              <Focus className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">Enquadrar percurso</span>
            </Button>
          </div>

          {/* Botão Exportar */}
          <div>
            <Button
              onClick={() => {
                const sourceText = inputText || loadSavedData();
                if (sourceText.trim() === "") {
                  setStatus({ type: "error", message: "Nenhuma coordenada para exportar." });
                  return;
                }
                const exportText = ensureLogHeader(sourceText);
                const filename = `${getTimestamp()} - Dados de geolocalização.log`;
                const nativeBridge = getNativeGpsBridge();
                if (nativeBridge?.saveTextFile?.(filename, exportText)) {
                  setStatus({ type: "success", message: `Arquivo salvo na pasta Downloads: ${filename}` });
                  return;
                }
                const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setStatus({ type: "success", message: `Arquivo exportado: ${filename}` });
              }}
              variant="outline"
              className="w-full min-w-0 min-h-9 h-auto py-2 gap-2 whitespace-normal text-center leading-tight border-primary/30 text-primary hover:bg-primary/10 transition-all active:scale-[0.97] duration-160"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">Exportar Dados</span>
            </Button>
          </div>
          </section>

          {/* Status */}
          {status.type !== "idle" && (
            <div
              className={`flex items-start gap-2 p-3 rounded-xl border text-sm ${
                status.type === "success"
                  ? "bg-green-950/30 border-green-800/50 text-green-400"
                  : status.type === "error"
                  ? "bg-red-950/30 border-red-800/50 text-red-400"
                  : "bg-muted/50 border-border text-muted-foreground"
              }`}
            >
              {status.type === "success" && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {status.type === "error" && <XCircle className="w-4 h-4 shrink-0" />}
              <span className="min-w-0 break-words font-mono text-xs leading-relaxed">{status.message}</span>
            </div>
          )}

          {/* Lista de coordenadas parseadas */}
          {coords.length > 0 && (
            <div className="flex flex-col gap-1 mt-2 max-h-[150px] overflow-y-auto">
              <p className="text-[11px] font-display font-medium text-muted-foreground uppercase tracking-wider">
                Pontos ({coords.length})
              </p>
              {coords.map((coord, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 bg-background rounded border border-border/50 text-xs font-mono"
                >
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold">
                    {i + 1}
                  </span>
                  <span className="min-w-0 break-all text-muted-foreground leading-relaxed">
                    {coord.lat.toFixed(6)}, {coord.lng.toFixed(6)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Mapa */}
        <main className={`${mapExpanded ? "fixed inset-0 z-40" : "relative flex-1 min-h-[300px] min-w-0 md:min-h-0"}`}>
          {/* Substrato cartográfico sutil enquanto o mapa carrega ou não possui pontos */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 opacity-70"
            style={{
              backgroundImage: "linear-gradient(rgba(6, 182, 212, 0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(6, 182, 212, 0.07) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          >
            <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20" />
            <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/15" />
            <span className="absolute left-1/2 top-1/2 h-px w-40 -translate-x-1/2 -translate-y-1/2 bg-primary/15" />
            <span className="absolute left-1/2 top-1/2 h-40 w-px -translate-x-1/2 -translate-y-1/2 bg-primary/15" />
          </div>
          {mapExpanded && isMobile && (
            <Button
              onClick={() => setMapExpanded(false)}
              variant="outline"
              size="sm"
              className="fixed top-16 right-4 z-50 gap-2 bg-card/90 backdrop-blur-sm border-border text-foreground hover:bg-card transition-all active:scale-[0.97] duration-160"
            >
              <Minimize2 className="w-3 h-3" />
              Fechar mapa
            </Button>
          )}
          <div className="relative z-10 h-full min-h-0">
            <MapView
              className="h-full min-h-0"
              initialCenter={{ lat: -14.235, lng: -51.9253 }}
              initialZoom={4}
              onMapReady={handleMapReady}
            />
          </div>
        </main>

        {/* Botão expandir mapa (apenas mobile) */}
        {isMobile && !mapExpanded && (
          <Button
            onClick={() => setMapExpanded(true)}
            variant="outline"
            size="sm"
            className="fixed bottom-16 right-4 z-50 gap-2 bg-card/90 backdrop-blur-sm border-border text-foreground hover:bg-card shadow-lg transition-all active:scale-[0.97] duration-160"
          >
            <Maximize2 className="w-3 h-3" />
            Mapa
          </Button>
        )}
      </div>

      {/* Status bar */}
      <footer className="flex items-center justify-between px-4 py-2 border-t border-border bg-card/60 text-xs font-mono text-muted-foreground shrink-0">
        <span className="min-w-0 break-words leading-relaxed">
          {coords.length > 0
            ? `${coords.length} coordenada${coords.length !== 1 ? "s" : ""} carregada${coords.length !== 1 ? "s" : ""} · Raio: ${formatRadius}`
            : "Nenhuma coordenada carregada"}
        </span>
        <span className="hidden sm:inline">v1.0</span>
      </footer>

      {/* Janela de consultas sobre o deslocamento */}
      {showTrackAnalysis && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-cyan-400/30 bg-card shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-cyan-300">
                  <Sparkles className="h-5 w-5 shrink-0" />
                  <h2 className="truncate font-display text-base font-semibold">Análise do deslocamento</h2>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">As respostas usam somente os registros atualmente presentes na área de dados.</p>
              </div>
              <button onClick={() => setShowTrackAnalysis(false)} className="rounded-md p-1.5 hover:bg-muted" aria-label="Fechar análise">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="min-h-0 flex-1 p-4">
              <AIChatBox
                messages={analysisMessages}
                onSendMessage={handleAskTrack}
                isLoading={isAnalyzing}
                height="min(58dvh, 520px)"
                placeholder="Ex.: qual foi a velocidade média?"
                emptyStateMessage="Faça uma pergunta sobre o deslocamento"
                suggestedPrompts={["Qual foi a hora de início e de fim?", "Qual foi a velocidade média?", "Qual foi a distância aproximada?", "Existem lacunas nos registros?"]}
                className="h-full border-0 shadow-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configuração de Cores */}
      {showColorPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
            {/* Header do modal */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-primary" />
                <h2 className="font-display font-semibold text-base text-foreground">
                  Configurar Cores
                </h2>
              </div>
              <button
                onClick={() => { setShowColorPicker(false); setSelectedElement(null); }}
                className="p-1.5 rounded-md hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Corpo do modal */}
            <div className="p-5">
              {/* Se não há elemento selecionado, mostra os 4 elementos */}
              {!selectedElement ? (
                <div className="flex flex-col gap-3">
                  {(Object.keys(COLOR_LABELS) as Array<keyof ColorConfig>).map((key) => (
                    <button
                      key={key}
                      onClick={() => setSelectedElement(key)}
                      className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border hover:border-primary/40 transition-all active:scale-[0.98] duration-160 text-left"
                    >
                      {/* Preview da cor atual */}
                      <span
                        className="w-8 h-8 rounded-full border-2 border-border shrink-0"
                        style={{ backgroundColor: colors[key] }}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">{COLOR_LABELS[key]}</span>
                        <span className="text-[11px] font-mono text-muted-foreground">{colors[key]}</span>
                      </div>
                    </button>
                  ))}

                  {/* Botão Reset */}
                  <button
                    onClick={handleResetColors}
                    className="flex items-center justify-center gap-2 mt-3 p-3 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-all active:scale-[0.98] duration-160"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span className="text-sm font-medium">Resetar para cores originais</span>
                  </button>
                </div>
              ) : (
                /* Mostra a paleta de 32 cores */
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedElement(null)}
                      className="text-xs text-primary hover:text-primary/80 font-mono transition-colors"
                    >
                      ← Voltar
                    </button>
                    <span className="text-sm font-medium text-foreground">
                      {COLOR_LABELS[selectedElement]}
                    </span>
                    <span
                      className="w-5 h-5 rounded-full border border-border"
                      style={{ backgroundColor: colors[selectedElement] }}
                    />
                  </div>

                  {/* Paleta de 32 cores em escala do espectro */}
                  <div className="grid grid-cols-8 gap-2">
                    {SPECTRUM_PALETTE.map((color, i) => (
                      <button
                        key={`${selectedElement}-${i}`}
                        onClick={() => handleSelectColor(selectedElement, color)}
                        className={`w-9 h-9 rounded-lg border-2 transition-all active:scale-90 duration-100 hover:scale-110 ${
                          colors[selectedElement] === color
                            ? "border-primary ring-2 ring-primary/40"
                            : "border-transparent hover:border-border"
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>

                  {/* Adicional: opção de cor personalizada (branco/preto) */}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Extras:</span>
                    {["#FFFFFF", "#000000", "#808080"].map((color) => (
                      <button
                        key={color}
                        onClick={() => handleSelectColor(selectedElement, color)}
                        className={`w-8 h-8 rounded-lg border-2 transition-all active:scale-90 duration-100 hover:scale-110 ${
                          colors[selectedElement] === color
                            ? "border-primary ring-2 ring-primary/40"
                            : "border-border hover:border-primary/40"
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Barra de progresso do long-press */}
      {longPressProgress > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-64">
          <div className="h-2 bg-background/80 rounded-full overflow-hidden border border-border">
            <div
              className="h-full bg-green-500 transition-all duration-300 ease-linear"
              style={{ width: `${longPressProgress}%` }}
            />
          </div>
          <p className="text-[10px] font-mono text-muted-foreground text-center mt-1">
            {longPressProgress < 100 ? `Mantenha pressionado... ${Math.round((3 * longPressProgress) / 100)}s` : ""}
          </p>
        </div>
      )}

      {/* Modal de Observação para Capturar GPS ou Mapa */}
      {showObservationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-sm mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                {mapClickedCoord ? (
                  <MapPin className="w-5 h-5 text-cyan-500" />
                ) : (
                  <Crosshair className="w-5 h-5 text-green-500" />
                )}
                <h2 className="font-display font-semibold text-base text-foreground">
                  {mapClickedCoord ? "Ponto no Mapa" : "Capturar Posição"}
                </h2>
              </div>
              <button
                onClick={() => { setShowObservationModal(false); setMapClickedCoord(null); }}
                className="p-1 rounded hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              {mapClickedCoord && (
                <p className="text-xs font-mono text-muted-foreground">
                  {mapClickedCoord.lat.toFixed(6)}, {mapClickedCoord.lng.toFixed(6)}
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-display font-medium text-muted-foreground uppercase tracking-wider">
                  Observação
                </label>
                <input
                  type="text"
                  value={observationText}
                  onChange={(e) => setObservationText(e.target.value)}
                  placeholder="Ex: Planta A, Mangueira, Poste"
                  autoFocus
                  className="w-full px-3 py-2 text-sm font-mono bg-background border border-border rounded-md focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCaptureAndClose();
                    }
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowObservationModal(false);
                    setObservationText("");
                    setMapClickedCoord(null);
                  }}
                  className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 transition-all active:scale-[0.97] duration-160"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCaptureAndClose}
                  disabled={capturingGPS}
                  className="flex-1 gap-2 bg-green-600 text-white hover:bg-green-500 font-display font-semibold transition-all active:scale-[0.97] duration-160"
                >
                  {capturingGPS ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    mapClickedCoord ? <CheckCircle2 className="w-4 h-4" /> : <Crosshair className="w-4 h-4" />
                  )}
                  Confirmar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
