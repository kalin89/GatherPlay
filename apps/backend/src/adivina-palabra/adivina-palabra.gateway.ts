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
import {
  AdivinaPalabraService,
  AdivinaMatchAlreadyRunningError,
  NoAdivinaMatchError,
  NoWordAvailableError,
  NotYourTurnError,
  PassLimitReachedError,
  PlayerNotInRoomError,
  TurnAlreadyStartedError,
  TurnNotStartedError,
} from './adivina-palabra.service.js';

interface StartAdivinaPalabraGamePayload {
  code: string;
}

interface AdivinaActionPayload {
  code: string;
}

const KNOWN_ERRORS = [
  RoomNotFoundError,
  NotEnoughTeamsError,
  AdivinaMatchAlreadyRunningError,
  NoAdivinaMatchError,
  NoWordAvailableError,
  PlayerNotInRoomError,
  NotYourTurnError,
  PassLimitReachedError,
  TurnAlreadyStartedError,
  TurnNotStartedError,
];

function isKnownError(error: unknown): error is Error {
  return KNOWN_ERRORS.some((ErrorClass) => error instanceof ErrorClass);
}

@WebSocketGateway({ cors: { origin: '*' } })
export class AdivinaPalabraGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AdivinaPalabraGateway.name);
  private subscription: Subscription | null = null;

  constructor(private readonly adivinaPalabra: AdivinaPalabraService) {}

  afterInit(): void {
    this.subscription = this.adivinaPalabra.events$.subscribe((event) => {
      switch (event.type) {
        case 'room_state':
          this.server.to(event.code).emit('room_state', event.room);
          break;
        case 'adivina_turn_waiting':
          this.server.to(event.code).emit('adivina_turn_waiting', {
            code: event.code,
            playerId: event.playerId,
            playerName: event.playerName,
            teamId: event.teamId,
            marcador: event.marcador,
          });
          break;
        case 'adivina_pantalla_estado':
          for (const targetId of event.targetSocketIds) {
            this.server.to(targetId).emit('adivina_pantalla_estado', {
              code: event.code,
              palabra: event.palabra,
              remainingSeconds: event.remainingSeconds,
              pasesRestantes: event.pasesRestantes,
              ultimaAccion: event.ultimaAccion,
            });
          }
          break;
        case 'adivina_jugador_estado':
          for (const targetId of event.targetSocketIds) {
            this.server.to(targetId).emit('adivina_jugador_estado', {
              code: event.code,
              remainingSeconds: event.remainingSeconds,
              pasesRestantes: event.pasesRestantes,
            });
          }
          break;
        case 'adivina_turn_result':
          this.server.to(event.code).emit('adivina_turn_result', {
            code: event.code,
            resultado: event.resultado,
          });
          break;
        case 'adivina_match_result':
          this.server.to(event.code).emit('adivina_match_result', {
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

  @SubscribeMessage('start_adivina_palabra_game')
  handleStartAdivinaPalabraGame(
    @MessageBody() payload: StartAdivinaPalabraGamePayload,
    @ConnectedSocket() client: Socket,
  ) {
    this.adivinaPalabra.startMatch(payload.code).catch((error: unknown) => {
      if (isKnownError(error)) {
        client.emit('error', { message: error.message });
        return;
      }
      this.logger.error('Error inesperado al arrancar Adivina la palabra', error as Error);
    });
  }

  @SubscribeMessage('adivina_ready')
  handleAdivinaReady(
    @MessageBody() payload: AdivinaActionPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.adivinaPalabra.markReady(payload.code, client.id);
    } catch (error) {
      if (isKnownError(error)) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }

  @SubscribeMessage('adivina_guess')
  handleAdivinaGuess(
    @MessageBody() payload: AdivinaActionPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.adivinaPalabra.markGuessed(payload.code, client.id);
    } catch (error) {
      if (isKnownError(error)) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }

  @SubscribeMessage('adivina_pass')
  handleAdivinaPass(
    @MessageBody() payload: AdivinaActionPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.adivinaPalabra.markPassed(payload.code, client.id);
    } catch (error) {
      if (isKnownError(error)) {
        client.emit('error', { message: error.message });
        return;
      }
      throw error;
    }
  }
}
