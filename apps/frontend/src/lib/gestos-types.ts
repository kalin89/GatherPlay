// Espejo de los payloads que emite apps/backend/src/caras-y-gestos/caras-y-gestos.gateway.ts
// (sin `targetSocketIds`, que es un detalle interno del backend — nunca viaja
// por la red).
import type { TeamScore } from "./trivia-types";

export interface GestoTurnResult {
  playerId: string;
  playerName: string;
  teamId: string;
  palabrasAdivinadas: string[];
  puntos: number;
  motivo: "completado" | "tiempo";
}

export interface GestosTurnWaitingPayload {
  code: string;
  playerId: string;
  playerName: string;
  teamId: string;
}

export interface GestosTurnStartedPayload {
  code: string;
  playerId: string;
  playerName: string;
  palabra: string;
  durationSeconds: number;
  palabrasRestantes: number;
}

export interface GestosActorReadyPayload {
  code: string;
}

export interface GestosWordUpdatePayload {
  code: string;
  palabra: string;
  palabrasRestantes: number;
  motivo: "adivinada" | "paso";
}

export interface GestosTurnTickPayload {
  code: string;
  remainingSeconds: number;
}

export interface GestosTurnResultPayload {
  code: string;
  resultado: GestoTurnResult;
}

export interface GestosMatchResultPayload {
  code: string;
  scores: TeamScore[];
  palabrasPorEquipo: Record<string, string[]>;
}
