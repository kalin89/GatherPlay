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

export type RoomStatus = 'lobby' | 'jugando' | 'resultados';

export interface RoundState {
  durationSeconds: number;
  remainingSeconds: number;
}

export interface RoomState {
  code: string;
  status: RoomStatus;
  players: Player[];
  teams: Team[];
  round: RoundState | null;
}
