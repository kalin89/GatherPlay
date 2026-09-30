import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { RoomService } from '../room/room.service.js';
import type { GameSnapshotEvent, RoomScopedState } from '../room/room-scoped-state.js';
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
  // Nombre del jugador del turno en curso: el jugador puede vencer su gracia y
  // salir de `room.players` durante el turno, y el resultado/snapshot no debe
  // depender de encontrarlo.
  currentPlayerName: string;
  // Resultado del turno ya resuelto, mientras dura la pausa antes del
  // siguiente; null durante un turno en curso.
  lastTurnResult: TriviaTurnResultPayload | null;
}

type TriviaTurnResultPayload = Omit<
  Extract<TriviaEvent, { type: 'trivia_turn_result' }>,
  'type'
>;

const DEFAULT_CATEGORY = 'general';
const ROUNDS_PER_PLAYER = 3;
const TRIVIA_TURN_POINTS = 1;
const TRIVIA_TURN_SECONDS = 15;
const TURN_TRANSITION_DELAY_MS = 2500;
const RESULTS_DISPLAY_MS = 10_000;
// Por debajo del MAX_QUESTIONS de AiContentService, sin acoplar ambos módulos —
// red de seguridad para no pedirle a la IA más de lo que puede dar en un lote.
const MAX_TRIVIA_QUESTIONS_PER_MATCH = 40;
// Tope de cuántas preguntas ya usadas se le mandan a la IA como lista de
// exclusión — para que una sala de vida muy larga no arme un prompt enorme.
const MAX_TRACKED_QUESTIONS_PER_ROOM = 150;

