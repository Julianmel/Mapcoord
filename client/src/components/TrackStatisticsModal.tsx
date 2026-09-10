import { useState } from "react";
import { computeTrackMetrics, formatTrackSummary } from "@/lib/trackAnalysis";
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
  Maximize2,
  Navigation,
  PauseCircle,
  Route,
  Target,
  X,
} from "lucide-react";

interface TrackStatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  logData: string;
  onFitMap?: () => void;
}

export function TrackStatisticsModal({
  isOpen,
  onClose,
  logData,
  onFitMap,
}: TrackStatisticsModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const metrics = computeTrackMetrics(logData);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hours}h ${remMins}min ${secs}s`;
    }
    return mins > 0 ? `${mins}min ${secs}s` : `${secs}s`;
  };

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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-cyan-400/30 bg-card text-card-foreground shadow-2xl">
        {/* Cabeçalho */}
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
                Métricas calculadas a partir dos pontos registrados
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

        {/* Conteúdo */}
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
                        ? `${metrics.totalDistanceKm.toFixed(2)} km`
                        : `${metrics.totalDistanceMeters.toFixed(0)} m`}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
                      {metrics.totalDistanceMeters.toFixed(1)} metros
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
                      {formatTime(metrics.durationSeconds)}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
                      {metrics.durationSeconds.toFixed(0)}s decorridos
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
                      {metrics.averageSpeedKmh.toFixed(1)}{" "}
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
                    {formatTime(metrics.movingSeconds)}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 p-3 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <PauseCircle className="h-4 w-4 text-amber-400" />
                    <span>Tempo em Pausa/Parado:</span>
                  </div>
                  <span className="font-mono font-medium text-foreground">
                    {formatTime(stoppedSeconds)}
                  </span>
                </div>

                {/* Velocidade máxima */}
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 p-3 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ArrowUpRight className="h-4 w-4 text-red-400" />
                    <span>Velocidade Máxima Registrada:</span>
                  </div>
                  <span className="font-mono font-medium text-foreground">
                    {metrics.maxReportedSpeedKmh !== undefined
                      ? `${metrics.maxReportedSpeedKmh.toFixed(1)} km/h`
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
                      ? `±${metrics.averageAccuracyMeters.toFixed(1)} m`
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
                    {metrics.pointsCount} ponto(s)
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 p-3 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Compass className="h-4 w-4 text-purple-400" />
                    <span>Paradas / Permanências:</span>
                  </div>
                  <span className="font-mono font-medium text-foreground">
                    {metrics.stationaryStopsCount} detectada(s)
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

              {/* Alerta de lacuna se houver */}
              {metrics.largestGapSeconds > 15 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                  ⚠️ <strong>Maior intervalo sem dados (lacuna):</strong> {formatTime(metrics.largestGapSeconds)}.
                  Isso pode ter sido causado por economia de bateria ou túnel/área sem visada de satélite.
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
