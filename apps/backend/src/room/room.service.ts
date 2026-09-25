import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { GAME_IDS, type GameId, type Player, type RoomState, type Team } from './room.types.js';

// Sin 0/O ni 1/I — se leen y se dictan en voz alta entre celular y pantalla.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

export class RoomNotFoundError extends Error {
  constructor(code: string) {
    super(`No existe una sala con el código ${code}`);
    this.name = 'RoomNotFoundError';
  }
}

export class PlayerNotFoundError extends Error {
  constructor(playerId: string) {
    super(`No existe un jugador con el id ${playerId}`);
    this.name = 'PlayerNotFoundError';
  }
}

export class TeamNotFoundError extends Error {
  constructor(teamId: string) {
    super(`No existe un equipo con el id ${teamId}`);
    this.name = 'TeamNotFoundError';
  }
}

export class NoTeamsError extends Error {
  constructor(code: string) {
    super(`La sala ${code} no tiene equipos creados`);
    this.name = 'NoTeamsError';
  }
}

export class GameAlreadyStartedError extends Error {
  constructor(code: string) {
    super(`La sala ${code} ya tiene un juego elegido`);
    this.name = 'GameAlreadyStartedError';
  }
}

export class UnknownGameError extends Error {
  constructor(gameId: string) {
    super(`No existe un juego con el id ${gameId}`);
    this.name = 'UnknownGameError';
  }
}

@Injectable()
export class RoomService {
  private readonly rooms = new Map<string, RoomState>();

  createRoom(): RoomState {
    const code = this.generateUniqueCode();
    const room: RoomState = {
      code,
      status: 'lobby',
      players: [],
      teams: [],
      round: null,
      currentGame: null,
    };
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

  createTeam(code: string, name: string, color: string): RoomState {
    const room = this.getRoomOrThrow(code);
    const team: Team = {
      id: randomUUID(),
      name,
      color,
      playerIds: [],
      score: 0,
    };
    room.teams.push(team);
    return room;
  }

  assignPlayerToTeam(
    code: string,
    playerId: string,
    teamId: string,
  ): RoomState {
    const room = this.getRoomOrThrow(code);
    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      throw new PlayerNotFoundError(playerId);
    }
    const team = room.teams.find((t) => t.id === teamId);
    if (!team) {
      throw new TeamNotFoundError(teamId);
    }
    for (const other of room.teams) {
      const index = other.playerIds.indexOf(playerId);
      if (index !== -1) {
        other.playerIds.splice(index, 1);
      }
    }
    team.playerIds.push(playerId);
    return room;
  }

  removeTeam(code: string, teamId: string): RoomState {
    const room = this.getRoomOrThrow(code);
    const index = room.teams.findIndex((t) => t.id === teamId);
    if (index === -1) {
      throw new TeamNotFoundError(teamId);
    }
    room.teams.splice(index, 1);
    return room;
  }

  randomizeTeams(code: string): RoomState {
    const room = this.getRoomOrThrow(code);
    if (room.teams.length === 0) {
      throw new NoTeamsError(code);
    }
    for (const team of room.teams) {
      team.playerIds = [];
    }
    const shuffled = [...room.players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.forEach((player, index) => {
      const team = room.teams[index % room.teams.length];
      team.playerIds.push(player.id);
    });
    return room;
  }

  selectGame(code: string, gameId: string): RoomState {
    const room = this.getRoomOrThrow(code);
    if (room.currentGame !== null) {
      throw new GameAlreadyStartedError(code);
    }
    if (!GAME_IDS.includes(gameId as GameId)) {
      throw new UnknownGameError(gameId);
    }
    room.currentGame = gameId as GameId;
    return room;
  }

  getRoomOrThrow(code: string): RoomState {
    const room = this.rooms.get(code);
    if (!room) {
      throw new RoomNotFoundError(code);
    }
    return room;
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
