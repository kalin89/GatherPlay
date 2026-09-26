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

export const GAME_IDS = ['trivia', 'caras-y-gestos', 'adivina-palabra'] as const;
export type GameId = (typeof GAME_IDS)[number];

export interface RoomState {
  code: string;
  status: RoomStatus;
  players: Player[];
  teams: Team[];
  round: RoundState | null;
  currentGame: GameId | null;
}
