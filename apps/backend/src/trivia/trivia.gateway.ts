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
  AlreadyAnsweredError,
  InvalidAnswerIndexError,
  NoTriviaMatchError,
  NotYourTurnError,
  PlayerNotInRoomError,
  TriviaMatchAlreadyRunningError,
  TriviaService,
} from './trivia.service.js';

interface StartTriviaGamePayload {
  code: string;
}

interface SubmitTriviaAnswerPayload {
  code: string;
  opcionIndex: number;
}

const KNOWN_ERRORS = [
  RoomNotFoundError,
  NotEnoughTeamsError,
  TriviaMatchAlreadyRunningError,
  NoTriviaMatchError,
  PlayerNotInRoomError,
  NotYourTurnError,
  AlreadyAnsweredError,
  InvalidAnswerIndexError,
];

function isKnownError(error: unknown): error is Error {
  return KNOWN_ERRORS.some((ErrorClass) => error instanceof ErrorClass);
}

@WebSocketGateway({ cors: { origin: '*' } })
export class TriviaGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private subscription: Subscription | null = null;

  constructor(private readonly trivia: TriviaService) {}

  afterInit(): void {
    this.subscription = this.trivia.events$.subscribe((event) => {
      switch (event.type) {
        case 'room_state':
          this.server.to(event.code).emit('room_state', event.room);
          break;
        case 'trivia_turn_waiting':
          this.server.to(event.code).emit('trivia_turn_waiting', {
            code: event.code,
            playerId: event.playerId,
            playerName: event.playerName,
            teamId: event.teamId,
          });
          break;
        case 'trivia_turn_started':
          for (const targetId of event.targetSocketIds) {
            this.server.to(targetId).emit('trivia_turn_started', {
              code: event.code,
              playerId: event.playerId,
              playerName: event.playerName,
              pregunta: event.pregunta,
              opciones: event.opciones,
              durationSeconds: event.durationSeconds,
            });
          }
          break;
        case 'trivia_turn_update':
          for (const targetId of event.targetSocketIds) {
            this.server.to(targetId).emit('trivia_turn_update', {
              code: event.code,
              remainingSeconds: event.remainingSeconds,
            });
          }
          break;
        case 'trivia_turn_result':
          this.server.to(event.code).emit('trivia_turn_result', {
            code: event.code,
            pregunta: event.pregunta,
            opciones: event.opciones,
            indiceCorrecto: event.indiceCorrecto,
            resultado: event.resultado,
          });
          break;
        case 'trivia_match_result':
          this.server.to(event.code).emit('trivia_match_result', {
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

  @SubscribeMessage('start_trivia_game')
  handleStartTriviaGame(
    @MessageBody() payload: StartTriviaGamePayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.trivia.startMatch(payload.code);
    } catch (error) {
      if (isKnownError(error)) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }

  @SubscribeMessage('submit_trivia_answer')
  handleSubmitTriviaAnswer(
    @MessageBody() payload: SubmitTriviaAnswerPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.trivia.submitAnswer(payload.code, client.id, payload.opcionIndex);
      client.emit('trivia_answer_accepted', { opcionIndex: payload.opcionIndex });
    } catch (error) {
      if (isKnownError(error)) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }
}