// Rediseño a turnos individuales — ver specs/features/trivia-module/analysis.md
// para por qué esto usa RoundTimer directamente en vez de
// GameEngineService.startRound/endRound (una partida son N turnos, no una
// ronda), y solo reusa gameEngine.addScore.
@Injectable()
export class TriviaService implements OnModuleDestroy, RoomScopedState {
  private readonly matches = new Map<string, TriviaMatchState>();
  // Preguntas ya usadas en cada sala, entre partidas — en memoria, se pierde
  // si se reinicia el backend (la memoria persistente entre reinicios es la
  // tarea de Fase 4 de `content_banks` en Postgres, todavía no hecha).
  private readonly askedQuestions = new Map<string, string[]>();
  // Marcador final de la partida que acaba de terminar, mientras dura la
  // pantalla de resultados (para quien reconecta en ese lapso).
  private readonly finishedScores = new Map<string, TeamScore[]>();
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
  ) {
    rooms.registerRoomScoped(this);
  }

  // Libera todo el estado de la sala cuando `RoomService.closeRoom` la cierra:
  // detiene el temporizador de la partida en curso y borra tanto la partida
  // como el acumulador por sala. Idempotente.
  disposeRoom(code: string): void {
    this.matches.get(code)?.timer?.stop();
    this.matches.delete(code);
    this.askedQuestions.delete(code);
    this.finishedScores.delete(code);
  }

  // Lo que necesita ver un jugador que reconecta. La pregunta con opciones solo
  // va al jugador en turno (igual que en `startTurn`); el resto recibe lo
  // mismo que ve cualquiera.
  snapshotFor(code: string, playerId: string): GameSnapshotEvent[] {
    const match = this.matches.get(code);
    if (!match) {
      const scores = this.finishedScores.get(code);
      return scores
        ? [{ event: 'trivia_match_result', payload: { code, scores } }]
        : [];
    }
    if (match.questions.length === 0) {
      return [];
    }

    const turn = match.turns[match.currentIndex]!;
    if (match.lastTurnResult) {
      return [{ event: 'trivia_turn_result', payload: match.lastTurnResult }];
    }

    const events: GameSnapshotEvent[] = [
      {
        event: 'trivia_turn_waiting',
        payload: {
          code,
          playerId: turn.playerId,
          playerName: match.currentPlayerName,
          teamId: turn.teamId,
        },
      },
    ];
    if (turn.playerId === playerId && match.timer) {
      const question = this.currentQuestion(match);
      events.push(
        {
          event: 'trivia_turn_started',
          payload: {
            code,
            playerId: turn.playerId,
            playerName: match.currentPlayerName,
            pregunta: question.pregunta,
            opciones: question.opciones,
            durationSeconds: TRIVIA_TURN_SECONDS,
          },
        },
        {
          event: 'trivia_turn_update',
          payload: { code, remainingSeconds: match.timer.remainingSeconds },
        },
      );
    }
    return events;
  }

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
      currentPlayerName: '',
      lastTurnResult: null,
    });
    this.finishedScores.delete(code);

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

    const excluir = this.askedQuestions.get(code) ?? [];
    const preguntas = await this.aiContent.getTriviaQuestions(DEFAULT_CATEGORY, count, excluir);
    // La sala pudo cerrarse mientras se esperaba a la IA: no resucitar estado.
    if (this.matches.get(code) !== match) return;
    match.questions = preguntas.map((p) => ({
      pregunta: p.pregunta,
      opciones: p.opciones,
      indiceCorrecto: p.indiceCorrecto,
    }));

    const actualizadas = [...excluir, ...preguntas.map((p) => p.pregunta)].slice(
      -MAX_TRACKED_QUESTIONS_PER_ROOM,
    );
    this.askedQuestions.set(code, actualizadas);

    this.startTurn(code);
  }

  private currentQuestion(match: TriviaMatchState): TriviaQuestionState {
    return match.questions[match.currentIndex % match.questions.length]!;
  }

  private startTurn(code: string): void {
    const match = this.matches.get(code)!;
    const room = this.rooms.getRoomOrThrow(code);
    const turn = match.turns[match.currentIndex]!;
    const player = room.players.find((p) => p.id === turn.playerId);
    // Pudo vencer su gracia entre turnos: se salta su turno.
    if (!player) {
      this.advanceOrFinish(code);
      return;
    }
    const question = this.currentQuestion(match);
    match.answered = false;
    match.currentPlayerName = player.name;
    match.lastTurnResult = null;

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
      targetSocketIds: this.turnTargets(code, player.id),
      playerId: player.id,
      playerName: player.name,
      pregunta: question.pregunta,
      opciones: question.opciones,
      durationSeconds: TRIVIA_TURN_SECONDS,
    });

    const timer = new RoundTimer(
      (remainingSeconds) =>
        // El socket del jugador se busca en cada tick: si reconectó, cambió.
        this.emit({
          type: 'trivia_turn_update',
          code,
          targetSocketIds: this.turnTargets(code, player.id),
          remainingSeconds,
        }),
      () => this.resolveTurn(code, null),
    );
    match.timer = timer;
    timer.start(TRIVIA_TURN_SECONDS);
  }

  private resolveTurn(code: string, opcionIndex: number | null): void {
    const match = this.matches.get(code);
    if (!match) return;

    const turn = match.turns[match.currentIndex]!;
    const question = this.currentQuestion(match);

    const correcta = opcionIndex !== null && opcionIndex === question.indiceCorrecto;
    const puntos = correcta ? TRIVIA_TURN_POINTS : 0;

    if (puntos > 0) {
      this.gameEngine.addScore(code, turn.teamId, puntos);
      match.matchScores.set(turn.teamId, (match.matchScores.get(turn.teamId) ?? 0) + puntos);
    }

    const resultado: TriviaTurnResult = {
      playerId: turn.playerId,
      playerName: match.currentPlayerName,
      teamId: turn.teamId,
      opcionElegida: opcionIndex,
      correcta,
      puntos,
    };

    const turnResult = {
      code,
      pregunta: question.pregunta,
      opciones: question.opciones,
      indiceCorrecto: question.indiceCorrecto,
      resultado,
    };
    match.lastTurnResult = turnResult;
    this.emit({ type: 'trivia_turn_result', ...turnResult });

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
    this.finishedScores.set(code, scores);
    this.emit({ type: 'room_state', code, room });
    this.emit({ type: 'trivia_match_result', code, scores });
    this.scheduleReturnToSelection(code);
  }

  // Deja la pantalla de resultados un rato antes de volver a la selección de
  // juego, para poder elegir otra partida sin recrear la sala. No resetea
  // team.score (el marcador se acumula entre partidas).
  private scheduleReturnToSelection(code: string): void {
    this.scheduler(() => {
      this.finishedScores.delete(code);
      const room = this.rooms.getRoom(code);
      if (!room) return;
      room.currentGame = null;
      this.emit({ type: 'room_state', code, room });
    }, RESULTS_DISPLAY_MS);
  }

  private turnTargets(code: string, playerId: string): string[] {
    const socketId = this.rooms
      .getRoom(code)
      ?.players.find((p) => p.id === playerId)?.socketId;
    return socketId ? [screenRoomName(code), socketId] : [screenRoomName(code)];
  }

  private emit(event: TriviaEvent): void {
    this.eventsSubject.next(event);
  }
}
