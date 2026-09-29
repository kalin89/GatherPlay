// Espejo de apps/backend/src/room/room.types.ts.
// No existe un paquete `packages/shared` en este monorepo (solo `apps/*`),
// así que estos tipos se mantienen a mano en sincronía con el backend.
// Si cambia la forma de RoomState ahí, hay que actualizar este archivo.

export interface Player {
  id: string;
  name: string;
  socketId: string;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  playerIds: string[];
  score: number;
}

export type RoomStatus = "lobby" | "jugando" | "resultados";

/** Motivo por el que el backend cerró la sala (evento `room_closed`). */
export type RoomClosedReason = "host_left" | "max_age";

export interface RoundState {
  durationSeconds: number;
  remainingSeconds: number;
}

export const GAME_IDS = [
  "trivia",
  "caras-y-gestos",
  "adivina-palabra",
  "la-rocola",
  "memoriza-objetos",
] as const;
export type GameId = (typeof GAME_IDS)[number];

export interface RoomState {
  code: string;
  status: RoomStatus;
  players: Player[];
  teams: Team[];
  round: RoundState | null;
  currentGame: GameId | null;
}
