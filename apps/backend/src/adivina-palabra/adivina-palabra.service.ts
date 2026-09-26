import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { RoomService } from '../room/room.service.js';
import { screenRoomName } from '../room/room.gateway.js';
import { GameEngineService } from '../game-engine/game-engine.service.js';
import { AiContentService } from '../ai-content/ai-content.service.js';
import { MAX_ADIVINA_WORDS_PER_REQUEST } from '../ai-content/adivina-palabra.types.js';
import { RoundTimer } from '../game-engine/round-timer.js';
import { distributeTurns, type TurnAssignment } from '../game-engine/turn-distribution.js';
import type { TeamScore } from '../game-engine/game-engine.types.js';
import type { AdivinaPalabraEvent, AdivinaTurnResult } from './adivina-palabra.types.js';

export class AdivinaMatchAlreadyRunningError extends Error {
  constructor(code: string) {
    super(`La sala ${code} ya tiene una partida de Adivina la palabra en curso`);
    this.name = 'AdivinaMatchAlreadyRunningError';
  }
}

export class NoAdivinaMatchError extends Error {
  constructor(code: string) {
    super(`La sala ${code} no tiene una partida de Adivina la palabra activa`);
    this.name = 'NoAdivinaMatchError';
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
    super(`El jugador ${playerId} ya presionó Listo en este turno`);
    this.name = 'TurnAlreadyStartedError';
  }
}

export class TurnNotStartedError extends Error {
  constructor(playerId: string) {
    super(`El jugador ${playerId} todavía no presionó Listo en este turno`);
    this.name = 'TurnNotStartedError';
  }
}

export class PassLimitReachedError extends Error {
  constructor(playerId: string) {
    super(`El jugador ${playerId} ya alcanzó el límite de pases en este turno`);
    this.name = 'PassLimitReachedError';
  }
}

export class NoWordAvailableError extends Error {
  constructor(code: string) {
    super(`La sala ${code} se quedó sin palabras disponibles en este turno`);
    this.name = 'NoWordAvailableError';
  }
}

interface RoomWordState {
  pool: string[];
  used: Set<string>;
}

interface AdivinaMatchState {
  turns: TurnAssignment[];
  currentIndex: number;
  queue: string[];
  currentWord: string | null;
  passCount: number;
  guessed: string[];
  passed: string[];
  remainingSeconds: number;
  matchScores: Map<string, number>;
  matchWords: Map<string, string[]>;
  timer: RoundTimer | null;
  phase: 'waiting_ready' | 'active';
}

const ROUNDS_PER_PLAYER = 3;
const ADIVINA_TURN_SECONDS = 30;
const MAX_PASSES_PER_TURN = 3;
// Base de dimensionamiento del pool: se pide de una sola vez para toda la
// partida (nunca durante un temporizador, constitution.md principio 5), no
// turno a turno como en Trivia/Gestos.
const WORDS_PER_TURN_ESTIMATE = 15;
const RESULTS_DISPLAY_MS = 10_000;
// Tope de llamadas sucesivas a la IA/banco para completar el pool de una
// partida — si tras esto sigue faltando, se arranca con lo que haya en vez de
// bloquear la partida indefinidamente (ver "Palabras agotadas a mitad de
// partida" en adivina-palabra-module/analysis.md).
const MAX_REFILL_ATTEMPTS = 3;

// Mismo patrón general que CarasYGestosService (turnos individuales,
// RoundTimer directo, mutación directa de room.status/room.currentGame), con
// dos diferencias de forma: 1) el pool de palabras es de TODA la partida, no
// por turno, y se pide una sola vez al arrancar; 2) no hay pausa de
// transición entre turnos — el siguiente Adivinador avanza presionando
// "Listo" cuando quiera, sin setTimeout de servidor. Ver
// specs/features/adivina-palabra-module/analysis.md.
@Injectable()
export class AdivinaPalabraService implements OnModuleDestroy {
  private readonly matches = new Map<string, AdivinaMatchState>();
  // Palabras de cada sala entre partidas — en memoria, se pierde si se
  // reinicia el backend. Sobrevive a cada partida individual (no se borra en
  // finishMatch), a diferencia de `matches`.
  private readonly roomWords = new Map<string, RoomWordState>();
  private readonly eventsSubject = new Subject<AdivinaPalabraEvent>();
  readonly events$: Observable<AdivinaPalabraEvent> = this.eventsSubject.asObservable();

