import type { TeamScore } from '../game-engine/game-engine.types.js';
import type { RoomState } from '../room/room.types.js';

export type MemorizaEstado = 'oculta' | 'revelada';

// Estado interno de un objeto del tablero — nunca se manda tal cual al
// cliente (ver MemorizaBoardItemPublic): mientras está oculta, la palabra no
// debe viajar por el socket, solo el patrón de pista ya calculado.
export interface MemorizaBoardItem {
  id: string;
  palabra: string;
  imagenUrl: string;
  letraIndex: number;
  estado: MemorizaEstado;
  equipoQueAcerto: string | null;
}

export interface MemorizaBoardItemPublic {
  id: string;
  imagenUrl: string;
  pista: string;
  estado: MemorizaEstado;
  equipoQueAcerto: string | null;
  palabra: string | null;
}

export interface MemorizaTeamClock {
  teamId: string;
  remainingSeconds: number;
}

export const ATTENTION_SECONDS = 5;
export const MEMORIZE_SECONDS = 30;
export const TEAM_CLOCK_SECONDS = 90;
export const PASS_UNLOCK_SECONDS = 10;
export const RESULTS_DISPLAY_MS = 10_000;

export type MemorizaObjetosEvent =
  | { type: 'room_state'; code: string; room: RoomState }
  | {
      type: 'memoriza_waiting_ready';
      code: string;
      readyPlayerIds: string[];
      eligiblePlayerIds: string[];
      items: { id: string; imagenUrl: string }[];
    }
  | { type: 'memoriza_pon_atencion'; code: string; remainingSeconds: number }
  | {
      type: 'memoriza_memorizando';
      code: string;
      items: { id: string; imagenUrl: string }[];
      remainingSeconds: number;
    }
  | {
      type: 'memoriza_tablero';
      code: string;
      items: MemorizaBoardItemPublic[];
      clocks: MemorizaTeamClock[];
      equipoActivoId: string | null;
      jugadorActivo: { teamId: string; playerId: string; playerName: string } | null;
      // Incrementa una sola vez por turno, incluso cuando `jugadorActivo` no
      // cambia (equipo jugando solo porque el otro se quedó sin tiempo) —
      // ver el comentario en `MemorizaMatchState.turnNumber`.
      turnNumber: number;
    }
  | {
      type: 'memoriza_turno_jugador';
      code: string;
      targetSocketIds: string[];
      remainingSeconds: number;
      puedePasar: boolean;
    }
  | {
      type: 'memoriza_intento_resultado';
      code: string;
      teamId: string;
      acierto: boolean;
      palabra: string | null;
    }
  | {
      type: 'memoriza_match_result';
      code: string;
      scores: TeamScore[];
      palabrasPorEquipo: { teamId: string; palabras: string[] }[];
      // Tablero final con TODOS los objetos revelados (adivinados o no) —
      // los no adivinados quedan con `equipoQueAcerto: null`, para que la
      // pantalla los muestre en neutro en vez del color de un equipo.
      items: MemorizaBoardItemPublic[];
    };
