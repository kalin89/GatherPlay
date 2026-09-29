import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { RoomService } from '../room/room.service.js';
import type { RoomScopedState } from '../room/room-scoped-state.js';
import { GameEngineService } from '../game-engine/game-engine.service.js';
import { NotEnoughTeamsError } from '../game-engine/turn-distribution.js';
import { ReadyGate } from '../game-engine/ready-gate.js';
import { RoundTimer } from '../game-engine/round-timer.js';
import { MemorizaObjetosContentService } from '../memoriza-objetos-content/memoriza-objetos-content.service.js';
import { OBJECTS_PER_MATCH } from '../memoriza-objetos-content/memoriza-objetos-content.types.js';
import type { TeamScore } from '../game-engine/game-engine.types.js';
import {
  ATTENTION_SECONDS,
  MEMORIZE_SECONDS,
  PASS_UNLOCK_SECONDS,
  RESULTS_DISPLAY_MS,
  TEAM_CLOCK_SECONDS,
  type MemorizaBoardItem,
  type MemorizaBoardItemPublic,
  type MemorizaObjetosEvent,
  type MemorizaTeamClock,
} from './memoriza-objetos.types.js';
import { isFuzzyMatch } from '../la-rocola/answer-matcher.js';

export class MemorizaMatchAlreadyRunningError extends Error {
  constructor(code: string) {
    super(`La sala ${code} ya tiene una partida de Memoriza los objetos en curso`);
    this.name = 'MemorizaMatchAlreadyRunningError';
  }
}

export class NoMemorizaMatchError extends Error {
  constructor(code: string) {
    super(`La sala ${code} no tiene una partida de Memoriza los objetos activa`);
    this.name = 'NoMemorizaMatchError';
  }
}

export class PlayerNotInRoomError extends Error {
  constructor(socketId: string) {
    super(`No hay un jugador de esta sala conectado con el socket ${socketId}`);
    this.name = 'PlayerNotInRoomError';
  }
}

export class MatchAlreadyStartedError extends Error {
  constructor(code: string) {
    super(`La partida de Memoriza los objetos en la sala ${code} ya arrancó`);
    this.name = 'MatchAlreadyStartedError';
  }
}

export class NotYourTurnError extends Error {
  constructor(playerId: string) {
    super(`No es el turno del jugador ${playerId}`);
    this.name = 'NotYourTurnError';
  }
}

export class EmptyGuessError extends Error {
  constructor(playerId: string) {
    super(`El jugador ${playerId} intentó enviar una palabra vacía`);
    this.name = 'EmptyGuessError';
  }
}

export class PassNotAvailableYetError extends Error {
  constructor(playerId: string) {
    super(`El jugador ${playerId} todavía no puede pasar en este turno`);
    this.name = 'PassNotAvailableYetError';
  }
}

type MemorizaPhase = 'waiting_ready' | 'pon_atencion' | 'memorizando' | 'adivinando';

interface MemorizaMatchState {
  items: MemorizaBoardItem[];
  teamMembers: Map<string, string[]>;
  turnCursor: Map<string, number>;
  clocks: Map<string, number>;
  eliminated: Set<string>;
  activeTeamId: string | null;
  activePlayerId: string | null;
  turnStartRemaining: number;
  // Se incrementa una sola vez por turno, en `startTurn` — a diferencia de
  // `activeTeamId`/`activePlayerId`, cambia incluso cuando el mismo equipo
  // (y el mismo jugador, si juega solo) repite turno porque el otro equipo
  // se quedó sin tiempo ("sin alternar"). Es lo que le permite al cliente
  // distinguir un turno nuevo de uno que sigue, para resetear el formulario
  // de respuesta — ver GuessForm en play-memoriza-objetos.tsx.
  turnNumber: number;
  matchScores: Map<string, number>;
  matchWords: Map<string, string[]>;
  readyGate: ReadyGate;
  timer: RoundTimer | null;
  phase: MemorizaPhase;
}

function pickLetraIndex(palabra: string, random: () => number): number {
  const length = palabra.length;
  const choice = Math.floor(random() * 3); // 0 = inicio, 1 = medio, 2 = fin
  if (choice === 0) return 0;
  if (choice === 2) return length - 1;
  return Math.floor((length - 1) / 2);
}

function buildPista(palabra: string, letraIndex: number): string {
  return palabra
    .split('')
    .map((char, i) => (i === letraIndex ? char.toUpperCase() : '_'))
    .join(' ');
}

