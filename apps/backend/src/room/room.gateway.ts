import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  NoTeamsError,
  PlayerNotFoundError,
  RoomNotFoundError,
  RoomService,
  TeamNotFoundError,
} from './room.service.js';

interface JoinRoomPayload {
  code: string;
  name: string;
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

@WebSocketGateway({ cors: { origin: '*' } })
export class RoomGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly roomService: RoomService) {}

  @SubscribeMessage('create_room')
  handleCreateRoom(@ConnectedSocket() client: Socket) {
    const room = this.roomService.createRoom();
    void client.join(room.code);
    client.emit('room_state', room);
  }

  @SubscribeMessage('join_room')
  handleJoinRoom(
    @MessageBody() payload: JoinRoomPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const room = this.roomService.joinRoom(
        payload.code,
        payload.name,
        client.id,
      );
      void client.join(room.code);
      this.server.to(room.code).emit('room_state', room);
    } catch (error) {
      if (error instanceof RoomNotFoundError) {
        client.emit('error', { message: error.message });
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

  handleDisconnect(client: Socket) {
    const room = this.roomService.removePlayerBySocketId(client.id);
    if (room) {
      this.server.to(room.code).emit('room_state', room);
    }
  }
}
