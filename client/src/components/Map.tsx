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
  onMapReady?: (map: L.Map) => void;
}

export function MapView({
  className,
  initialCenter = { lat: -14.235, lng: -51.9253 },
  initialZoom = 4,
  onMapReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    // Inicializa o mapa Leaflet
    const map = L.map(containerRef.current, {
      center: [initialCenter.lat, initialCenter.lng],
      zoom: initialZoom,
      zoomControl: true,
      attributionControl: true,
    });

    // Camada 1: OpenStreetMap Standard (Gratuito e sem chave)
    const osmLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });

    // Camada 2: Imagens de Satélite (Esri World Imagery)
    const satelliteLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri &mdash; Source: Esri, USGS",
      }
    );

    // Camada 3: Cartografia Escura (CartoDB Dark Matter)
    const cartoDarkLayer = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 19,
        subdomains: "abcd",
        attribution: "&copy; OpenStreetMap &copy; CARTO",
      }
    );

    // Adiciona OpenStreetMap como camada padrão ativa
    osmLayer.addTo(map);

    // Adiciona controle de camadas no topo direito para alternar facilmente
    L.control
      .layers(
        {
          "OpenStreetMap": osmLayer,
          "Satélite (Esri)": satelliteLayer,
          "Cartografia Escura": cartoDarkLayer,
        },
        {},
        { position: "topright" }
      )
      .addTo(map);

    mapRef.current = map;

    if (onMapReady) {
      onMapReady(map);
    }

    // Observer para garantir que o mapa redimensione perfeitamente ao ajustar painéis
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [initialCenter.lat, initialCenter.lng, initialZoom, onMapReady]);

  return (
    <div className={cn("relative w-full h-[500px] overflow-hidden bg-muted/20", className)}>
      <div ref={containerRef} className="w-full h-full z-0" />
    </div>
  );
}