// Mismo patrón general que AdivinaPalabraService/LaRocolaService (RoundTimer
// directo, mutación directa de room.status/room.currentGame), con una
// diferencia estructural propia de este juego: el reloj de cada equipo no se
// reinicia turno a turno, sino que se retoma desde donde quedó — cada turno
// crea un RoundTimer nuevo (mismo criterio de "una instancia por transición,
// nunca se reusa") pero lo arranca con `clocks.get(activeTeamId)`, el tiempo
// que le quedaba a ese equipo, no siempre TEAM_CLOCK_SECONDS. Ver
// specs/features/memoriza-objetos-module/analysis.md.
@Injectable()
export class MemorizaObjetosService implements OnModuleDestroy, RoomScopedState {
  private readonly matches = new Map<string, MemorizaMatchState>();
  // Objetos ya mostrados por sala — sobrevive entre partidas, mismo límite ya
  // documentado de "no hay limpieza de salas todavía".
  private readonly roomUsedObjects = new Map<string, Set<string>>();
  private readonly eventsSubject = new Subject<MemorizaObjetosEvent>();
  readonly events$: Observable<MemorizaObjetosEvent> = this.eventsSubject.asObservable();

  constructor(
    private readonly rooms: RoomService,
    private readonly gameEngine: GameEngineService,
    private readonly content: MemorizaObjetosContentService,
    @Optional() private readonly random: () => number = Math.random,
    @Optional()
    private readonly scheduler: (callback: () => void, ms: number) => void = (callback, ms) => {
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
    this.roomUsedObjects.delete(code);
  }

  onModuleDestroy(): void {
    for (const match of this.matches.values()) {
      match.timer?.stop();
    }
    this.matches.clear();
  }

  startMatch(code: string): void {
    if (this.matches.has(code)) {
      throw new MemorizaMatchAlreadyRunningError(code);
    }

    const room = this.rooms.getRoomOrThrow(code);
    const participating = room.teams.filter((t) => t.playerIds.length > 0);
    if (participating.length < 2) {
      throw new NotEnoughTeamsError();
    }

    const used = this.roomUsedObjects.get(code) ?? new Set<string>();
    const objects = this.content.selectObjects(OBJECTS_PER_MATCH, [...used]);
    objects.forEach((o) => used.add(o.id));
    this.roomUsedObjects.set(code, used);

    const items: MemorizaBoardItem[] = objects.map((o) => ({
      id: o.id,
      palabra: o.palabra,
      imagenUrl: o.imagenUrl,
      letraIndex: pickLetraIndex(o.palabra, this.random),
      estado: 'oculta',
      equipoQueAcerto: null,
    }));

    const eligiblePlayerIds = participating.flatMap((t) => t.playerIds);
    room.status = 'jugando';
    this.matches.set(code, {
      items,
      teamMembers: new Map(participating.map((t) => [t.id, [...t.playerIds]])),
      turnCursor: new Map(participating.map((t) => [t.id, 0])),
      clocks: new Map(participating.map((t) => [t.id, TEAM_CLOCK_SECONDS])),
      eliminated: new Set(),
      activeTeamId: null,
      activePlayerId: null,
      turnStartRemaining: 0,
      turnNumber: 0,
      matchScores: new Map(participating.map((t) => [t.id, 0])),
      matchWords: new Map(participating.map((t) => [t.id, []])),
      readyGate: new ReadyGate(eligiblePlayerIds),
      timer: null,
      phase: 'waiting_ready',
    });

    this.emit({ type: 'room_state', code, room });
    this.emitWaitingReady(code);
  }

  markReady(code: string, socketId: string): void {
    const match = this.matches.get(code);
    if (!match) {
      throw new NoMemorizaMatchError(code);
    }
    if (match.phase !== 'waiting_ready') {
      throw new MatchAlreadyStartedError(code);
    }

    const room = this.rooms.getRoomOrThrow(code);
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) {
      throw new PlayerNotInRoomError(socketId);
    }

    match.readyGate.markReady(player.id);
    this.emitWaitingReady(code);

    if (match.readyGate.isSatisfied) {
      this.beginAttentionPhase(code);
    }
  }

  submitGuess(code: string, socketId: string, texto: string): void {
    const match = this.matches.get(code);
    if (!match) {
      throw new NoMemorizaMatchError(code);
    }

    const room = this.rooms.getRoomOrThrow(code);
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) {
      throw new PlayerNotInRoomError(socketId);
    }
    if (match.phase !== 'adivinando' || player.id !== match.activePlayerId) {
      throw new NotYourTurnError(player.id);
    }
    if (texto.trim().length === 0) {
      throw new EmptyGuessError(player.id);
    }

