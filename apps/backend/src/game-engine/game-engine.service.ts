import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { RoomService, TeamNotFoundError } from '../room/room.service.js';
import type { RoomState } from '../room/room.types.js';
import type { GameEngineEvent, TeamScore } from './game-engine.types.js';
import { RoundTimer } from './round-timer.js';

export class RoundAlreadyRunningError extends Error {
  constructor(code: string) {
    super(`La sala ${code} ya tiene una ronda en curso`);
    this.name = 'RoundAlreadyRunningError';
  }
}

export class NoRoundRunningError extends Error {
  constructor(code: string) {
    super(`La sala ${code} no tiene una ronda en curso`);
    this.name = 'NoRoundRunningError';
  }
}

export class InvalidRoundDurationError extends Error {
  constructor(durationSeconds: number) {
    super(`Duración de ronda inválida: ${durationSeconds}`);
    this.name = 'InvalidRoundDurationError';
  }
}

@Injectable()
export class GameEngineService implements OnModuleDestroy {
  private readonly timers = new Map<string, RoundTimer>();
  private readonly eventsSubject = new Subject<GameEngineEvent>();
  readonly events$: Observable<GameEngineEvent> =
    this.eventsSubject.asObservable();

  constructor(private readonly rooms: RoomService) {}

  startRound(code: string, durationSeconds: number): RoomState {
    const room = this.rooms.getRoomOrThrow(code);
    if (this.timers.has(code)) {
      throw new RoundAlreadyRunningError(code);
    }
    if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
      throw new InvalidRoundDurationError(durationSeconds);
    }

    room.status = 'jugando';
    room.round = { durationSeconds, remainingSeconds: durationSeconds };

    const timer = new RoundTimer(
      (remainingSeconds) => this.handleTick(code, remainingSeconds),
      () => this.handleRoundEnd(code),
    );
    this.timers.set(code, timer);
    timer.start(durationSeconds);

    this.emit({ type: 'room_state', code, room });
    this.emit({ type: 'round_started', code, round: room.round });

    return room;
  }

  endRound(code: string): RoomState {
    const room = this.rooms.getRoomOrThrow(code);
    if (!this.timers.has(code)) {
      throw new NoRoundRunningError(code);
    }
    this.stopTimer(code);
    return this.finishRound(code, room);
  }

  addScore(code: string, teamId: string, points: number): RoomState {
    const room = this.rooms.getRoomOrThrow(code);
    const team = room.teams.find((t) => t.id === teamId);
    if (!team) {
      throw new TeamNotFoundError(teamId);
    }
    team.score += points;
    this.emit({ type: 'room_state', code, room });
    return room;
  }

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) {
      timer.stop();
    }
    this.timers.clear();
  }

  private handleTick(code: string, remainingSeconds: number): void {
    const room = this.rooms.getRoom(code);
    if (!room || room.players.length === 0) {
      this.stopTimer(code);
      return;
    }
    if (room.round) {
      room.round.remainingSeconds = remainingSeconds;
    }
    this.emit({ type: 'round_update', code, remainingSeconds });
  }

  private handleRoundEnd(code: string): void {
    this.timers.delete(code);
    const room = this.rooms.getRoom(code);
    if (!room) {
      return;
    }
    this.finishRound(code, room);
  }

  private finishRound(code: string, room: RoomState): RoomState {
    room.status = 'resultados';
    room.round = null;
    const scores: TeamScore[] = room.teams.map((team) => ({
      teamId: team.id,
      score: team.score,
    }));
    this.emit({ type: 'room_state', code, room });
    this.emit({ type: 'round_result', code, scores });
    return room;
  }

  private stopTimer(code: string): void {
    const timer = this.timers.get(code);
    if (timer) {
      timer.stop();
      this.timers.delete(code);
    }
  }

  private emit(event: GameEngineEvent): void {
    this.eventsSubject.next(event);
  }
}
