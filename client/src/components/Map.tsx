/**
 * GOOGLE MAPS FRONTEND INTEGRATION - ESSENTIAL GUIDE
 *
 * USAGE FROM PARENT COMPONENT:
 * ======
 *
 * const mapRef = useRef<google.maps.Map | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 40.7128, lng: -74.0060 }}
 *   initialZoom={15}
 *   onMapReady={(map) => {
 *     mapRef.current = map; // Store to control map from parent anytime, google map itself is in charge of the re-rendering, not react state.
 * </MapView>
 *
 * ======
 * Available Libraries and Core Features:
 * -------------------------------
 * 📍 MARKER (from `marker` library)
 * - Attaches to map using { map, position }
 * new google.maps.marker.AdvancedMarkerElement({
 *   map,
 *   position: { lat: 37.7749, lng: -122.4194 },
 *   title: "San Francisco",
 * });
 *
 * -------------------------------
 * 🏢 PLACES (from `places` library)
 * - Does not attach directly to map; use data with your map manually.
 * const place = new google.maps.places.Place({ id: PLACE_ID });
 * await place.fetchFields({ fields: ["displayName", "location"] });
 * map.setCenter(place.location);
 * new google.maps.marker.AdvancedMarkerElement({ map, position: place.location });
 *
 * -------------------------------
 * 🧭 GEOCODER (from `geocoding` library)
 * - Standalone service; manually apply results to map.
 * const geocoder = new google.maps.Geocoder();
 * geocoder.geocode({ address: "New York" }, (results, status) => {
 *   if (status === "OK" && results[0]) {
 *     map.setCenter(results[0].geometry.location);
 *     new google.maps.marker.AdvancedMarkerElement({
 *       map,
 *       position: results[0].geometry.location,
 *     });
 *   }
 * });
 *
 * -------------------------------
 * 📐 GEOMETRY (from `geometry` library)
 * - Pure utility functions; not attached to map.
 * const dist = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
 *
 * -------------------------------
 * 🛣️ ROUTES (from `routes` library)
 * - Combines DirectionsService (standalone) + DirectionsRenderer (map-attached)
 * const directionsService = new google.maps.DirectionsService();
 * const directionsRenderer = new google.maps.DirectionsRenderer({ map });
 * directionsService.route(
 *   { origin, destination, travelMode: "DRIVING" },
 *   (res, status) => status === "OK" && directionsRenderer.setDirections(res)
 * );
 *
 * -------------------------------
 * 🌦️ MAP LAYERS (attach directly to map)
 * - new google.maps.TrafficLayer().setMap(map);
 * - new google.maps.TransitLayer().setMap(map);
 * - new google.maps.BicyclingLayer().setMap(map);
 *
 * -------------------------------
 * ✅ SUMMARY
 * - “map-attached” → AdvancedMarkerElement, DirectionsRenderer, Layers.
 * - “standalone” → Geocoder, DirectionsService, DistanceMatrixService, ElevationService.
 * - “data-only” → Place, Geometry utilities.
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Key, AlertCircle, RefreshCw, Check } from "lucide-react";

declare global {
  interface Window {
    google?: typeof google;
    gm_authFailure?: () => void;
  }
}

export function getGoogleMapsApiKey(): string {
  if (typeof window !== "undefined") {
    const local = localStorage.getItem("google_maps_api_key");
    if (local && local.trim().length > 0) return local.trim();
  }
  return (
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    import.meta.env.VITE_FRONTEND_FORGE_API_KEY ||
    ""
  );
}

export function setGoogleMapsApiKey(key: string): void {
  if (typeof window !== "undefined") {
    if (key.trim()) {
      localStorage.setItem("google_maps_api_key", key.trim());
    } else {
      localStorage.removeItem("google_maps_api_key");
    }
  }
}

function getMapsScriptUrl(keyOverride?: string): string {
  const apiKey = keyOverride !== undefined ? keyOverride.trim() : getGoogleMapsApiKey();
  const customForgeUrl = import.meta.env.VITE_FRONTEND_FORGE_API_URL;

  // Use custom proxy ONLY if explicitly provided and not the inaccessible default Manus cloud proxy
  if (customForgeUrl && !customForgeUrl.includes("butterfly-effect.dev")) {
    const baseUrl = `${customForgeUrl.replace(/\/+$/, "")}/v1/maps/proxy`;
    const keyParam = apiKey ? `key=${encodeURIComponent(apiKey)}&` : "";
    return `${baseUrl}/maps/api/js?${keyParam}v=weekly&libraries=marker,places,geocoding,geometry`;
  }

  // Official Google Maps JavaScript API
  const keyParam = apiKey ? `key=${encodeURIComponent(apiKey)}&` : "";
  return `https://maps.googleapis.com/maps/api/js?${keyParam}v=weekly&libraries=marker,places,geocoding,geometry`;
}

let mapScriptPromise: Promise<void> | null = null;

function loadMapScript(forceReload = false, keyOverride?: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  if (window.google?.maps && !forceReload) {
    return Promise.resolve();
  }

  if (mapScriptPromise && !forceReload) {
    return mapScriptPromise;
  }

  mapScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("google-maps-script");
    if (existing) {
      existing.remove();
    }

    // Reset google object if reloading with a new key
    if (forceReload && window.google) {
      delete (window as any).google;
    }

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = getMapsScriptUrl(keyOverride);
    script.async = true;
    script.crossOrigin = "anonymous";

    const timeout = setTimeout(() => {
      reject(new Error("Tempo limite excedido ao carregar o Google Maps. Verifique sua conexão."));
    }, 15000);

    script.onload = () => {
      clearTimeout(timeout);
      resolve();
    };

    script.onerror = (e) => {
      clearTimeout(timeout);
      mapScriptPromise = null;
      console.error("Failed to load Google Maps script", e);
      reject(new Error("Falha de rede ao carregar o script do Google Maps."));
    };

    document.head.appendChild(script);
  });

  return mapScriptPromise;
}

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
}

export function MapView({
  className,
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 12,
  onMapReady,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authFailed, setAuthFailed] = useState(false);
  const [inputKey, setInputKey] = useState("");
  const [showKeyModal, setShowKeyModal] = useState(false);

  const init = usePersistFn(async (keyOverride?: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setAuthFailed(false);

    // Register auth failure callback
    window.gm_authFailure = () => {
      console.warn("Google Maps authentication failure (gm_authFailure)");
      setAuthFailed(true);
      setErrorMessage("Chave de API inválida, restrita ou não autorizada pelo Google Maps.");
    };

    try {
      await loadMapScript(keyOverride !== undefined, keyOverride);

      if (!window.google?.maps) {
        throw new Error("Objeto google.maps não encontrado após carregamento do script.");
      }

      if (!mapContainer.current) {
        console.error("Map container not found");
        return;
      }

      map.current = new window.google.maps.Map(mapContainer.current, {
        zoom: initialZoom,
        center: initialCenter,
        mapTypeControl: true,
        fullscreenControl: true,
        zoomControl: true,
        streetViewControl: true,
      });

      setIsLoading(false);

      if (onMapReady) {
        onMapReady(map.current);
      }
    } catch (err: any) {
      console.error("Erro ao inicializar mapa:", err);
      setIsLoading(false);
      setErrorMessage(err?.message || "Erro desconhecido ao inicializar o mapa.");
    }
  });

  useEffect(() => {
    setInputKey(getGoogleMapsApiKey());
    init();
  }, [init]);

  const handleSaveKeyAndReload = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setGoogleMapsApiKey(inputKey);
    setShowKeyModal(false);
    init(inputKey);
  };

  const handleClearKeyAndReload = () => {
    setInputKey("");
    setGoogleMapsApiKey("");
    setShowKeyModal(false);
    init("");
  };

  return (
    <div className={cn("relative w-full h-[500px] overflow-hidden bg-muted/20", className)}>
      {/* Container onde o Google Maps monta */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm p-4 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
          <p className="text-sm font-medium text-foreground">Carregando mapa...</p>
          <p className="text-xs text-muted-foreground mt-1">Conectando ao serviço cartográfico</p>
        </div>
      )}

      {/* Error or Auth Failure State */}
      {(errorMessage || authFailed) && !isLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/95 backdrop-blur-md p-6">
          <div className="max-w-md w-full bg-card border border-border/80 shadow-2xl rounded-xl p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">
                {authFailed ? "Chave da API Não Autorizada" : "Configuração do Google Maps"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {errorMessage || "É necessário fornecer uma chave de API válida para exibir o mapa."}
              </p>
            </div>

            <form onSubmit={handleSaveKeyAndReload} className="space-y-3 pt-2 text-left">
              <label className="text-xs font-medium text-foreground block">
                Chave da API do Google Maps (Google Cloud):
              </label>
              <Input
                type="text"
                placeholder="Ex: AIzaSy..."
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                className="font-mono text-xs"
              />
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" className="flex-1 gap-2">
                  <Check className="w-3.5 h-3.5" />
                  Salvar e Carregar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearKeyAndReload}
                  className="gap-2"
                  title="Tentar carregar sem chave"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Tentar sem chave
                </Button>
              </div>
            </form>

            <p className="text-[11px] text-muted-foreground/80 leading-relaxed border-t border-border/50 pt-3">
              Dica: Você também pode definir a variável <code className="bg-muted px-1 py-0.5 rounded font-mono">VITE_GOOGLE_MAPS_API_KEY</code> em um arquivo <code className="bg-muted px-1 py-0.5 rounded font-mono">.env</code> na raiz do projeto.
            </p>
          </div>
        </div>
      )}

      {/* Botão flutuante para alterar chave da API a qualquer momento */}
      {!isLoading && !errorMessage && !authFailed && (
        <div className="absolute top-3 right-14 z-10">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowKeyModal(true)}
            className="h-8 px-2.5 bg-card/85 backdrop-blur-sm border-border text-xs gap-1.5 shadow-sm hover:bg-card"
            title="Configurar Chave da API do Google Maps"
          >
            <Key className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">Chave Maps</span>
          </Button>
        </div>
      )}

      {/* Modal / Dialog flutuante para configurar chave quando mapa está ativo */}
      {showKeyModal && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="max-w-md w-full bg-card border border-border shadow-2xl rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Key className="w-4 h-4 text-primary" />
                Chave da API do Google Maps
              </h4>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>
            <Input
              type="text"
              placeholder="Ex: AIzaSy..."
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              className="font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowKeyModal(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSaveKeyAndReload}>
                Salvar e Recarregar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
