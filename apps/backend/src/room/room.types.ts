export interface Player {
  id: string;
  name: string;
  socketId: string;
}

export interface RoomState {
  code: string;
  status: 'lobby';
  players: Player[];
}
