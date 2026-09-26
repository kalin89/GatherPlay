import type { RoomState } from '../room/room.types.js';
import type { TeamScore } from '../game-engine/game-engine.types.js';

export interface GestoTurnResult {
  playerId: string;
  playerName: string;
  teamId: string;
  palabrasAdivinadas: string[];
  puntos: number;
  motivo: 'completado' | 'tiempo';
}

// targetSocketIds en los eventos con palabra = [screenRoomName(code)] únicamente
// (nunca el socket del actor — ver "Privacidad" en analysis.md). gestos_actor_ready
// va solo al socket del actor. gestos_turn_waiting/gestos_turn_result/
// gestos_match_result van a toda la sala.
export type CarasYGestosEvent =
  | { type: 'room_state'; code: string; room: RoomState }
  | {
      type: 'gestos_turn_waiting';
      code: string;
      playerId: string;
      playerName: string;
      teamId: string;
    }
  | {
      type: 'gestos_turn_started';
      code: string;
      targetSocketIds: string[];
      playerId: string;
      playerName: string;
      palabra: string;
      durationSeconds: number;
      palabrasRestantes: number;
    }
  | { type: 'gestos_actor_ready'; code: string; targetSocketId: string }
  | {
      type: 'gestos_word_update';
      code: string;
      targetSocketIds: string[];
      palabra: string;
      palabrasRestantes: number;
      motivo: 'adivinada' | 'paso';
    }
  | { type: 'gestos_turn_tick'; code: string; targetSocketIds: string[]; remainingSeconds: number }
  | { type: 'gestos_turn_result'; code: string; resultado: GestoTurnResult }
  | {
      type: 'gestos_match_result';
      code: string;
      scores: TeamScore[];
      palabrasPorEquipo: Record<string, string[]>;
    };
