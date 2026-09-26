import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { RoomService } from '../room/room.service.js';
import { screenRoomName } from '../room/room.gateway.js';
import { GameEngineService } from '../game-engine/game-engine.service.js';
import { AiContentService } from '../ai-content/ai-content.service.js';
import { RoundTimer } from '../game-engine/round-timer.js';
import { distributeTurns, type TurnAssignment } from '../game-engine/turn-distribution.js';
import type { TeamScore } from '../game-engine/game-engine.types.js';
import type { TriviaEvent, TriviaTurnResult } from './trivia.types.js';

export class TriviaMatchAlreadyRunningError extends Error {
  constructor(code: string) {
    super(`La sala ${code} ya tiene una partida de trivia en curso`);
    this.name = 'TriviaMatchAlreadyRunningError';
  }
}

export class NoTriviaMatchError extends Error {
  constructor(code: string) {
    super(`La sala ${code} no tiene una partida de trivia activa`);
    this.name = 'NoTriviaMatchError';
  }
}

export class PlayerNotInRoomError extends Error {
  constructor(socketId: string) {
    super(`No hay un jugador de esta sala conectado con el socket ${socketId}`);
    this.name = 'PlayerNotInRoomError';
  }
}

export class NotYourTurnError extends Error {
  constructor(playerId: string) {
    super(`No es el turno del jugador ${playerId}`);
    this.name = 'NotYourTurnError';
  }
}

export class AlreadyAnsweredError extends Error {
  constructor(playerId: string) {
    super(`El jugador ${playerId} ya respondió este turno`);
    this.name = 'AlreadyAnsweredError';
  }
}

export class InvalidAnswerIndexError extends Error {
  constructor(opcionIndex: number) {
    super(`Opción de respuesta inválida: ${opcionIndex}`);
    this.name = 'InvalidAnswerIndexError';
  }
}

interface TriviaQuestionState {
  pregunta: string;
  opciones: string[];
  indiceCorrecto: number;
}

interface TriviaMatchState {
  turns: TurnAssignment[];
  currentIndex: number;
  questions: TriviaQuestionState[];
  answered: boolean;
  timer: RoundTimer | null;
  // Puntos ganados en ESTA partida (para el resultado final) — distinto de
  // team.score, que es el acumulado de por vida y se ve en el panel de
  // selección de juego.
  matchScores: Map<string, number>;
}

const DEFAULT_CATEGORY = 'general';
const ROUNDS_PER_PLAYER = 3;
const TRIVIA_TURN_POINTS = 1;
const TRIVIA_TURN_SECONDS = 15;
const TURN_TRANSITION_DELAY_MS = 2500;
const RESULTS_DISPLAY_MS = 10_000;
// Por debajo del MAX_QUESTIONS de AiContentService, sin acoplar ambos módulos —
// red de seguridad para no pedirle a la IA más de lo que puede dar en un lote.
const MAX_TRIVIA_QUESTIONS_PER_MATCH = 40;

// Rediseño a turnos individuales — ver specs/features/trivia-module/analysis.md
// para por qué esto usa RoundTimer directamente en vez de
// GameEngineService.startRound/endRound (una partida son N turnos, no una
// ronda), y solo reusa gameEngine.addScore.
@Injectable()
export class TriviaService implements OnModuleDestroy {
  private readonly matches = new Map<string, TriviaMatchState>();
  private readonly eventsSubject = new Subject<TriviaEvent>();
  readonly events$: Observable<TriviaEvent> = this.eventsSubject.asObservable();

  constructor(
    private readonly rooms: RoomService,
    private readonly gameEngine: GameEngineService,
    private readonly aiContent: AiContentService,
    @Optional()
    private readonly scheduler: (callback: () => void, ms: number) => void = (
      callback,
      ms,
    ) => {
      setTimeout(callback, ms);
    },
  ) {}

  onModuleDestroy(): void {
    for (const match of this.matches.values()) {
      match.timer?.stop();
    }
    this.matches.clear();
  }

  startMatch(code: string): void {
    if (this.matches.has(code)) {
      throw new TriviaMatchAlreadyRunningError(code);
    }

    const room = this.rooms.getRoomOrThrow(code);
    const turns = distributeTurns(room.teams, ROUNDS_PER_PLAYER);

    room.status = 'jugando';
    this.matches.set(code, {
      turns,
      currentIndex: 0,
      questions: [],
      answered: false,
      timer: null,
      matchScores: new Map(room.teams.map((team) => [team.id, 0])),
    });

    this.emit({ type: 'room_state', code, room });
    void this.loadQuestionsAndStartFirstTurn(
      code,
      Math.min(turns.length, MAX_TRIVIA_QUESTIONS_PER_MATCH),
    );
  }

  submitAnswer(code: string, socketId: string, opcionIndex: number): void {
    const match = this.matches.get(code);
    if (!match) {
      throw new NoTriviaMatchError(code);
    }

    const room = this.rooms.getRoomOrThrow(code);
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) {
      throw new PlayerNotInRoomError(socketId);
    }

