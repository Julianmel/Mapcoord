import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";

// Corrige o caminho padrão dos ícones do Leaflet empacotado pelo Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface MapViewProps {
  className?: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  onMapReady?: (map: L.Map) => void | (() => void);
}

export function MapView({
  className,
  initialCenter = { lat: -14.235, lng: -51.9253 },
  initialZoom = 4,
  onMapReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  const onMapReadyRef = useRef(onMapReady);
  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    // Inicializa o mapa Leaflet uma única vez
    const map = L.map(containerRef.current, {
      center: [initialCenter.lat, initialCenter.lng],
      zoom: initialZoom,
      zoomControl: true,
      attributionControl: true,
    });

    // Camadas Google Maps (Tiles gratuitos e diretos, sem necessidade de chave de API)
    const googleRoadmap = L.tileLayer("https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      maxZoom: 21,
      subdomains: ["0", "1", "2", "3"],
      attribution: "&copy; Google Maps",
    });

    const googleSatellite = L.tileLayer("https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
      maxZoom: 21,
      subdomains: ["0", "1", "2", "3"],
      attribution: "&copy; Google Maps",
    });

    const googleHybrid = L.tileLayer("https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
      maxZoom: 21,
      subdomains: ["0", "1", "2", "3"],
      attribution: "&copy; Google Maps",
    });

    const googleTerrain = L.tileLayer("https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}", {
      maxZoom: 21,
      subdomains: ["0", "1", "2", "3"],
      attribution: "&copy; Google Maps",
    });

    // Camada alternativa: OpenStreetMap Standard
    const osmLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });

    // Adiciona Google Maps Roadmap como camada padrão ativa
    googleRoadmap.addTo(map);

    // Adiciona controle de camadas no topo direito para alternar facilmente
    L.control
      .layers(
        {
          "Google Maps (Padrão)": googleRoadmap,
          "Google Maps (Satélite)": googleSatellite,
          "Google Maps (Híbrido)": googleHybrid,
          "Google Maps (Relevo)": googleTerrain,
          "OpenStreetMap": osmLayer,
        },
        {},
        { position: "topright" }
      )
      .addTo(map);

    mapRef.current = map;

    let cleanupOnMapReady: void | (() => void);
    if (onMapReadyRef.current) {
      cleanupOnMapReady = onMapReadyRef.current(map);
    }

    // Observer para garantir que o mapa redimensione perfeitamente ao ajustar painéis
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (typeof cleanupOnMapReady === "function") {
        cleanupOnMapReady();
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className={cn("relative w-full h-[500px] overflow-hidden bg-muted/20", className)}>
      <div ref={containerRef} className="w-full h-full z-0" />
    </div>
  );
}
