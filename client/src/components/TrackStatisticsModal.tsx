import { useEffect, useMemo, useState } from "react";
import {
  computeTrackMetrics,
  fetchNearbyCommercialPoint,
  formatPtBrNumber,
  formatTimePtBr,
  formatTrackSummary,
  TrackPause,
} from "@/lib/trackAnalysis";
import { Button } from "@/components/ui/button";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Check,
  Clock,
  Compass,
  Copy,
  Gauge,
  Loader2,
  MapPin,
  Maximize2,
  Navigation,
  PauseCircle,
  Route,
  Store,
  Target,
  X,
} from "lucide-react";

interface TrackStatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  logData: string;
  onFitMap?: () => void;
}

interface CommercialPoiState {
  name: string;
  loading: boolean;
  type?: string;
  distanceMeters?: number;
  fullAddress?: string;
}

export function TrackStatisticsModal({
  isOpen,
  onClose,
  logData,
  onFitMap,
}: TrackStatisticsModalProps) {
  const [copied, setCopied] = useState(false);
  const [poiMap, setPoiMap] = useState<Record<string, CommercialPoiState>>({});

  const metrics = useMemo(() => {
    if (!isOpen) return null;
    return computeTrackMetrics(logData);
  }, [isOpen, logData]);

  // Busca pontos comerciais para pausas superiores a 3 minutos
  useEffect(() => {
    if (!isOpen || !metrics || metrics.pausesOver3Min.length === 0) return;

    metrics.pausesOver3Min.forEach((pause) => {
      if (poiMap[pause.id]) return;

      setPoiMap((prev) => ({
        ...prev,
        [pause.id]: { name: "Buscando estabelecimento próximo...", loading: true },
      }));

      fetchNearbyCommercialPoint(pause.lat, pause.lng)
        .then((res) => {
          setPoiMap((prev) => ({
            ...prev,
            [pause.id]: {
              name: res.name,
              loading: false,
              type: res.type,
              distanceMeters: res.distanceMeters,
              fullAddress: res.fullAddress,
            },
          }));
        })
        .catch(() => {
          setPoiMap((prev) => ({
            ...prev,
            [pause.id]: {
              name: "Nenhum ponto comercial cadastrado a 3 m",
              loading: false,
            },
          }));
        });
    });
  }, [isOpen, metrics]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (!metrics) return;
    try {
      const summary = formatTrackSummary(metrics);
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const stoppedSeconds = metrics ? Math.max(0, metrics.durationSeconds - metrics.movingSeconds) : 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 sm:p-4 pt-[max(env(safe-area-inset-top,0px),0.75rem)] pb-[max(env(safe-area-inset-bottom,0px),0.75rem)] backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex max-h-[calc(100dvh-max(env(safe-area-inset-top,0px),0.75rem)-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-cyan-400/30 bg-card text-card-foreground shadow-2xl">
        {/* Cabeçalho seguro contra notch e status bar */}
        <div className="flex items-center justify-between border-b border-border/80 px-5 py-3.5 bg-muted/20">
          <div className="flex items-center gap-2.5 text-cyan-400">
            <div className="p-1.5 rounded-lg bg-cyan-400/10 border border-cyan-400/20">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-foreground leading-none">
                Estatísticas do Deslocamento
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Métricas calculadas a partir dos pontos registrados (SI / ABNT)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Fechar estatísticas"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {!metrics || metrics.pointsCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Route className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-sm text-foreground">Nenhum percurso disponível para análise</p>
              <p className="text-xs text-muted-foreground max-w-xs mt-1">
                Inicie a captura contínua ou carregue coordenadas na área de dados para visualizar as estatísticas.
              </p>
            </div>
          ) : (
            <>
              {/* Cards principais (Destaque) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Distância */}
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-muted-foreground mb-1.5">
                    <span className="text-xs font-medium uppercase tracking-wider">Distância Total</span>
                    <Route className="h-4 w-4 text-cyan-400" />
                  </div>
                  <div>
                    <div className="font-mono text-xl sm:text-2xl font-bold text-foreground">
                      {metrics.totalDistanceKm >= 1
                        ? `${formatPtBrNumber(metrics.totalDistanceKm, 2, 2)} km`
                        : `${formatPtBrNumber(metrics.totalDistanceMeters, 0, 0)} m`}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
                      {formatPtBrNumber(metrics.totalDistanceMeters, 1, 1)} metros
                    </div>
                  </div>
                </div>

                {/* Tempo decorrido */}
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-muted-foreground mb-1.5">
                    <span className="text-xs font-medium uppercase tracking-wider">Duração Total</span>
                    <Clock className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="font-mono text-xl sm:text-2xl font-bold text-foreground">
                      {formatTimePtBr(metrics.durationSeconds)}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
                      {formatPtBrNumber(metrics.durationSeconds, 0, 0)}s decorridos
                    </div>
                  </div>
                </div>

                {/* Velocidade Média */}
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 flex flex-col justify-between col-span-2 sm:col-span-1">
                  <div className="flex items-center justify-between text-muted-foreground mb-1.5">
                    <span className="text-xs font-medium uppercase tracking-wider">Vel. Média Mov.</span>
                    <Gauge className="h-4 w-4 text-amber-400" />
                  </div>
                  <div>
                    <div className="font-mono text-xl sm:text-2xl font-bold text-foreground">
                      {formatPtBrNumber(metrics.averageSpeedKmh, 1, 1)}{" "}
                      <span className="text-sm font-normal text-muted-foreground">km/h</span>
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
                      Em segmentos ativos
                    </div>
                  </div>
                </div>
              </div>

              {/* Grid secundário de dados detalhados */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Tempo em movimento vs parado */}
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 p-3 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Activity className="h-4 w-4 text-emerald-400" />
                    <span>Tempo em Movimento:</span>
                  </div>
                  <span className="font-mono font-medium text-foreground">
                    {formatTimePtBr(metrics.movingSeconds)}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 p-3 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <PauseCircle className="h-4 w-4 text-amber-400" />
                    <span>Tempo em Pausa/Parado:</span>
                  </div>
                  <span className="font-mono font-medium text-foreground">
                    {formatTimePtBr(stoppedSeconds)}
                  </span>
                </div>

                {/* Velocidade máxima */}
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 p-3 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ArrowUpRight className="h-4 w-4 text-red-400" />
                    <span>Velocidade Máxima:</span>
                  </div>
                  <span className="font-mono font-medium text-foreground">
                    {metrics.maxReportedSpeedKmh !== undefined
                      ? `${formatPtBrNumber(metrics.maxReportedSpeedKmh, 1, 1)} km/h`
                      : "Não informada"}
                  </span>
                </div>

                {/* Precisão Média GPS */}
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 p-3 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Target className="h-4 w-4 text-blue-400" />
                    <span>Precisão Média do GPS:</span>
                  </div>
                  <span className="font-mono font-medium text-foreground">
                    {metrics.averageAccuracyMeters !== undefined
                      ? `±${formatPtBrNumber(metrics.averageAccuracyMeters, 1, 1)} m`
                      : "Alta / Standard"}
                  </span>
                </div>

                {/* Total de pontos e paradas */}
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 p-3 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Navigation className="h-4 w-4 text-cyan-400" />
                    <span>Pontos Registrados:</span>
                  </div>
                  <span className="font-mono font-medium text-foreground">
                    {formatPtBrNumber(metrics.pointsCount, 0, 0)} ponto(s)
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 p-3 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Compass className="h-4 w-4 text-purple-400" />
                    <span>Paradas / Permanências:</span>
                  </div>
                  <span className="font-mono font-medium text-foreground">
                    {formatPtBrNumber(metrics.stationaryStopsCount, 0, 0)} detectada(s)
                  </span>
                </div>

                {/* Horários */}
                {metrics.firstTimestamp && (
                  <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 p-3 text-xs">
                    <span className="text-muted-foreground">Horário de Início:</span>
                    <span className="font-mono font-medium text-foreground">
                      {metrics.firstTimestamp.toLocaleTimeString("pt-BR")}
                    </span>
                  </div>
                )}

                {metrics.lastTimestamp && (
                  <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 p-3 text-xs">
                    <span className="text-muted-foreground">Horário de Término:</span>
                    <span className="font-mono font-medium text-foreground">
                      {metrics.lastTimestamp.toLocaleTimeString("pt-BR")}
                    </span>
                  </div>
                )}
              </div>

              {/* Seção de Pausas no Movimento Superiores a 3 Minutos */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-400">
                    <PauseCircle className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      Pausas no Movimento Superiores a 3 Minutos
                    </span>
                  </div>
                  <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
                    {metrics.pausesOver3Min.length} identificada(s)
                  </span>
                </div>

                {metrics.pausesOver3Min.length === 0 ? (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Nenhuma parada superior a 3 minutos foi identificada neste percurso.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {metrics.pausesOver3Min.map((pause, pIdx) => {
                      const poi = poiMap[pause.id];
                      return (
                        <div
                          key={pause.id}
                          className="rounded-lg border border-border/60 bg-background/80 p-3 text-xs space-y-1.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="font-semibold text-foreground">
                              Parada #{pIdx + 1} · Duração: {formatTimePtBr(pause.durationSeconds)}
                            </span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {pause.startTimestamp.toLocaleTimeString("pt-BR")} às{" "}
                              {pause.endTimestamp.toLocaleTimeString("pt-BR")}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                            <MapPin className="h-3 w-3 text-cyan-400 shrink-0" />
                            <span>
                              {formatPtBrNumber(pause.lat, 6, 6)}, {formatPtBrNumber(pause.lng, 6, 6)}
                            </span>
                          </div>

                          {/* Ponto comercial próximo em raio de 3m */}
                          <div className="flex items-start gap-2 pt-1 border-t border-border/40 text-xs">
                            <Store className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <span className="text-muted-foreground font-medium">Ponto comercial próximo (raio 3m): </span>
                              {poi?.loading ? (
                                <span className="inline-flex items-center gap-1 text-cyan-400 font-mono text-[11px]">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Consultando OpenStreetMap...
                                </span>
                              ) : (
                                <span className="font-medium text-foreground">
                                  {poi?.name || "Consultando ponto comercial..."}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Alerta de lacuna se houver */}
              {metrics.largestGapSeconds > 15 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                  ⚠️ <strong>Maior intervalo sem dados (lacuna):</strong> {formatTimePtBr(metrics.largestGapSeconds)}.
                  Pode decorrer de suspensão de energia, túnel ou perda temporária de sinal.
                </div>
              )}
            </>
          )}
        </div>

        {/* Rodapé com botões de ação */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 bg-muted/20 px-5 py-3.5">
          <div className="flex items-center gap-2">
            {metrics && metrics.pointsCount > 0 && (
              <>
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-9 border-border hover:bg-muted"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copiar Resumo
                    </>
                  )}
                </Button>

                {onFitMap && (
                  <Button
                    onClick={() => {
                      onFitMap();
                      onClose();
                    }}
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs h-9 border-border hover:bg-muted"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    Enquadrar no Mapa
                  </Button>
                )}
              </>
            )}
          </div>

          <Button
            onClick={onClose}
            size="sm"
            className="text-xs h-9 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
