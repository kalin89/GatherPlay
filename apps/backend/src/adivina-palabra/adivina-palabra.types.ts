import type { RoomState } from '../room/room.types.js';
import type { TeamScore } from '../game-engine/game-engine.types.js';

export interface AdivinaTurnResult {
  playerId: string;
  playerName: string;
  teamId: string;
  adivinadas: string[]; // verdes
  pasadas: string[]; // rojas, incluye la palabra a medio mostrar si se agota el tiempo
  puntos: number; // = adivinadas.length
}

// targetSocketIds en adivina_pantalla_estado = [screenRoomName(code)] únicamente;
// en adivina_jugador_estado = [socket del Adivinador en turno] únicamente — nunca
// lleva la palabra, es la garantía de privacidad de este juego (más estricta que
// Caras y Gestos: acá el jugador en turno tampoco ve su propia palabra).
// adivina_turn_waiting/adivina_turn_result/adivina_match_result van a toda la sala.
export type AdivinaPalabraEvent =
  | { type: 'room_state'; code: string; room: RoomState }
  | {
      type: 'adivina_turn_waiting';
      code: string;
      playerId: string;
      playerName: string;
      teamId: string;
      marcador: TeamScore[];
    }
  | {
      type: 'adivina_pantalla_estado';
      code: string;
      targetSocketIds: string[];
      palabra: string | null;
      remainingSeconds: number;
      pasesRestantes: number;
      ultimaAccion: 'adivinada' | 'paso' | null;
    }
  | {
      type: 'adivina_jugador_estado';
      code: string;
      targetSocketIds: string[];
      remainingSeconds: number;
      pasesRestantes: number;
    }
  | { type: 'adivina_turn_result'; code: string; resultado: AdivinaTurnResult }
  | {
      type: 'adivina_match_result';
      code: string;
      scores: TeamScore[];
      palabrasPorEquipo: { teamId: string; palabras: string[] }[];
    };
