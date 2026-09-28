import {
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnModuleDestroy, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { Subscription } from 'rxjs';
import { RoomNotFoundError } from '../room/room.service.js';
import { NotEnoughTeamsError } from '../game-engine/turn-distribution.js';
import type { RocolaFiltro } from '../rocola-content/rocola-content.types.js';
import {
  LaRocolaService,
  BuzzerNotOpenError,
  InsufficientFilteredSongsError,
  MatchAlreadyStartedError,
  NoRocolaMatchError,
  NotEligibleToBuzzError,
  NotYourAnswerError,
  PlayerNotInRoomError,
  RocolaMatchAlreadyRunningError,
} from './la-rocola.service.js';

interface CodePayload {
  code: string;
}

interface StartGamePayload {
  code: string;
  filtro?: RocolaFiltro;
}

interface SubmitAnswerPayload {
  code: string;
  texto: string;
}

const KNOWN_ERRORS = [
  RoomNotFoundError,
  NotEnoughTeamsError,
  RocolaMatchAlreadyRunningError,
  NoRocolaMatchError,
  PlayerNotInRoomError,
  MatchAlreadyStartedError,
  BuzzerNotOpenError,
  NotEligibleToBuzzError,
  NotYourAnswerError,
  InsufficientFilteredSongsError,
];

function isKnownError(error: unknown): error is Error {
  return KNOWN_ERRORS.some((ErrorClass) => error instanceof ErrorClass);
}

@WebSocketGateway({ cors: { origin: '*' } })
export class LaRocolaGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(LaRocolaGateway.name);
  private subscription: Subscription | null = null;

  constructor(private readonly laRocola: LaRocolaService) {}

  afterInit(): void {
    this.subscription = this.laRocola.events$.subscribe((event) => {
      switch (event.type) {
        case 'room_state':
          this.server.to(event.code).emit('room_state', event.room);
          break;
        case 'rocola_audio_control':
          for (const targetId of event.targetSocketIds) {
            this.server.to(targetId).emit('rocola_audio_control', {
              code: event.code,
              action: event.action,
              previewUrl: event.previewUrl,
            });
          }
          break;
        case 'rocola_ready_state':
          this.server.to(event.code).emit('rocola_ready_state', {
            code: event.code,
            readyPlayerIds: event.readyPlayerIds,
            eligiblePlayerIds: event.eligiblePlayerIds,
          });
          break;
        case 'rocola_round_started':
          this.server.to(event.code).emit('rocola_round_started', {
            code: event.code,
            roundNumber: event.roundNumber,
            totalRounds: event.totalRounds,
            marcador: event.marcador,
          });
          break;
        case 'rocola_countdown_tick':
          this.server.to(event.code).emit('rocola_countdown_tick', {
            code: event.code,
            remainingSeconds: event.remainingSeconds,
          });
          break;
        case 'rocola_buzzer_open':
          this.server.to(event.code).emit('rocola_buzzer_open', {
            code: event.code,
            eligibleTeamIds: event.eligibleTeamIds,
          });
          break;
        case 'rocola_buzzer_locked':
          this.server.to(event.code).emit('rocola_buzzer_locked', {
            code: event.code,
            playerId: event.playerId,
            playerName: event.playerName,
            teamId: event.teamId,
          });
          break;
        case 'rocola_answer_tick':
          this.server.to(event.code).emit('rocola_answer_tick', {
            code: event.code,
            remainingSeconds: event.remainingSeconds,
          });
          break;
        case 'rocola_robo_started':
          this.server.to(event.code).emit('rocola_robo_started', {
            code: event.code,
            eligibleTeamIds: event.eligibleTeamIds,
            eligibleTeamNames: event.eligibleTeamNames,
            remainingSeconds: event.remainingSeconds,
          });
          break;
        case 'rocola_round_result':
          this.server.to(event.code).emit('rocola_round_result', {
            code: event.code,
            resultado: event.resultado,
          });
          break;
        case 'rocola_match_result':
          this.server.to(event.code).emit('rocola_match_result', {
            code: event.code,
            scores: event.scores,
            canciones: event.canciones,
          });
          break;
      }
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  @SubscribeMessage('start_la_rocola_game')
  handleStart(@MessageBody() payload: StartGamePayload, @ConnectedSocket() client: Socket) {
    try {
      this.laRocola.startMatch(payload.code, payload.filtro);
    } catch (error) {
      this.handleError(error, client);
    }
  }

  @SubscribeMessage('rocola_get_artists')
  handleGetArtists(@MessageBody() payload: CodePayload, @ConnectedSocket() client: Socket) {
    // Respuesta directa al socket que preguntó, sin pasar por `events$` ni
    // por el resto de la sala — es una consulta de catálogo estático, no un
    // evento de juego (ver la-rocola-module/analysis.md).
    client.emit('rocola_artists', {
      code: payload.code,
      artistas: this.laRocola.getAvailableArtists(),
    });
  }

  @SubscribeMessage('rocola_ready')
  handleReady(@MessageBody() payload: CodePayload, @ConnectedSocket() client: Socket) {
    this.laRocola.markReady(payload.code, client.id).catch((error: unknown) => {
      if (isKnownError(error)) {
        client.emit('error', { message: error.message });
        return;
      }
      this.logger.error('Error inesperado en rocola_ready', error as Error);
    });
  }

  @SubscribeMessage('rocola_buzz')
  handleBuzz(@MessageBody() payload: CodePayload, @ConnectedSocket() client: Socket) {
    try {
      this.laRocola.handleBuzz(payload.code, client.id);
    } catch (error) {
      this.handleError(error, client);
    }
  }

  @SubscribeMessage('rocola_submit_answer')
  handleSubmitAnswer(
    @MessageBody() payload: SubmitAnswerPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.laRocola.handleSubmitAnswer(payload.code, client.id, payload.texto);
    } catch (error) {
      this.handleError(error, client);
    }
  }

  private handleError(error: unknown, client: Socket): void {
    if (isKnownError(error)) {
      client.emit('error', { message: error.message });
      return;
    }
    throw error;
  }
}
