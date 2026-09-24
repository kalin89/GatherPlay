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
import { UnknownTriviaCategoryError } from '../ai-content/ai-content.service.js';
import {
  RoundAlreadyRunningError,
  InvalidRoundDurationError,
} from '../game-engine/game-engine.service.js';
import {
  AlreadyAnsweredError,
  InvalidAnswerIndexError,
  NoTriviaRoundError,
  PlayerNotInRoomError,
  TriviaService,
} from './trivia.service.js';

interface StartTriviaRoundPayload {
  code: string;
  categoria: string;
  durationSeconds: number;
}

interface SubmitTriviaAnswerPayload {
  code: string;
  opcionIndex: number;
}

const KNOWN_ERRORS = [
  RoomNotFoundError,
  RoundAlreadyRunningError,
  InvalidRoundDurationError,
  UnknownTriviaCategoryError,
  NoTriviaRoundError,
  PlayerNotInRoomError,
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
        case 'trivia_question':
          this.server.to(event.code).emit('trivia_question', {
            code: event.code,
            categoria: event.categoria,
            pregunta: event.pregunta,
            opciones: event.opciones,
          });
          break;
        case 'trivia_result':
          this.server.to(event.code).emit('trivia_result', {
            code: event.code,
            pregunta: event.pregunta,
            opciones: event.opciones,
            indiceCorrecto: event.indiceCorrecto,
            resultados: event.resultados,
          });
          break;
      }
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  @SubscribeMessage('start_trivia_round')
  async handleStartTriviaRound(
    @MessageBody() payload: StartTriviaRoundPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      await this.trivia.startRound(payload.code, payload.categoria, payload.durationSeconds);
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
