import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Player, RoomState } from './room.types.js';

// Sin 0/O ni 1/I — se leen y se dictan en voz alta entre celular y pantalla.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

export class RoomNotFoundError extends Error {
  constructor(code: string) {
    super(`No existe una sala con el código ${code}`);
    this.name = 'RoomNotFoundError';
  }
}

@Injectable()
export class RoomService {
  private readonly rooms = new Map<string, RoomState>();

  createRoom(): RoomState {
    const code = this.generateUniqueCode();
    const room: RoomState = { code, status: 'lobby', players: [] };
    this.rooms.set(code, room);
    return room;
  }

  joinRoom(code: string, name: string, socketId: string): RoomState {
    const room = this.rooms.get(code);
    if (!room) {
      throw new RoomNotFoundError(code);
    }
    const player: Player = { id: randomUUID(), name, socketId };
    room.players.push(player);
    return room;
  }

  removePlayerBySocketId(socketId: string): RoomState | undefined {
    for (const room of this.rooms.values()) {
      const index = room.players.findIndex((p) => p.socketId === socketId);
      if (index !== -1) {
        room.players.splice(index, 1);
        return room;
      }
    }
    return undefined;
  }

  getRoom(code: string): RoomState | undefined {
    return this.rooms.get(code);
  }

  private generateUniqueCode(): string {
    let code: string;
    do {
      code = this.generateCode();
    } while (this.rooms.has(code));
    return code;
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return code;
  }
}
