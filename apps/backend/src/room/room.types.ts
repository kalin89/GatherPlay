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
}

export interface RoomState {
  code: string;
  status: 'lobby';
  players: Player[];
  teams: Team[];
}
