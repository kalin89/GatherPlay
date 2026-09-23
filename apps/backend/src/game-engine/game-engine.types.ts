import type { RoomState, RoundState } from '../room/room.types.js';

export interface TeamScore {
  teamId: string;
  score: number;
}

export type GameEngineEvent =
  | { type: 'room_state'; code: string; room: RoomState }
  | { type: 'round_started'; code: string; round: RoundState }
  | { type: 'round_update'; code: string; remainingSeconds: number }
  | { type: 'round_result'; code: string; scores: TeamScore[] };
