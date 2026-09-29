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
  EmptyGuessError,
  MatchAlreadyStartedError,
  MemorizaMatchAlreadyRunningError,
  MemorizaObjetosService,
  NoMemorizaMatchError,
  NotYourTurnError,
  PassNotAvailableYetError,
  PlayerNotInRoomError,
} from './memoriza-objetos.service.js';

interface CodePayload {
  code: string;
}

interface SubmitGuessPayload {
  code: string;
  texto: string;
}

const KNOWN_ERRORS = [
  RoomNotFoundError,
  NotEnoughTeamsError,
  MemorizaMatchAlreadyRunningError,
  NoMemorizaMatchError,
  PlayerNotInRoomError,
  MatchAlreadyStartedError,
  NotYourTurnError,
  EmptyGuessError,
  PassNotAvailableYetError,
];

function isKnownError(error: unknown): error is Error {
  return KNOWN_ERRORS.some((ErrorClass) => error instanceof ErrorClass);
}

@WebSocketGateway({ cors: { origin: '*' } })
export class MemorizaObjetosGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private subscription: Subscription | null = null;

  constructor(private readonly memorizaObjetos: MemorizaObjetosService) {}

  afterInit(): void {
    this.subscription = this.memorizaObjetos.events$.subscribe((event) => {
      switch (event.type) {
        case 'room_state':
          this.server.to(event.code).emit('room_state', event.room);
          break;
        case 'memoriza_waiting_ready':
          this.server.to(event.code).emit('memoriza_waiting_ready', {
            code: event.code,
            readyPlayerIds: event.readyPlayerIds,
            eligiblePlayerIds: event.eligiblePlayerIds,
            items: event.items,
          });
          break;
        case 'memoriza_pon_atencion':
          this.server.to(event.code).emit('memoriza_pon_atencion', {
            code: event.code,
            remainingSeconds: event.remainingSeconds,
          });
          break;
        case 'memoriza_memorizando':
          this.server.to(event.code).emit('memoriza_memorizando', {
            code: event.code,
            items: event.items,
            remainingSeconds: event.remainingSeconds,
          });
          break;
        case 'memoriza_tablero':
          this.server.to(event.code).emit('memoriza_tablero', {
            code: event.code,
            items: event.items,
            clocks: event.clocks,
            equipoActivoId: event.equipoActivoId,
            jugadorActivo: event.jugadorActivo,
            turnNumber: event.turnNumber,
          });
          break;
        case 'memoriza_turno_jugador':
          for (const targetId of event.targetSocketIds) {
            this.server.to(targetId).emit('memoriza_turno_jugador', {
              code: event.code,
              remainingSeconds: event.remainingSeconds,
              puedePasar: event.puedePasar,
            });
          }
          break;
        case 'memoriza_intento_resultado':
          this.server.to(event.code).emit('memoriza_intento_resultado', {
            code: event.code,
            teamId: event.teamId,
            acierto: event.acierto,
            palabra: event.palabra,
          });
          break;
        case 'memoriza_match_result':
          this.server.to(event.code).emit('memoriza_match_result', {
            code: event.code,
            scores: event.scores,
            palabrasPorEquipo: event.palabrasPorEquipo,
            items: event.items,
          });
          break;
      }
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  @SubscribeMessage('start_memoriza_objetos_game')
  handleStart(@MessageBody() payload: CodePayload, @ConnectedSocket() client: Socket) {
    try {
      this.memorizaObjetos.startMatch(payload.code);
    } catch (error) {
      this.handleError(error, client);
    }
  }

  @SubscribeMessage('memoriza_ready')
  handleReady(@MessageBody() payload: CodePayload, @ConnectedSocket() client: Socket) {
    try {
      this.memorizaObjetos.markReady(payload.code, client.id);
    } catch (error) {
      this.handleError(error, client);
    }
  }

  @SubscribeMessage('memoriza_submit_guess')
  handleSubmitGuess(
    @MessageBody() payload: SubmitGuessPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.memorizaObjetos.submitGuess(payload.code, client.id, payload.texto);
    } catch (error) {
      this.handleError(error, client);
    }
  }

  @SubscribeMessage('memoriza_pass')
  handlePass(@MessageBody() payload: CodePayload, @ConnectedSocket() client: Socket) {
    try {
      this.memorizaObjetos.passTurn(payload.code, client.id);
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
