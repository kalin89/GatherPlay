import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { RoomService } from '../room/room.service.js';
import { screenRoomName } from '../room/room.gateway.js';
import { GameEngineService } from '../game-engine/game-engine.service.js';
import { AiContentService } from '../ai-content/ai-content.service.js';
import { MAX_GESTURE_WORDS_PER_REQUEST } from '../ai-content/gestos.types.js';
import { RoundTimer } from '../game-engine/round-timer.js';
import { distributeTurns, type TurnAssignment } from '../game-engine/turn-distribution.js';
import type { TeamScore } from '../game-engine/game-engine.types.js';
import type { CarasYGestosEvent, GestoTurnResult } from './caras-y-gestos.types.js';

export class GestosMatchAlreadyRunningError extends Error {
  constructor(code: string) {
    super(`La sala ${code} ya tiene una partida de Caras y Gestos en curso`);
    this.name = 'GestosMatchAlreadyRunningError';
  }
}

export class NoGestosMatchError extends Error {
  constructor(code: string) {
    super(`La sala ${code} no tiene una partida de Caras y Gestos activa`);
    this.name = 'NoGestosMatchError';
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

export class TurnAlreadyStartedError extends Error {
  constructor(playerId: string) {
    super(`El jugador ${playerId} ya presionó Iniciar en este turno`);
    this.name = 'TurnAlreadyStartedError';
  }
}

export class TurnNotStartedError extends Error {
  constructor(playerId: string) {
    super(`El jugador ${playerId} todavía no presionó Iniciar en este turno`);
    this.name = 'TurnNotStartedError';
  }
}

interface GestosMatchState {
  turns: TurnAssignment[];
  currentIndex: number;
  wordPool: string[];
  turnWords: string[] | null;
  // Palabras adivinadas en el turno en curso — se resetea en cada startTurn,
  // a diferencia de guessedByTeam que acumula toda la partida (ver
  // GestoTurnResult, que solo lleva lo de ESTE turno).
  turnGuessed: string[];
  phase: 'waiting' | 'active';
  timer: RoundTimer | null;
  guessedByTeam: Map<string, string[]>;
  // Puntos ganados en ESTA partida (para el resultado final) — distinto de
  // team.score, que es el acumulado de por vida.
  matchScores: Map<string, number>;
}

const ROUNDS_PER_PLAYER = 3;
const WORDS_PER_TURN = 5;
const TURN_SECONDS = 60;
const WORD_POINT = 1;
const TURN_TRANSITION_DELAY_MS = 2500;
const RESULTS_DISPLAY_MS = 10_000;
// Si la partida necesita más (grupos grandes con muchas rondas), se completa
// reciclando palabras ya obtenidas para esta partida — nunca pidiendo de más
// a la IA sin límite. Mismo tipo de compromiso que MAX_TRIVIA_QUESTIONS_PER_MATCH.
const MAX_WORDS_PER_MATCH = 100;
// Tope de lotes al armar el pool de palabras — si el banco de respaldo está
// muy agotado, completa reciclando antes que bloquear la partida.
const MAX_BATCH_ATTEMPTS = 4;
// Tope de cuántas palabras ya usadas se le mandan a la IA como lista de
// exclusión — mismo criterio que MAX_TRACKED_QUESTIONS_PER_ROOM en Trivia,
// para que una sala de vida muy larga no arme un prompt enorme.
const MAX_TRACKED_WORDS_PER_ROOM = 150;

// Mismo patrón general que TriviaService (turnos individuales, RoundTimer
// directo, mutación directa de room.status/room.currentGame) con una
// diferencia de forma: acá el turno tiene una fase previa ("waiting") donde
// el jugador debe presionar "Iniciar" antes de que arranque el temporizador
// — ver specs/features/caras-y-gestos-module/analysis.md.
@Injectable()
export class CarasYGestosService implements OnModuleDestroy {
  private readonly matches = new Map<string, GestosMatchState>();
  // Palabras ya usadas en cada sala, entre partidas — en memoria, se pierde
  // si se reinicia el backend. Sobrevive a cada partida individual (no se
  // borra en finishMatch), a diferencia de `matches`.
  private readonly usedWords = new Map<string, Set<string>>();
  private readonly eventsSubject = new Subject<CarasYGestosEvent>();
  readonly events$: Observable<CarasYGestosEvent> = this.eventsSubject.asObservable();

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
      throw new GestosMatchAlreadyRunningError(code);
    }

    const room = this.rooms.getRoomOrThrow(code);
    const turns = distributeTurns(room.teams, ROUNDS_PER_PLAYER);

    room.status = 'jugando';
    this.matches.set(code, {
      turns,
      currentIndex: 0,
      wordPool: [],
      turnWords: null,
      turnGuessed: [],
      phase: 'waiting',
      timer: null,
      guessedByTeam: new Map(room.teams.map((team) => [team.id, []])),
      matchScores: new Map(room.teams.map((team) => [team.id, 0])),
    });

    this.emit({ type: 'room_state', code, room });
    void this.loadWordPoolAndStartFirstTurn(code, turns.length);
  }

