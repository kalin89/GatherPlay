import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { Observable, Subject, type Subscription } from 'rxjs';
import { RoomService } from '../room/room.service.js';
import { GameEngineService } from '../game-engine/game-engine.service.js';
import { AiContentService } from '../ai-content/ai-content.service.js';
import type { TriviaAnswerResult, TriviaEvent } from './trivia.types.js';

export class NoTriviaRoundError extends Error {
  constructor(code: string) {
    super(`La sala ${code} no tiene una pregunta de trivia activa`);
    this.name = 'NoTriviaRoundError';
  }
}

export class PlayerNotInRoomError extends Error {
  constructor(socketId: string) {
    super(`No hay un jugador de esta sala conectado con el socket ${socketId}`);
    this.name = 'PlayerNotInRoomError';
  }
}

export class AlreadyAnsweredError extends Error {
  constructor(playerId: string) {
    super(`El jugador ${playerId} ya respondió esta pregunta`);
    this.name = 'AlreadyAnsweredError';
  }
}

export class InvalidAnswerIndexError extends Error {
  constructor(opcionIndex: number) {
    super(`Opción de respuesta inválida: ${opcionIndex}`);
    this.name = 'InvalidAnswerIndexError';
  }
}

interface TriviaAnswer {
  opcionIndex: number;
  answeredAtMs: number;
}

interface TriviaRoundState {
  categoria: string;
  pregunta: string;
  opciones: string[];
  indiceCorrecto: number;
  durationSeconds: number;
  startedAtMs: number;
  answers: Map<string, TriviaAnswer>;
}

const BASE_POINTS = 100;
const MAX_SPEED_BONUS = 50;

// Reparte una pregunta por ronda (GameEngineService no conoce nada de Trivia —
// ver specs/features/trivia-module/analysis.md para cómo se engancha sin tocar
// GameEngineCore) y calcula el puntaje con bono por rapidez al resolver.
@Injectable()
export class TriviaService implements OnModuleInit, OnModuleDestroy {
  private readonly rounds = new Map<string, TriviaRoundState>();
  private readonly eventsSubject = new Subject<TriviaEvent>();
  readonly events$: Observable<TriviaEvent> = this.eventsSubject.asObservable();
  private subscription: Subscription | null = null;

  constructor(
    private readonly rooms: RoomService,
    private readonly gameEngine: GameEngineService,
    private readonly aiContent: AiContentService,
    @Optional() private readonly now: () => number = Date.now,
  ) {}

  onModuleInit(): void {
    this.subscription = this.gameEngine.events$.subscribe((event) => {
      if (event.type === 'round_update' && event.remainingSeconds === 0) {
        this.resolveRound(event.code);
      } else if (event.type === 'round_result') {
        // Se cerró por end_round genérico (no por timeout) — no hay forma de
        // puntuar a tiempo sin tocar GameEngineCore, ver analysis.md. Se
        // limpia el estado para no dejar respuestas huérfanas aceptando
        // envíos de una ronda que ya terminó.
        this.rounds.delete(event.code);
      }
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  async startRound(code: string, categoria: string, durationSeconds: number): Promise<void> {
    const [pregunta] = await this.aiContent.getTriviaQuestions(categoria, 1);

    this.gameEngine.startRound(code, durationSeconds);

    this.rounds.set(code, {
      categoria,
      pregunta: pregunta.pregunta,
      opciones: pregunta.opciones,
      indiceCorrecto: pregunta.indiceCorrecto,
      durationSeconds,
      startedAtMs: this.now(),
      answers: new Map(),
    });

    this.emit({
      type: 'trivia_question',
      code,
      categoria,
      pregunta: pregunta.pregunta,
      opciones: pregunta.opciones,
    });
  }

  submitAnswer(code: string, socketId: string, opcionIndex: number): void {
    const round = this.rounds.get(code);
    if (!round) {
      throw new NoTriviaRoundError(code);
    }

    const room = this.rooms.getRoomOrThrow(code);
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) {
      throw new PlayerNotInRoomError(socketId);
    }

    if (!Number.isInteger(opcionIndex) || opcionIndex < 0 || opcionIndex >= round.opciones.length) {
      throw new InvalidAnswerIndexError(opcionIndex);
    }

    if (round.answers.has(player.id)) {
      throw new AlreadyAnsweredError(player.id);
    }

    round.answers.set(player.id, {
      opcionIndex,
      answeredAtMs: this.now() - round.startedAtMs,
    });
  }

  private resolveRound(code: string): void {
    const round = this.rounds.get(code);
    if (!round) return;

    const room = this.rooms.getRoom(code);
    if (!room) {
      this.rounds.delete(code);
      return;
    }

    const durationMs = round.durationSeconds * 1000;
    const resultados: TriviaAnswerResult[] = [];

    for (const player of room.players) {
      const answer = round.answers.get(player.id);
      const correcta = answer !== undefined && answer.opcionIndex === round.indiceCorrecto;
      const puntos = answer && correcta ? this.calculatePoints(answer.answeredAtMs, durationMs) : 0;

      resultados.push({
        playerId: player.id,
        opcionIndex: answer?.opcionIndex ?? null,
        correcta,
        puntos,
      });

      if (puntos > 0) {
        const team = room.teams.find((t) => t.playerIds.includes(player.id));
        if (team) {
          this.gameEngine.addScore(code, team.id, puntos);
        }
      }
    }

    this.emit({
      type: 'trivia_result',
      code,
      pregunta: round.pregunta,
      opciones: round.opciones,
      indiceCorrecto: round.indiceCorrecto,
      resultados,
    });

    this.rounds.delete(code);
  }

  private calculatePoints(answeredAtMs: number, durationMs: number): number {
    const fraccionRestante = 1 - answeredAtMs / durationMs;
    const bono = Math.round(MAX_SPEED_BONUS * Math.max(0, Math.min(1, fraccionRestante)));
    return BASE_POINTS + bono;
  }

  private emit(event: TriviaEvent): void {
    this.eventsSubject.next(event);
  }
}
