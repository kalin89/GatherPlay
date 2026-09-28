// Espejo de los payloads que emite
// apps/backend/src/la-rocola/la-rocola.gateway.ts (sin `targetSocketIds`,
// que es un detalle interno del backend — nunca viaja por la red).
import type { TeamScore } from "./trivia-types";

// Espejo de apps/backend/src/rocola-content/rocola-content.types.ts.
export const ROCOLA_GENEROS = [
  "cumbia",
  "merengue",
  "salsa",
  "balada",
  "ranchera",
  "pop",
  "rock",
  "popular",
] as const;
export type RocolaGenero = (typeof ROCOLA_GENEROS)[number];

// Filtro opcional elegido por el host antes de arrancar — nunca ambos a la
// vez (spec.md → "Filtro opcional por género o artista").
export type RocolaFiltro =
  | { tipo: "genero"; genero: RocolaGenero }
  | { tipo: "artista"; artista: string };

export interface RocolaArtistsPayload {
  code: string;
  artistas: string[];
}

export interface RocolaRoundResult {
  songId: string;
  titulo: string;
  artista: string;
  portadaUrl: string;
  teamId: string | null;
  playerId: string | null;
  playerName: string | null;
  puntos: number;
  respuesta: string;
}

export interface RocolaReadyStatePayload {
  code: string;
  readyPlayerIds: string[];
  eligiblePlayerIds: string[];
}

export interface RocolaRoundStartedPayload {
  code: string;
  roundNumber: number;
  totalRounds: number;
  marcador: TeamScore[];
}

export interface RocolaCountdownTickPayload {
  code: string;
  remainingSeconds: number;
}

export interface RocolaAudioControlPayload {
  code: string;
  action: "play" | "pause" | "resume";
  previewUrl?: string;
}

export interface RocolaBuzzerOpenPayload {
  code: string;
  eligibleTeamIds: string[] | null;
}

export interface RocolaBuzzerLockedPayload {
  code: string;
  playerId: string;
  playerName: string;
  teamId: string;
}

export interface RocolaAnswerTickPayload {
  code: string;
  remainingSeconds: number;
}

export interface RocolaRoboStartedPayload {
  code: string;
  eligibleTeamIds: string[];
  eligibleTeamNames: string[];
  remainingSeconds: number;
}

export interface RocolaRoundResultPayload {
  code: string;
  resultado: RocolaRoundResult;
}

export interface RocolaMatchResultPayload {
  code: string;
  scores: TeamScore[];
  canciones: { titulo: string; artista: string; teamId: string | null }[];
}
