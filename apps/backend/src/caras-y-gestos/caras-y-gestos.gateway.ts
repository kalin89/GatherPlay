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
import type { Subscription } from 'rxjs';
import { RoomNotFoundError } from '../room/room.service.js';
import { NotEnoughTeamsError } from '../game-engine/turn-distribution.js';
import {
  CarasYGestosService,
  GestosMatchAlreadyRunningError,
  NoGestosMatchError,
  NotYourTurnError,
  PlayerNotInRoomError,
  TurnAlreadyStartedError,
  TurnNotStartedError,
} from './caras-y-gestos.service.js';

interface StartGestosGamePayload {
  code: string;
}

interface StartGestosTurnPayload {
  code: string;
}

interface MarkGestureWordPayload {
  code: string;
  resultado: 'adivinada' | 'paso';
}

const KNOWN_ERRORS = [
  RoomNotFoundError,
  NotEnoughTeamsError,
  GestosMatchAlreadyRunningError,
  NoGestosMatchError,
  PlayerNotInRoomError,
  NotYourTurnError,
  TurnAlreadyStartedError,
  TurnNotStartedError,
];

function isKnownError(error: unknown): error is Error {
  return KNOWN_ERRORS.some((ErrorClass) => error instanceof ErrorClass);
}

@WebSocketGateway({ cors: { origin: '*' } })
export class CarasYGestosGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private subscription: Subscription | null = null;

  constructor(private readonly carasYGestos: CarasYGestosService) {}

  afterInit(): void {
    this.subscription = this.carasYGestos.events$.subscribe((event) => {
      switch (event.type) {
        case 'room_state':
          this.server.to(event.code).emit('room_state', event.room);
          break;
        case 'gestos_turn_waiting':
          this.server.to(event.code).emit('gestos_turn_waiting', {
            code: event.code,
            playerId: event.playerId,
            playerName: event.playerName,
            teamId: event.teamId,
          });
          break;
        case 'gestos_turn_started':
          for (const targetId of event.targetSocketIds) {
            this.server.to(targetId).emit('gestos_turn_started', {
              code: event.code,
              playerId: event.playerId,
              playerName: event.playerName,
              palabra: event.palabra,
              durationSeconds: event.durationSeconds,
              palabrasRestantes: event.palabrasRestantes,
            });
          }
          break;
        case 'gestos_actor_ready':
          this.server.to(event.targetSocketId).emit('gestos_actor_ready', {
            code: event.code,
          });
          break;
        case 'gestos_word_update':
          for (const targetId of event.targetSocketIds) {
            this.server.to(targetId).emit('gestos_word_update', {
              code: event.code,
              palabra: event.palabra,
              palabrasRestantes: event.palabrasRestantes,
              motivo: event.motivo,
            });
          }
          break;
        case 'gestos_turn_tick':
          for (const targetId of event.targetSocketIds) {
            this.server.to(targetId).emit('gestos_turn_tick', {
              code: event.code,
              remainingSeconds: event.remainingSeconds,
            });
          }
          break;
        case 'gestos_turn_result':
          this.server.to(event.code).emit('gestos_turn_result', {
            code: event.code,
            resultado: event.resultado,
          });
          break;
        case 'gestos_match_result':
          this.server.to(event.code).emit('gestos_match_result', {
            code: event.code,
            scores: event.scores,
            palabrasPorEquipo: event.palabrasPorEquipo,
          });
          break;
      }
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  @SubscribeMessage('start_gestos_game')
  handleStartGestosGame(
    @MessageBody() payload: StartGestosGamePayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.carasYGestos.startMatch(payload.code);
    } catch (error) {
      if (isKnownError(error)) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }

  @SubscribeMessage('start_gestos_turn')
  handleStartGestosTurn(
    @MessageBody() payload: StartGestosTurnPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.carasYGestos.startTurn(payload.code, client.id);
    } catch (error) {
      if (isKnownError(error)) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }

  @SubscribeMessage('mark_gesture_word')
  handleMarkGestureWord(
    @MessageBody() payload: MarkGestureWordPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.carasYGestos.markWord(payload.code, client.id, payload.resultado);
    } catch (error) {
      if (isKnownError(error)) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }
}
