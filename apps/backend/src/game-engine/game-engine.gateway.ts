import {
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RoomNotFoundError, TeamNotFoundError } from '../room/room.service.js';
import {
  GameEngineService,
  InvalidRoundDurationError,
  NoRoundRunningError,
  RoundAlreadyRunningError,
} from './game-engine.service.js';
import type { Subscription } from 'rxjs';

interface StartRoundPayload {
  code: string;
  durationSeconds: number;
}

interface EndRoundPayload {
  code: string;
}

interface AwardPointsPayload {
  code: string;
  teamId: string;
  points: number;
}

@WebSocketGateway({ cors: { origin: '*' } })
export class GameEngineGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private subscription: Subscription | null = null;

  constructor(private readonly gameEngine: GameEngineService) {}

  afterInit(): void {
    this.subscription = this.gameEngine.events$.subscribe((event) => {
      switch (event.type) {
        case 'room_state':
          this.server.to(event.code).emit('room_state', event.room);
          break;
        case 'round_started':
          this.server
            .to(event.code)
            .emit('round_started', { code: event.code, round: event.round });
          break;
        case 'round_update':
          this.server.to(event.code).emit('round_update', {
            code: event.code,
            remainingSeconds: event.remainingSeconds,
          });
          break;
        case 'round_result':
          this.server.to(event.code).emit('round_result', {
            code: event.code,
            scores: event.scores,
          });
          break;
      }
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  @SubscribeMessage('start_round')
  handleStartRound(
    @MessageBody() payload: StartRoundPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // El room_state y el round_started ya salen por events$ (afterInit),
      // no se emite nada más acá.
      this.gameEngine.startRound(payload.code, payload.durationSeconds);
    } catch (error) {
      if (
        error instanceof RoomNotFoundError ||
        error instanceof RoundAlreadyRunningError ||
        error instanceof InvalidRoundDurationError
      ) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }

  @SubscribeMessage('end_round')
  handleEndRound(
    @MessageBody() payload: EndRoundPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.gameEngine.endRound(payload.code);
    } catch (error) {
      if (
        error instanceof RoomNotFoundError ||
        error instanceof NoRoundRunningError
      ) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }

  @SubscribeMessage('award_points')
  handleAwardPoints(
    @MessageBody() payload: AwardPointsPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.gameEngine.addScore(payload.code, payload.teamId, payload.points);
    } catch (error) {
      if (
        error instanceof RoomNotFoundError ||
        error instanceof TeamNotFoundError
      ) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }
}
