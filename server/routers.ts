import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";

function parseTrackData(data: string) {
  const pattern = /\[([0-9]{14})\]([^\r\n]*?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)([^\r\n]*)/g;
  const points: Array<{ timestamp: Date; lat: number; lng: number; speedKmh?: number; bearingDegrees?: number; altitudeMeters?: number; accuracyMeters?: number; segmentDistanceMeters?: number; timeSincePreviousSeconds?: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(data)) !== null) {
    const [, rawTimestamp, prefix, rawLat, rawLng, suffix] = match;
    const metadata = `${prefix} ${suffix}`;
    const read = (label: string) => {
      const found = metadata.match(new RegExp(`${label}=(-?\\d+(?:\\.\\d+)?)`));
      return found ? Number(found[1]) : undefined;
    };
    const timestamp = new Date(
      Number(rawTimestamp.slice(0, 4)), Number(rawTimestamp.slice(4, 6)) - 1,
      Number(rawTimestamp.slice(6, 8)), Number(rawTimestamp.slice(8, 10)),
      Number(rawTimestamp.slice(10, 12)), Number(rawTimestamp.slice(12, 14)),
    );
    points.push({
      timestamp,
      lat: Number(rawLat),
      lng: Number(rawLng),
      speedKmh: read("velocidade"),
      bearingDegrees: read("direção"),
      altitudeMeters: read("altitude"),
      accuracyMeters: read("precisão"),
      segmentDistanceMeters: read("distância_segmento"),
      timeSincePreviousSeconds: read("tempo_desde_anterior"),
    });
  }
  return points.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const radius = 6371000;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function summarizeTrack(data: string) {
  const points = parseTrackData(data);
  if (!points.length) return "Nenhum registro de coordenada válido foi encontrado.";
  let totalMeters = 0; let movingSeconds = 0; let largestGapSeconds = 0;
  for (let index = 1; index < points.length; index += 1) {
    const gap = Math.max(0, (points[index].timestamp.getTime() - points[index - 1].timestamp.getTime()) / 1000);
    largestGapSeconds = Math.max(largestGapSeconds, gap);
    if (gap > 0 && gap <= 60) { totalMeters += distanceMeters(points[index - 1], points[index]); movingSeconds += gap; }
  }
  const durationSeconds = Math.max(0, (points.at(-1)!.timestamp.getTime() - points[0].timestamp.getTime()) / 1000);
  const averageKmh = movingSeconds ? totalMeters / movingSeconds * 3.6 : 0;
  const segmentDistances = points.map(point => point.segmentDistanceMeters).filter((value): value is number => value !== undefined && Number.isFinite(value));
  const recordedSegmentTimes = points.map(point => point.timeSincePreviousSeconds).filter((value): value is number => value !== undefined && Number.isFinite(value));
  const averageSegmentDistance = segmentDistances.length ? segmentDistances.reduce((sum, value) => sum + value, 0) / segmentDistances.length : undefined;
  const averageSegmentTime = recordedSegmentTimes.length ? recordedSegmentTimes.reduce((sum, value) => sum + value, 0) / recordedSegmentTimes.length : undefined;
  const reportedSpeeds = points.map(point => point.speedKmh).filter((value): value is number => value !== undefined && Number.isFinite(value));
  const averageReportedSpeed = reportedSpeeds.length ? reportedSpeeds.reduce((sum, value) => sum + value, 0) / reportedSpeeds.length : undefined;
  const maxReportedSpeed = reportedSpeeds.length ? Math.max(...reportedSpeeds) : undefined;
  const accuracyValues = points.map(point => point.accuracyMeters).filter((value): value is number => value !== undefined && Number.isFinite(value));
  return [
    `Registros válidos: ${points.length}`,
    `Início: ${points[0].timestamp.toLocaleString("pt-BR")}`,
    `Fim: ${points.at(-1)!.timestamp.toLocaleString("pt-BR")}`,
    `Duração entre primeiro e último registro: ${Math.round(durationSeconds)} s`,
    `Distância acumulada em segmentos com intervalo de até 60 s: ${(totalMeters / 1000).toFixed(3)} km`,
    `Tempo coberto por segmentos utilizáveis: ${Math.round(movingSeconds)} s`,
    `Velocidade média nesses segmentos: ${averageKmh.toFixed(2)} km/h`,
    `Distância média por segmento registrada: ${averageSegmentDistance === undefined ? "não disponível" : `${averageSegmentDistance.toFixed(1)} m`}`,
    `Tempo médio desde o ponto anterior: ${averageSegmentTime === undefined ? "não disponível" : `${averageSegmentTime.toFixed(1)} s`}`,
    `Velocidade instantânea média registrada: ${averageReportedSpeed === undefined ? "não disponível" : `${averageReportedSpeed.toFixed(2)} km/h`}`,
    `Maior velocidade instantânea registrada: ${maxReportedSpeed === undefined ? "não disponível" : `${maxReportedSpeed.toFixed(2)} km/h`}`,
    `Precisão horizontal média registrada: ${accuracyValues.length ? `${(accuracyValues.reduce((sum, value) => sum + value, 0) / accuracyValues.length).toFixed(1)} m` : "não disponível"}`,
    `Maior lacuna entre registros: ${Math.round(largestGapSeconds)} s`,
  ].join("\n");
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  ai: router({
    ask: publicProcedure
      .input(z.object({ question: z.string().trim().min(1).max(500), data: z.string().max(200_000) }))
      .mutation(async ({ input }) => {
        const summary = summarizeTrack(input.data);
        if (summary === "Nenhum registro de coordenada válido foi encontrado.") {
          return { answer: "Não há registros de coordenadas válidos na área de dados. Faça uma captura ou carregue um log antes de perguntar sobre o deslocamento." };
        }

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: "Você é um analista de trajetos GPS. Responda em português brasileiro, de forma clara e objetiva. Use somente os dados e o resumo fornecidos. Não invente posições, horários ou velocidades. Se houver lacunas, timestamps duplicados ou dados insuficientes, destaque a limitação. Diferencie duração total entre primeiro e último registro de tempo efetivamente coberto por segmentos válidos. Para perguntas de velocidade, prefira o resumo calculado e explique o critério." },
              { role: "user", content: `Pergunta: ${input.question}\n\nResumo calculado:\n${summary}\n\nLog bruto atual:\n${input.data}` },
            ],
          });
          const content = response.choices[0]?.message?.content;
          return { answer: typeof content === "string" ? content : "A IA não retornou uma resposta utilizável para estes dados." };
        } catch (error) {
          console.error("[TrackAnalysis] LLM request failed:", error);
          return { answer: "Não foi possível consultar a IA agora. Os dados continuam preservados; tente novamente em instantes ou use as métricas objetivas do log." };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
