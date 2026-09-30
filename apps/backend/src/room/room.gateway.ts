import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  GameAlreadyStartedError,
  NoTeamsError,
  PlayerNotFoundError,
  RejoinFailedError,
  RoomNotFoundError,
  RoomService,
  TeamNotFoundError,
  TooManyRoomsError,
  UnknownGameError,
} from './room.service.js';

interface JoinRoomPayload {
  code: string;
  name: string;
}

interface RejoinRoomPayload {
  code: string;
  playerToken: string;
}

interface CreateTeamPayload {
  code: string;
  name: string;
  color: string;
}

interface AssignTeamPayload {
  code: string;
  playerId: string;
  teamId: string;
}

interface RandomizeTeamsPayload {
  code: string;
}

interface RemoveTeamPayload {
  code: string;
  teamId: string;
}

interface WatchRoomPayload {
  code: string;
}

// Sala de Socket.io aparte para la pantalla de una sala: le permite a un
// minijuego (ej. Trivia) mandarle contenido completo (la pregunta) solo a la
// pantalla + el jugador en turno, sin exponérselo al resto de los celulares.
export function screenRoomName(code: string): string {
  return `${code}:screen`;
}

interface SelectGamePayload {
  code: string;
  gameId: string;
}

@WebSocketGateway({ cors: { origin: '*' } })
export class RoomGateway
  implements OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private readonly roomService: RoomService) {}

  // Barrido único en vez de un temporizador por sala: más fácil de probar y
  // no deja cientos de timers vivos. `unref` para no impedir que el proceso
  // termine.
  onModuleInit(): void {
    this.sweepTimer = setInterval(
      () => this.closeExpiredRooms(),
      this.roomService.lifecycleConfig.sweepIntervalMs,
    );
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  private closeExpiredRooms(): void {
    for (const { code, reason } of this.roomService.closeExpiredRooms()) {
      this.server.to(code).emit('room_closed', { reason });
      this.server.in(code).socketsLeave([code, screenRoomName(code)]);
    }
    // Las salas recién cerradas ya no existen, así que no se les difunde nada.
    for (const code of this.roomService.removeExpiredPlayers()) {
      const room = this.roomService.getRoom(code);
      if (room) {
        this.server.to(code).emit('room_state', room);
      }
    }
  }

  @SubscribeMessage('create_room')
  handleCreateRoom(@ConnectedSocket() client: Socket) {
    try {
      const room = this.roomService.createRoom();
      void client.join(room.code);
      client.emit('room_state', room);
    } catch (error) {
      if (error instanceof TooManyRoomsError) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }

  @SubscribeMessage('join_room')
  handleJoinRoom(
    @MessageBody() payload: JoinRoomPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { room, player, playerToken } = this.roomService.joinRoom(
        payload.code,
        payload.name,
        client.id,
      );
      void client.join(room.code);
      this.server.to(room.code).emit('room_state', room);
      // El token va solo a este socket: en `room_state` lo verían todos. Se
      // emite después de la difusión para no alterar el orden en que ya
      // llegan los `room_state`.
      client.emit('joined', { playerId: player.id, playerToken });
    } catch (error) {
      if (error instanceof RoomNotFoundError) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }

  @SubscribeMessage('rejoin_room')
  handleRejoinRoom(
    @MessageBody() payload: RejoinRoomPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { room, player, previousSocketId } = this.roomService.rejoinRoom(
        payload.code,
        payload.playerToken,
        client.id,
      );
      if (previousSocketId) {
        const previous = this.server.sockets.sockets.get(previousSocketId);
        previous?.emit('replaced');
        previous?.disconnect(true);
      }
      void client.join(room.code);
      client.emit('joined', {
        playerId: player.id,
        playerToken: payload.playerToken,
      });
      this.server.to(room.code).emit('room_state', room);
      // Solo a este socket: lo que le corresponde ver del juego en curso.
      for (const { event, payload } of this.roomService.getSnapshot(
        room.code,
        player.id,
      )) {
        client.emit(event, payload);
      }
    } catch (error) {
      if (error instanceof RejoinFailedError) {
        client.emit('error', { code: 'REJOIN_FAILED', message: error.message });
        return;
      }
      throw error;
    }
  }

  @SubscribeMessage('create_team')
  handleCreateTeam(
    @MessageBody() payload: CreateTeamPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const room = this.roomService.createTeam(
        payload.code,
        payload.name,
        payload.color,
      );
      this.server.to(room.code).emit('room_state', room);
    } catch (error) {
      if (error instanceof RoomNotFoundError) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }

  @SubscribeMessage('assign_team')
  handleAssignTeam(
    @MessageBody() payload: AssignTeamPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const room = this.roomService.assignPlayerToTeam(
        payload.code,
        payload.playerId,
        payload.teamId,
      );
      this.server.to(room.code).emit('room_state', room);
    } catch (error) {
      if (
        error instanceof RoomNotFoundError ||
        error instanceof PlayerNotFoundError ||
        error instanceof TeamNotFoundError
      ) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }

  @SubscribeMessage('remove_team')
  handleRemoveTeam(
    @MessageBody() payload: RemoveTeamPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const room = this.roomService.removeTeam(payload.code, payload.teamId);
      this.server.to(room.code).emit('room_state', room);
    } catch (error) {
      if (error instanceof RoomNotFoundError || error instanceof TeamNotFoundError) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }

  @SubscribeMessage('randomize_teams')
  handleRandomizeTeams(
    @MessageBody() payload: RandomizeTeamsPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const room = this.roomService.randomizeTeams(payload.code);
      this.server.to(room.code).emit('room_state', room);
    } catch (error) {
      if (error instanceof RoomNotFoundError || error instanceof NoTeamsError) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }

  @SubscribeMessage('select_game')
  handleSelectGame(
    @MessageBody() payload: SelectGamePayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const room = this.roomService.selectGame(payload.code, payload.gameId);
      this.server.to(room.code).emit('room_state', room);
    } catch (error) {
      if (
        error instanceof RoomNotFoundError ||
        error instanceof GameAlreadyStartedError ||
        error instanceof UnknownGameError
      ) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }

  @SubscribeMessage('watch_room')
  handleWatchRoom(
    @MessageBody() payload: WatchRoomPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const room = this.roomService.getRoomOrThrow(payload.code);
      void client.join(room.code);
      void client.join(screenRoomName(room.code));
      const { reconnected } = this.roomService.attachHost(room.code, client.id);
      client.emit('room_state', room);
      if (reconnected) {
        this.server.to(room.code).emit('host_reconnected');
      }
    } catch (error) {
      if (error instanceof RoomNotFoundError) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }

  handleDisconnect(client: Socket) {
    const room = this.roomService.markPlayerDisconnected(client.id);
    if (room) {
      this.server.to(room.code).emit('room_state', room);
    }
    const host = this.roomService.detachHost(client.id);
    if (host?.hostless) {
      this.server.to(host.code).emit('host_disconnected');
    }
  }
}
