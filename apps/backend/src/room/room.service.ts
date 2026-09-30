import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_ROOM_LIFECYCLE_CONFIG,
  ROOM_LIFECYCLE_CONFIG,
  type RoomLifecycleConfig,
} from './room-lifecycle.config.js';
import type { RoomScopedState } from './room-scoped-state.js';
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

export class RejoinFailedError extends Error {
  constructor() {
    super('No se pudo recuperar tu lugar en la sala, entra de nuevo con tu nombre');
    this.name = 'RejoinFailedError';
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

export class TooManyRoomsError extends Error {
  constructor(maxRooms: number) {
    super(`Se alcanzó el máximo de ${maxRooms} salas simultáneas, intenta más tarde`);
    this.name = 'TooManyRoomsError';
  }
}

export type RoomCloseReason = 'host_left' | 'max_age';

// Datos de ciclo de vida de una sala. Viven aparte de `RoomState` a propósito:
// `RoomState` se serializa y se difunde a los clientes, esto es interno.
interface RoomMeta {
  createdAt: number;
  // Sockets de pantalla (los que hacen `watch_room`), no de jugadores.
  hostSocketIds: Set<string>;
  // Desde cuándo no hay ninguna pantalla conectada; null si hay al menos una.
  hostlessSince: number | null;
  // Hubo un host y se perdió — distingue una reconexión de la primera conexión.
  hostLost: boolean;
  // Token efímero → playerId. Nunca se serializa ni se difunde: quien lo tiene
  // puede reclamar el lugar de ese jugador (ver `rejoinRoom`).
  playerTokens: Map<string, string>;
  // playerId → cuándo se desconectó, para vencer la gracia.
  disconnectedAt: Map<string, number>;
}

@Injectable()
export class RoomService {
  private readonly rooms = new Map<string, RoomState>();
  private readonly roomMeta = new Map<string, RoomMeta>();
  private readonly hostSocketToRoom = new Map<string, string>();
  private readonly roomScoped: RoomScopedState[] = [];

  constructor(
    @Optional()
    @Inject(ROOM_LIFECYCLE_CONFIG)
    private readonly config: RoomLifecycleConfig = DEFAULT_ROOM_LIFECYCLE_CONFIG,
  ) {}

  get lifecycleConfig(): RoomLifecycleConfig {
    return this.config;
  }

  // Cada servicio con estado por sala se registra a sí mismo en su constructor,
  // así `closeRoom` puede limpiarlos sin que RoomModule los importe (evita una
  // dependencia circular).
  registerRoomScoped(service: RoomScopedState): void {
    this.roomScoped.push(service);
  }

  getStats(): { rooms: number } {
    return { rooms: this.rooms.size };
  }

  createRoom(now: number = Date.now()): RoomState {
    if (this.rooms.size >= this.config.maxRooms) {
      throw new TooManyRoomsError(this.config.maxRooms);
    }
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
    this.roomMeta.set(code, {
      createdAt: now,
      hostSocketIds: new Set(),
      hostlessSince: now,
      hostLost: false,
      playerTokens: new Map(),
      disconnectedAt: new Map(),
    });
    return room;
  }

  attachHost(
    code: string,
    socketId: string,
    now: number = Date.now(),
  ): { reconnected: boolean } {
    const meta = this.roomMeta.get(code);
    if (!meta) {
      throw new RoomNotFoundError(code);
    }
    const previousCode = this.hostSocketToRoom.get(socketId);
    if (previousCode !== undefined && previousCode !== code) {
      this.detachHost(socketId, now);
    }
    const reconnected = meta.hostLost;
    meta.hostSocketIds.add(socketId);
    meta.hostlessSince = null;
    meta.hostLost = false;
    this.hostSocketToRoom.set(socketId, code);
    return { reconnected };
  }

  detachHost(
    socketId: string,
    now: number = Date.now(),
  ): { code: string; hostless: boolean } | undefined {
    const code = this.hostSocketToRoom.get(socketId);
    if (code === undefined) {
      return undefined;
    }
    this.hostSocketToRoom.delete(socketId);
    const meta = this.roomMeta.get(code);
    if (!meta) {
      return undefined;
    }
    meta.hostSocketIds.delete(socketId);
    if (meta.hostSocketIds.size > 0) {
      return { code, hostless: false };
    }
    meta.hostlessSince = now;
    meta.hostLost = true;
    return { code, hostless: true };
  }

  // Cierra las salas que pasaron algún umbral y devuelve cuáles, para que el
  // gateway avise a sus sockets. Recibe `now` para poder probarse sin timers.
  closeExpiredRooms(
    now: number = Date.now(),
  ): { code: string; reason: RoomCloseReason }[] {
    const expired: { code: string; reason: RoomCloseReason }[] = [];
    for (const [code, meta] of this.roomMeta) {
      if (now - meta.createdAt >= this.config.maxAgeMs) {
        expired.push({ code, reason: 'max_age' });
      } else if (
        meta.hostlessSince !== null &&
        now - meta.hostlessSince >= this.config.hostGraceMs
      ) {
        expired.push({ code, reason: 'host_left' });
      }
    }
    for (const { code } of expired) {
      this.closeRoom(code);
    }
    return expired;
  }

  closeRoom(code: string): void {
    for (const service of this.roomScoped) {
      service.disposeRoom(code);
    }
    const meta = this.roomMeta.get(code);
    if (meta) {
      for (const socketId of meta.hostSocketIds) {
        this.hostSocketToRoom.delete(socketId);
      }
    }
    this.roomMeta.delete(code);
    this.rooms.delete(code);
  }

  joinRoom(
    code: string,
    name: string,
    socketId: string,
  ): { room: RoomState; player: Player; playerToken: string } {
    const room = this.rooms.get(code);
    const meta = this.roomMeta.get(code);
    if (!room || !meta) {
      throw new RoomNotFoundError(code);
    }
    const player: Player = { id: randomUUID(), name, socketId, connected: true };
    const playerToken = randomUUID();
    room.players.push(player);
    meta.playerTokens.set(playerToken, player.id);
    return { room, player, playerToken };
  }

  // El jugador se conserva (con su equipo) hasta que venza la gracia; ver
  // `removeExpiredPlayers`.
  markPlayerDisconnected(
    socketId: string,
    now: number = Date.now(),
  ): RoomState | undefined {
    for (const [code, room] of this.rooms) {
      const player = room.players.find((p) => p.socketId === socketId);
      if (player) {
        player.connected = false;
        this.roomMeta.get(code)?.disconnectedAt.set(player.id, now);
        return room;
      }
    }
    return undefined;
  }

  rejoinRoom(
    code: string,
    playerToken: string,
    socketId: string,
  ): { room: RoomState; player: Player; previousSocketId: string | null } {
    const room = this.rooms.get(code);
    const meta = this.roomMeta.get(code);
    const playerId = meta?.playerTokens.get(playerToken);
    const player = room?.players.find((p) => p.id === playerId);
    if (!room || !meta || !player) {
      throw new RejoinFailedError();
    }
    // Si seguía conectado con otro socket (pestaña duplicada), el gateway
    // necesita saber cuál para expulsarlo.
    const previousSocketId =
      player.connected && player.socketId !== socketId ? player.socketId : null;
    player.socketId = socketId;
    player.connected = true;
    meta.disconnectedAt.delete(player.id);
    return { room, player, previousSocketId };
  }

  // Elimina a los desconectados cuya gracia venció y devuelve las salas
  // afectadas para que el gateway difunda el nuevo estado. Recibe `now` para
  // probarse sin timers.
  removeExpiredPlayers(now: number = Date.now()): string[] {
    const affected: string[] = [];
    for (const [code, meta] of this.roomMeta) {
      const room = this.rooms.get(code);
      if (!room) continue;
      const graceMs =
        room.currentGame === null
          ? this.config.lobbyPlayerGraceMs
          : this.config.playerGraceMs;
      let changed = false;
      for (const [playerId, since] of meta.disconnectedAt) {
        if (now - since < graceMs) continue;
        meta.disconnectedAt.delete(playerId);
        for (const [token, id] of meta.playerTokens) {
          if (id === playerId) meta.playerTokens.delete(token);
        }
        room.players = room.players.filter((p) => p.id !== playerId);
        for (const team of room.teams) {
          team.playerIds = team.playerIds.filter((id) => id !== playerId);
        }
        changed = true;
      }
      if (changed) affected.push(code);
    }
    return affected;
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