  constructor(
    private readonly rooms: RoomService,
    private readonly gameEngine: GameEngineService,
    private readonly aiContent: AiContentService,
    @Optional() private readonly random: () => number = Math.random,
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

  async startMatch(code: string): Promise<void> {
    if (this.matches.has(code)) {
      throw new AdivinaMatchAlreadyRunningError(code);
    }

    const room = this.rooms.getRoomOrThrow(code);
    const turns = distributeTurns(room.teams, ROUNDS_PER_PLAYER, this.random);
    const wordsNeeded = WORDS_PER_TURN_ESTIMATE * turns.length;

    await this.ensureWordSupply(code, wordsNeeded);
    const queue = this.drawFromPool(code, wordsNeeded);

    room.status = 'jugando';
    this.matches.set(code, {
      turns,
      currentIndex: 0,
      queue,
      currentWord: null,
      passCount: 0,
      guessed: [],
      passed: [],
      remainingSeconds: ADIVINA_TURN_SECONDS,
      matchScores: new Map(room.teams.map((team) => [team.id, 0])),
      matchWords: new Map(room.teams.map((team) => [team.id, []])),
      timer: null,
      phase: 'waiting_ready',
    });

    this.emit({ type: 'room_state', code, room });
    this.emitTurnWaiting(code);
  }

  markReady(code: string, socketId: string): void {
    const match = this.matches.get(code);
    if (!match) {
      throw new NoAdivinaMatchError(code);
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
    if (match.phase !== 'waiting_ready') {
      throw new TurnAlreadyStartedError(player.id);
    }

    match.passCount = 0;
    match.guessed = [];
    match.passed = [];
    match.currentWord = match.queue.shift() ?? null;
    match.remainingSeconds = ADIVINA_TURN_SECONDS;
    match.phase = 'active';

    const timer = new RoundTimer(
      (remainingSeconds) => {
        match.remainingSeconds = remainingSeconds;
        this.emitStates(code, null);
      },
      () => this.resolveTurnEnd(code),
    );
    match.timer = timer;
    timer.start(ADIVINA_TURN_SECONDS);

    this.emitStates(code, null);
  }

  markGuessed(code: string, socketId: string): void {
    const match = this.matches.get(code);
    if (!match) {
      throw new NoAdivinaMatchError(code);
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
    if (match.phase !== 'active') {
      throw new TurnNotStartedError(player.id);
    }
    if (match.currentWord === null) {
      throw new NoWordAvailableError(code);
    }

    const palabra = match.currentWord;
    match.guessed.push(palabra);
    this.markUsed(code, palabra);
    match.currentWord = match.queue.shift() ?? null;

    this.emitStates(code, 'adivinada');
  }

  markPassed(code: string, socketId: string): void {
    const match = this.matches.get(code);
    if (!match) {
      throw new NoAdivinaMatchError(code);
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
    if (match.phase !== 'active') {
      throw new TurnNotStartedError(player.id);
    }
    if (match.currentWord === null) {
      throw new NoWordAvailableError(code);
    }
    if (match.passCount >= MAX_PASSES_PER_TURN) {
      throw new PassLimitReachedError(player.id);
    }

    const palabra = match.currentWord;
    match.passed.push(palabra);
    this.markUsed(code, palabra);
    match.passCount += 1;
    match.currentWord = match.queue.shift() ?? null;

    this.emitStates(code, 'paso');
  }

  private async ensureWordSupply(code: string, wordsNeeded: number): Promise<void> {
    const persistent = this.roomWords.get(code) ?? { pool: [], used: new Set<string>() };
    this.roomWords.set(code, persistent);

    for (
      let attempt = 0;
      attempt < MAX_REFILL_ATTEMPTS && persistent.pool.length < wordsNeeded;
      attempt++
    ) {
      const missing = wordsNeeded - persistent.pool.length;
      const cantidad = Math.min(missing, MAX_ADIVINA_WORDS_PER_REQUEST);
      const excluir = [...persistent.used, ...persistent.pool];
      const nuevas = await this.aiContent.getAdivinaPalabraWords(cantidad, excluir);
      if (nuevas.length === 0) break;
      persistent.pool.push(...nuevas);
    }
  }

  private drawFromPool(code: string, count: number): string[] {
    const persistent = this.roomWords.get(code);
    if (!persistent) return [];

    const drawn: string[] = [];
    for (let i = 0; i < count && persistent.pool.length > 0; i++) {
      const index = Math.floor(this.random() * persistent.pool.length);
      drawn.push(persistent.pool.splice(index, 1)[0]!);
    }
    return drawn;
  }

  private markUsed(code: string, palabra: string): void {
    const persistent = this.roomWords.get(code);
    persistent?.used.add(palabra);
  }

  private emitStates(code: string, ultimaAccion: 'adivinada' | 'paso' | null): void {
    const match = this.matches.get(code);
    if (!match) return;

    const room = this.rooms.getRoomOrThrow(code);
    const turn = match.turns[match.currentIndex]!;
    const player = room.players.find((p) => p.id === turn.playerId)!;
    const pasesRestantes = MAX_PASSES_PER_TURN - match.passCount;

    this.emit({
      type: 'adivina_pantalla_estado',
      code,
      targetSocketIds: [screenRoomName(code)],
      palabra: match.currentWord,
      remainingSeconds: match.remainingSeconds,
      pasesRestantes,
      ultimaAccion,
    });
    this.emit({
      type: 'adivina_jugador_estado',
      code,
      targetSocketIds: [player.socketId],
      remainingSeconds: match.remainingSeconds,
      pasesRestantes,
    });
  }

  private emitTurnWaiting(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;

    const room = this.rooms.getRoomOrThrow(code);
    const turn = match.turns[match.currentIndex]!;
    const player = room.players.find((p) => p.id === turn.playerId)!;
    const marcador: TeamScore[] = room.teams.map((team) => ({
      teamId: team.id,
      score: match.matchScores.get(team.id) ?? 0,
    }));

    this.emit({
      type: 'adivina_turn_waiting',
      code,
      playerId: player.id,
      playerName: player.name,
      teamId: turn.teamId,
      marcador,
    });
  }

  private resolveTurnEnd(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;

    match.timer?.stop();
    match.timer = null;

    const room = this.rooms.getRoomOrThrow(code);
    const turn = match.turns[match.currentIndex]!;
    const player = room.players.find((p) => p.id === turn.playerId)!;

    // Si quedó una palabra a medio mostrar sin resolver, cuenta como pasada
    // (roja) — pero no contra el límite de pases voluntarios del jugador.
    if (match.currentWord !== null) {
      match.passed.push(match.currentWord);
      this.markUsed(code, match.currentWord);
      match.currentWord = null;
    }

    const puntos = match.guessed.length;
    if (puntos > 0) {
      this.gameEngine.addScore(code, turn.teamId, puntos);
    }
    match.matchScores.set(turn.teamId, (match.matchScores.get(turn.teamId) ?? 0) + puntos);
    const previousWords = match.matchWords.get(turn.teamId) ?? [];
    match.matchWords.set(turn.teamId, [...previousWords, ...match.guessed]);

    const resultado: AdivinaTurnResult = {
      playerId: player.id,
      playerName: player.name,
      teamId: turn.teamId,
      adivinadas: match.guessed,
      pasadas: match.passed,
      puntos,
    };

    this.emit({ type: 'adivina_turn_result', code, resultado });

    if (match.currentIndex + 1 < match.turns.length) {
      match.currentIndex++;
      match.phase = 'waiting_ready';
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

    // Las palabras que quedaron en la cola de esta partida sin mostrarse
    // vuelven al pool persistente de la sala — no se descartan.
    const persistent = this.roomWords.get(code);
    persistent?.pool.push(...match.queue);

    const scores: TeamScore[] = room.teams.map((team) => ({
      teamId: team.id,
      score: match.matchScores.get(team.id) ?? 0,
    }));
    const palabrasPorEquipo = room.teams.map((team) => ({
      teamId: team.id,
      palabras: match.matchWords.get(team.id) ?? [],
    }));

    this.matches.delete(code);
    this.emit({ type: 'room_state', code, room });
    this.emit({ type: 'adivina_match_result', code, scores, palabrasPorEquipo });
    this.scheduleReturnToSelection(code);
  }

  // Deja la pantalla de resultados un rato antes de volver a la selección de
  // juego, para poder elegir otra partida sin recrear la sala. No resetea
  // team.score (acumulado entre partidas) ni el pool/used de la sala (siguen
  // vivos para la próxima partida de este juego en esta sala).
  private scheduleReturnToSelection(code: string): void {
    this.scheduler(() => {
      const room = this.rooms.getRoom(code);
      if (!room) return;
      room.currentGame = null;
      this.emit({ type: 'room_state', code, room });
    }, RESULTS_DISPLAY_MS);
  }

  private emit(event: AdivinaPalabraEvent): void {
    this.eventsSubject.next(event);
  }
}
