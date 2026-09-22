import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomNotFoundError, RoomService } from './room.service.js';

interface JoinRoomPayload {
  code: string;
  name: string;
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

  handleDisconnect(client: Socket) {
    const room = this.roomService.removePlayerBySocketId(client.id);
    if (room) {
      this.server.to(room.code).emit('room_state', room);
    }
  }
}