    const turn = match.turns[match.currentIndex]!;
    if (turn.playerId !== player.id) {
      throw new NotYourTurnError(player.id);
    }
    if (match.answered) {
      throw new AlreadyAnsweredError(player.id);
    }

    const question = this.currentQuestion(match);
    if (
      !Number.isInteger(opcionIndex) ||
      opcionIndex < 0 ||
      opcionIndex >= question.opciones.length
    ) {
      throw new InvalidAnswerIndexError(opcionIndex);
    }

    match.answered = true;
    match.timer?.stop();
    this.resolveTurn(code, opcionIndex);
  }

  private async loadQuestionsAndStartFirstTurn(code: string, count: number): Promise<void> {
    const match = this.matches.get(code);
    if (!match) return;

    const preguntas = await this.aiContent.getTriviaQuestions(DEFAULT_CATEGORY, count);
    match.questions = preguntas.map((p) => ({
      pregunta: p.pregunta,
      opciones: p.opciones,
      indiceCorrecto: p.indiceCorrecto,
    }));

    this.startTurn(code);
  }

  private currentQuestion(match: TriviaMatchState): TriviaQuestionState {
    return match.questions[match.currentIndex % match.questions.length]!;
  }

  private startTurn(code: string): void {
    const match = this.matches.get(code)!;
    const room = this.rooms.getRoomOrThrow(code);
    const turn = match.turns[match.currentIndex]!;
    const player = room.players.find((p) => p.id === turn.playerId)!;
    const question = this.currentQuestion(match);
    match.answered = false;

    const targetSocketIds = [screenRoomName(code), player.socketId];

    this.emit({
      type: 'trivia_turn_waiting',
      code,
      playerId: player.id,
      playerName: player.name,
      teamId: turn.teamId,
    });
    this.emit({
      type: 'trivia_turn_started',
      code,
      targetSocketIds,
      playerId: player.id,
      playerName: player.name,
      pregunta: question.pregunta,
      opciones: question.opciones,
      durationSeconds: TRIVIA_TURN_SECONDS,
    });

    const timer = new RoundTimer(
      (remainingSeconds) =>
        this.emit({ type: 'trivia_turn_update', code, targetSocketIds, remainingSeconds }),
      () => this.resolveTurn(code, null),
    );
    match.timer = timer;
    timer.start(TRIVIA_TURN_SECONDS);
  }

  private resolveTurn(code: string, opcionIndex: number | null): void {
    const match = this.matches.get(code);
    if (!match) return;

    const room = this.rooms.getRoomOrThrow(code);
    const turn = match.turns[match.currentIndex]!;
    const player = room.players.find((p) => p.id === turn.playerId)!;
    const question = this.currentQuestion(match);

    const correcta = opcionIndex !== null && opcionIndex === question.indiceCorrecto;
    const puntos = correcta ? TRIVIA_TURN_POINTS : 0;

    if (puntos > 0) {
      this.gameEngine.addScore(code, turn.teamId, puntos);
      match.matchScores.set(turn.teamId, (match.matchScores.get(turn.teamId) ?? 0) + puntos);
    }

    const resultado: TriviaTurnResult = {
      playerId: player.id,
      playerName: player.name,
      teamId: turn.teamId,
      opcionElegida: opcionIndex,
      correcta,
      puntos,
    };

    this.emit({
      type: 'trivia_turn_result',
      code,
      pregunta: question.pregunta,
      opciones: question.opciones,
      indiceCorrecto: question.indiceCorrecto,
      resultado,
    });

    match.timer = null;
    this.scheduler(() => this.advanceOrFinish(code), TURN_TRANSITION_DELAY_MS);
  }

  private advanceOrFinish(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;

    if (match.currentIndex + 1 < match.turns.length) {
      match.currentIndex++;
      this.startTurn(code);
    } else {
      this.finishMatch(code);
    }
  }

  private finishMatch(code: string): void {
    const match = this.matches.get(code)!;
    const room = this.rooms.getRoomOrThrow(code);
    room.status = 'resultados';
    room.round = null;

    // Puntos de ESTA partida, no el acumulado de team.score — ese se ve en
    // el panel de selección de juego.
    const scores: TeamScore[] = room.teams.map((team) => ({
      teamId: team.id,
      score: match.matchScores.get(team.id) ?? 0,
    }));

    this.matches.delete(code);
    this.emit({ type: 'room_state', code, room });
    this.emit({ type: 'trivia_match_result', code, scores });
    this.scheduleReturnToSelection(code);
  }

  // Deja la pantalla de resultados un rato antes de volver a la selección de
  // juego, para poder elegir otra partida sin recrear la sala. No resetea
  // team.score (el marcador se acumula entre partidas).
  private scheduleReturnToSelection(code: string): void {
    this.scheduler(() => {
      const room = this.rooms.getRoom(code);
      if (!room) return;
      room.currentGame = null;
      this.emit({ type: 'room_state', code, room });
    }, RESULTS_DISPLAY_MS);
  }

  private emit(event: TriviaEvent): void {
    this.eventsSubject.next(event);
  }
}