  startTurn(code: string, socketId: string): void {
    const match = this.matches.get(code);
    if (!match) {
      throw new NoGestosMatchError(code);
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
    if (match.phase !== 'waiting') {
      throw new TurnAlreadyStartedError(player.id);
    }

    const start = match.currentIndex * WORDS_PER_TURN;
    const words: string[] = [];
    for (let i = 0; i < WORDS_PER_TURN; i++) {
      words.push(match.wordPool[(start + i) % match.wordPool.length]!);
    }

    match.turnWords = words;
    match.turnGuessed = [];
    match.phase = 'active';

    const targetSocketIds = [screenRoomName(code)];
    const timer = new RoundTimer(
      (remainingSeconds) =>
        this.emit({ type: 'gestos_turn_tick', code, targetSocketIds, remainingSeconds }),
      () => this.resolveTurn(code, 'tiempo'),
    );
    match.timer = timer;
    timer.start(TURN_SECONDS);

    this.emit({
      type: 'gestos_turn_started',
      code,
      targetSocketIds,
      playerId: player.id,
      playerName: player.name,
      palabra: words[0]!,
      durationSeconds: TURN_SECONDS,
      palabrasRestantes: words.length,
    });
    this.emit({ type: 'gestos_actor_ready', code, targetSocketId: player.socketId });
  }

  markWord(code: string, socketId: string, resultado: 'adivinada' | 'paso'): void {
    const match = this.matches.get(code);
    if (!match) {
      throw new NoGestosMatchError(code);
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
    if (match.phase !== 'active' || match.turnWords === null) {
      throw new TurnNotStartedError(player.id);
    }

    const turnWords = match.turnWords;
    const palabra = turnWords[0]!;

    if (resultado === 'adivinada') {
      turnWords.shift();
      match.turnGuessed.push(palabra);
      const guessed = match.guessedByTeam.get(turn.teamId) ?? [];
      guessed.push(palabra);
      match.guessedByTeam.set(turn.teamId, guessed);
      match.matchScores.set(turn.teamId, (match.matchScores.get(turn.teamId) ?? 0) + WORD_POINT);
      this.gameEngine.addScore(code, turn.teamId, WORD_POINT);
    } else {
      turnWords.push(turnWords.shift()!);
    }

    if (turnWords.length === 0) {
      this.resolveTurn(code, 'completado');
      return;
    }

    this.emit({
      type: 'gestos_word_update',
      code,
      targetSocketIds: [screenRoomName(code)],
      palabra: turnWords[0]!,
      palabrasRestantes: turnWords.length,
      motivo: resultado,
    });
  }

  private async loadWordPoolAndStartFirstTurn(code: string, totalTurns: number): Promise<void> {
    const match = this.matches.get(code);
    if (!match) return;

    const totalWordsNeeded = Math.min(totalTurns * WORDS_PER_TURN, MAX_WORDS_PER_MATCH);
    const usedSoFar = this.usedWords.get(code) ?? new Set<string>();
    const pool: string[] = [];

    for (let attempt = 0; attempt < MAX_BATCH_ATTEMPTS && pool.length < totalWordsNeeded; attempt++) {
      const excluir = [...usedSoFar, ...pool];
      const cantidad = Math.min(totalWordsNeeded - pool.length, MAX_GESTURE_WORDS_PER_REQUEST);
      const palabras = await this.aiContent.getGestureWords(cantidad, excluir);
      pool.push(...palabras);
    }

    if (pool.length < totalWordsNeeded && pool.length > 0) {
      const originalLength = pool.length;
      for (let i = 0; pool.length < totalWordsNeeded; i++) {
        pool.push(pool[i % originalLength]!);
      }
    }

    match.wordPool = pool;

    const updatedUsed = new Set(usedSoFar);
    for (const palabra of pool) updatedUsed.add(palabra);
    this.usedWords.set(code, this.capUsedWords(updatedUsed));

    this.emitTurnWaiting(code);
  }

  private capUsedWords(words: Set<string>): Set<string> {
    if (words.size <= MAX_TRACKED_WORDS_PER_ROOM) return words;
    return new Set([...words].slice(-MAX_TRACKED_WORDS_PER_ROOM));
  }

  private emitTurnWaiting(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;

    const room = this.rooms.getRoomOrThrow(code);
    const turn = match.turns[match.currentIndex]!;
    const player = room.players.find((p) => p.id === turn.playerId)!;

    this.emit({
      type: 'gestos_turn_waiting',
      code,
      playerId: player.id,
      playerName: player.name,
      teamId: turn.teamId,
    });
  }

  private resolveTurn(code: string, motivo: 'completado' | 'tiempo'): void {
    const match = this.matches.get(code);
    if (!match) return;

    match.timer?.stop();
    match.timer = null;

    const room = this.rooms.getRoomOrThrow(code);
    const turn = match.turns[match.currentIndex]!;
    const player = room.players.find((p) => p.id === turn.playerId)!;

    const resultado: GestoTurnResult = {
      playerId: player.id,
      playerName: player.name,
      teamId: turn.teamId,
      palabrasAdivinadas: match.turnGuessed,
      puntos: match.turnGuessed.length * WORD_POINT,
      motivo,
    };

    match.turnWords = null;

    this.emit({ type: 'gestos_turn_result', code, resultado });

    this.scheduler(() => this.advanceOrFinish(code), TURN_TRANSITION_DELAY_MS);
  }

  private advanceOrFinish(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;

    if (match.currentIndex + 1 < match.turns.length) {
      match.currentIndex++;
      match.phase = 'waiting';
      this.emitTurnWaiting(code);
    } else {
      this.finishMatch(code);
    }
  }

  private finishMatch(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;

    const room = this.rooms.getRoomOrThrow(code);
    room.status = 'resultados';
    room.round = null;

    const scores: TeamScore[] = room.teams.map((team) => ({
      teamId: team.id,
      score: match.matchScores.get(team.id) ?? 0,
    }));
    const palabrasPorEquipo: Record<string, string[]> = {};
    for (const team of room.teams) {
      palabrasPorEquipo[team.id] = match.guessedByTeam.get(team.id) ?? [];
    }

    this.matches.delete(code);
    this.emit({ type: 'room_state', code, room });
    this.emit({ type: 'gestos_match_result', code, scores, palabrasPorEquipo });
    this.scheduleReturnToSelection(code);
  }

  // Deja la pantalla de resultados un rato antes de volver a la selección de
  // juego, para poder elegir otra partida sin recrear la sala. No resetea
  // team.score (el marcador se acumula entre partidas) ni usedWords (las
  // palabras ya usadas siguen excluidas mientras la sala exista).
  private scheduleReturnToSelection(code: string): void {
    this.scheduler(() => {
      const room = this.rooms.getRoom(code);
      if (!room) return;
      room.currentGame = null;
      this.emit({ type: 'room_state', code, room });
    }, RESULTS_DISPLAY_MS);
  }

  private emit(event: CarasYGestosEvent): void {
    this.eventsSubject.next(event);
  }
}
