// Espejo de los payloads que emite
// apps/backend/src/memoriza-objetos/memoriza-objetos.gateway.ts (sin
// `targetSocketIds`, que es un detalle interno del backend — nunca viaja por
// la red).
import type { TeamScore } from "./trivia-types";

export interface MemorizaObjetosItem {
  id: string;
  imagenUrl: string;
}

export interface MemorizaBoardItemPublic {
  id: string;
  imagenUrl: string;
  pista: string;
  estado: "oculta" | "revelada";
  equipoQueAcerto: string | null;
  palabra: string | null;
}

export interface MemorizaTeamClock {
  teamId: string;
  remainingSeconds: number;
}

export interface MemorizaJugadorActivo {
  teamId: string;
  playerId: string;
  playerName: string;
}

export interface MemorizaWaitingReadyPayload {
  code: string;
  readyPlayerIds: string[];
  eligiblePlayerIds: string[];
  items: MemorizaObjetosItem[];
}

export interface MemorizaPonAtencionPayload {
  code: string;
  remainingSeconds: number;
}

export interface MemorizaMemorizandoPayload {
  code: string;
  items: MemorizaObjetosItem[];
  remainingSeconds: number;
}

export interface MemorizaTableroPayload {
  code: string;
  items: MemorizaBoardItemPublic[];
  clocks: MemorizaTeamClock[];
  equipoActivoId: string | null;
  jugadorActivo: MemorizaJugadorActivo | null;
  // Sube una sola vez por turno, incluso cuando `jugadorActivo` no cambia
  // (equipo jugando solo porque el otro se quedó sin tiempo) — se usa en el
  // celular para resetear el formulario de respuesta entre un turno y el
  // siguiente aunque sea el mismo jugador.
  turnNumber: number;
}

export interface MemorizaTurnoJugadorPayload {
  code: string;
  remainingSeconds: number;
  puedePasar: boolean;
}

export interface MemorizaIntentoResultadoPayload {
  code: string;
  teamId: string;
  acierto: boolean;
  palabra: string | null;
}

export interface MemorizaMatchResultPayload {
  code: string;
  scores: TeamScore[];
  palabrasPorEquipo: { teamId: string; palabras: string[] }[];
  items: MemorizaBoardItemPublic[];
}
