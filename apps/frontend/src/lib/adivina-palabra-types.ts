// Espejo de los payloads que emite
// apps/backend/src/adivina-palabra/adivina-palabra.gateway.ts (sin
// `targetSocketIds`, que es un detalle interno del backend — nunca viaja por
// la red).
import type { TeamScore } from "./trivia-types";

export interface AdivinaTurnResult {
  playerId: string;
  playerName: string;
  teamId: string;
  adivinadas: string[];
  pasadas: string[];
  puntos: number;
}

export interface AdivinaTurnWaitingPayload {
  code: string;
  playerId: string;
  playerName: string;
  teamId: string;
  marcador: TeamScore[];
}

export interface AdivinaPantallaEstadoPayload {
  code: string;
  palabra: string | null;
  remainingSeconds: number;
  pasesRestantes: number;
  ultimaAccion: "adivinada" | "paso" | null;
}

export interface AdivinaJugadorEstadoPayload {
  code: string;
  remainingSeconds: number;
  pasesRestantes: number;
}

export interface AdivinaTurnResultPayload {
  code: string;
  resultado: AdivinaTurnResult;
}

export interface AdivinaMatchResultPayload {
  code: string;
  scores: TeamScore[];
  palabrasPorEquipo: { teamId: string; palabras: string[] }[];
}
