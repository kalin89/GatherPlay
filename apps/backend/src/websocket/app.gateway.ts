import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

// Fase 0: gateway mínimo para probar la conexión pantalla <-> servidor <-> celular
// de punta a punta. Sin lógica de juego — eso empieza en Fase 1 con RoomModule
// y GameEngineCore (ver plan.md).
@WebSocketGateway({ cors: { origin: '*' } })
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AppGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('echo')
  handleEcho(@MessageBody() data: unknown, @ConnectedSocket() client: Socket) {
    client.emit('echo', data);
  }
}
