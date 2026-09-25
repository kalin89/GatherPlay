import type { RoomState } from '../room/room.types.js';
import type { TeamScore } from '../game-engine/game-engine.types.js';

export interface TriviaTurnResult {
  playerId: string;
  playerName: string;
  teamId: string;
  opcionElegida: number | null;
  correcta: boolean;
  puntos: number;
}

export type TriviaEvent =
  | { type: 'room_state'; code: string; room: RoomState }
  | {
      type: 'trivia_turn_waiting';
      code: string;
      playerId: string;
      playerName: string;
      teamId: string;
    }
  | {
      type: 'trivia_turn_started';
      code: string;
      targetSocketIds: string[];
      playerId: string;
      playerName: string;
      pregunta: string;
      opciones: string[];
      durationSeconds: number;
    }
  | {
      type: 'trivia_turn_update';
      code: string;
      targetSocketIds: string[];
      remainingSeconds: number;
    }
  | {
      type: 'trivia_turn_result';
      code: string;
      pregunta: string;
      opciones: string[];
      indiceCorrecto: number;
      resultado: TriviaTurnResult;
    }
  | { type: 'trivia_match_result'; code: string; scores: TeamScore[] };