    const activeTeamId = match.activeTeamId!;
    const hit = match.items.find(
      (item) => item.estado === 'oculta' && isFuzzyMatch(texto, item.palabra),
    );

    if (hit) {
      hit.estado = 'revelada';
      hit.equipoQueAcerto = activeTeamId;
      this.gameEngine.addScore(code, activeTeamId, 1);
      match.matchScores.set(activeTeamId, (match.matchScores.get(activeTeamId) ?? 0) + 1);
      const words = match.matchWords.get(activeTeamId) ?? [];
      match.matchWords.set(activeTeamId, [...words, hit.palabra]);
      this.emit({
        type: 'memoriza_intento_resultado',
        code,
        teamId: activeTeamId,
        acierto: true,
        palabra: hit.palabra,
      });
    } else {
      this.emit({
        type: 'memoriza_intento_resultado',
        code,
        teamId: activeTeamId,
        acierto: false,
        palabra: null,
      });
    }

    this.resolveTurnEnd(code);
  }

  passTurn(code: string, socketId: string): void {
    const match = this.matches.get(code);
    if (!match) {
      throw new NoMemorizaMatchError(code);
    }

    const room = this.rooms.getRoomOrThrow(code);
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) {
      throw new PlayerNotInRoomError(socketId);
    }
    if (match.phase !== 'adivinando' || player.id !== match.activePlayerId) {
      throw new NotYourTurnError(player.id);
    }

    const remainingSeconds = match.clocks.get(match.activeTeamId!)!;
    if (match.turnStartRemaining - remainingSeconds < PASS_UNLOCK_SECONDS) {
      throw new PassNotAvailableYetError(player.id);
    }

    // Mismo evento que un intento fallido (acierto: false, sin palabra) —
    // "Pasar" también suena como un error en la pantalla, no queda mudo.
    this.emit({
      type: 'memoriza_intento_resultado',
      code,
      teamId: match.activeTeamId!,
      acierto: false,
      palabra: null,
    });

    this.resolveTurnEnd(code);
  }

  private beginAttentionPhase(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;

    match.phase = 'pon_atencion';
    const timer = new RoundTimer(
      (remainingSeconds) => {
        this.emit({ type: 'memoriza_pon_atencion', code, remainingSeconds });
      },
      () => this.beginMemorizePhase(code),
    );
    match.timer = timer;
    timer.start(ATTENTION_SECONDS);
    this.emit({ type: 'memoriza_pon_atencion', code, remainingSeconds: ATTENTION_SECONDS });
  }

  private beginMemorizePhase(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;

    match.phase = 'memorizando';
    const publicItems = match.items.map((i) => ({ id: i.id, imagenUrl: i.imagenUrl }));

    const timer = new RoundTimer(
      (remainingSeconds) => {
        this.emit({ type: 'memoriza_memorizando', code, items: publicItems, remainingSeconds });
      },
      () => this.beginGuessingPhase(code),
    );
    match.timer = timer;
    timer.start(MEMORIZE_SECONDS);
    this.emit({
      type: 'memoriza_memorizando',
      code,
      items: publicItems,
      remainingSeconds: MEMORIZE_SECONDS,
    });
  }

  private beginGuessingPhase(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;

    match.phase = 'adivinando';
    const teamIds = [...match.teamMembers.keys()];
    match.activeTeamId = teamIds[Math.floor(this.random() * teamIds.length)]!;
    this.startTurn(code);
  }

  private startTurn(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;

    const activeTeamId = match.activeTeamId!;
    const members = match.teamMembers.get(activeTeamId)!;
    const cursor = match.turnCursor.get(activeTeamId)!;
    match.activePlayerId = members[cursor]!;
    match.turnCursor.set(activeTeamId, (cursor + 1) % members.length);
    match.turnStartRemaining = match.clocks.get(activeTeamId)!;
    match.turnNumber += 1;

    const timer = new RoundTimer(
      (remainingSeconds) => {
        match.clocks.set(activeTeamId, remainingSeconds);
        if (remainingSeconds <= 0) {
          match.eliminated.add(activeTeamId);
        }
        this.emitTablero(code);
        this.emitTurnoJugador(code);
      },
      () => this.resolveTurnEnd(code),
    );
    match.timer = timer;
    timer.start(match.turnStartRemaining);

    this.emitTablero(code);
    this.emitTurnoJugador(code);
  }

  private resolveTurnEnd(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;

    match.timer?.stop();
    match.timer = null;

    if (match.items.every((item) => item.estado === 'revelada')) {
      this.finishMatch(code);
      return;
    }

    const previousTeamId = match.activeTeamId!;
    const otherTeamIds = [...match.teamMembers.keys()].filter((id) => id !== previousTeamId);
    const nextOther = otherTeamIds.find((id) => !match.eliminated.has(id));

    if (nextOther) {
      match.activeTeamId = nextOther;
    } else if (match.eliminated.has(previousTeamId)) {
      // El equipo que acaba de jugar también está eliminado y no queda
      // ningún otro con tiempo — ambos relojes llegaron a cero.
      this.finishMatch(code);
      return;
    }
    // Si no hay otro equipo con tiempo pero `previousTeamId` sigue con
    // tiempo, `activeTeamId` no cambia: sigue jugando solo, sin alternar
    // (caso límite documentado en spec.md).

    this.startTurn(code);
  }

  private finishMatch(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;

    const room = this.rooms.getRoomOrThrow(code);
    room.status = 'resultados';
    room.round = null;

    // Las que quedaron sin adivinar se revelan igual al terminar la
    // partida (sin acreditarle el punto a ningún equipo,
    // `equipoQueAcerto` se queda en null) — para que ambos equipos vean
    // cuáles eran.
    for (const item of match.items) {
      if (item.estado === 'oculta') {
        item.estado = 'revelada';
      }
    }

    const scores: TeamScore[] = [...match.matchScores.entries()].map(([teamId, score]) => ({
      teamId,
      score,
    }));
    const palabrasPorEquipo = [...match.matchWords.entries()].map(([teamId, palabras]) => ({
      teamId,
      palabras,
    }));
    const items = this.toPublicItems(match.items);

    this.matches.delete(code);
    this.emit({ type: 'room_state', code, room });
    this.emit({ type: 'memoriza_match_result', code, scores, palabrasPorEquipo, items });
    this.scheduleReturnToSelection(code);
  }

  private scheduleReturnToSelection(code: string): void {
    this.scheduler(() => {
      const room = this.rooms.getRoom(code);
      if (!room) return;
      room.currentGame = null;
      this.emit({ type: 'room_state', code, room });
    }, RESULTS_DISPLAY_MS);
  }

  private emitWaitingReady(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;
    this.emit({
      type: 'memoriza_waiting_ready',
      code,
      readyPlayerIds: match.readyGate.readyPlayerIds,
      eligiblePlayerIds: match.readyGate.eligiblePlayerIds,
      items: match.items.map((i) => ({ id: i.id, imagenUrl: i.imagenUrl })),
    });
  }

  private toPublicItems(items: MemorizaBoardItem[]): MemorizaBoardItemPublic[] {
    return items.map((item) => ({
      id: item.id,
      imagenUrl: item.imagenUrl,
      pista: buildPista(item.palabra, item.letraIndex),
      estado: item.estado,
      equipoQueAcerto: item.equipoQueAcerto,
      palabra: item.estado === 'revelada' ? item.palabra : null,
    }));
  }

  private emitTablero(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;
    const room = this.rooms.getRoomOrThrow(code);

    const items = this.toPublicItems(match.items);
    const clocks: MemorizaTeamClock[] = [...match.clocks.entries()].map(
      ([teamId, remainingSeconds]) => ({ teamId, remainingSeconds }),
    );
    const jugadorActivo =
      match.activePlayerId && match.activeTeamId
        ? {
            teamId: match.activeTeamId,
            playerId: match.activePlayerId,
            playerName: room.players.find((p) => p.id === match.activePlayerId)?.name ?? '',
          }
        : null;

    this.emit({
      type: 'memoriza_tablero',
      code,
      items,
      clocks,
      equipoActivoId: match.activeTeamId,
      jugadorActivo,
      turnNumber: match.turnNumber,
    });
  }

  private emitTurnoJugador(code: string): void {
    const match = this.matches.get(code);
    if (!match || !match.activePlayerId || !match.activeTeamId) return;
    const room = this.rooms.getRoomOrThrow(code);
    const player = room.players.find((p) => p.id === match.activePlayerId);
    if (!player) return;

    const remainingSeconds = match.clocks.get(match.activeTeamId)!;
    const puedePasar = match.turnStartRemaining - remainingSeconds >= PASS_UNLOCK_SECONDS;

    this.emit({
      type: 'memoriza_turno_jugador',
      code,
      targetSocketIds: [player.socketId],
      remainingSeconds,
      puedePasar,
    });
  }

  private emit(event: MemorizaObjetosEvent): void {
    this.eventsSubject.next(event);
  }
}
