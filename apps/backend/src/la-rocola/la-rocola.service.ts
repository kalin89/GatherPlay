import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { RoomService } from '../room/room.service.js';
import { screenRoomName } from '../room/room.gateway.js';
import { GameEngineService } from '../game-engine/game-engine.service.js';
import { NotEnoughTeamsError } from '../game-engine/turn-distribution.js';
import { ReadyGate } from '../game-engine/ready-gate.js';
import { RoundTimer } from '../game-engine/round-timer.js';
import { RocolaContentService } from '../rocola-content/rocola-content.service.js';
import type { RocolaFiltro, RocolaSong } from '../rocola-content/rocola-content.types.js';
import type { TeamScore } from '../game-engine/game-engine.types.js';
import type { LaRocolaEvent, RocolaRoundResult } from './la-rocola.types.js';
import { isFuzzyMatch } from './answer-matcher.js';

export class RocolaMatchAlreadyRunningError extends Error {
  constructor(code: string) {
    super(`La sala ${code} ya tiene una partida de La Rocola en curso`);
    this.name = 'RocolaMatchAlreadyRunningError';
  }
}

export class NoRocolaMatchError extends Error {
  constructor(code: string) {
    super(`La sala ${code} no tiene una partida de La Rocola activa`);
    this.name = 'NoRocolaMatchError';
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
    super(`La partida de La Rocola en la sala ${code} ya arrancó`);
    this.name = 'MatchAlreadyStartedError';
  }
}

export class BuzzerNotOpenError extends Error {
  constructor(code: string) {
    super(`El buzzer no está habilitado en la sala ${code} en este momento`);
    this.name = 'BuzzerNotOpenError';
  }
}

export class NotEligibleToBuzzError extends Error {
  constructor(playerId: string) {
    super(`El jugador ${playerId} no puede presionar el buzzer en este robo de punto`);
    this.name = 'NotEligibleToBuzzError';
  }
}

export class NotYourAnswerError extends Error {
  constructor(playerId: string) {
    super(`El jugador ${playerId} no es quien ganó el buzzer en esta ronda`);
    this.name = 'NotYourAnswerError';
  }
}

export class InsufficientFilteredSongsError extends Error {
  constructor(
    readonly filtro: RocolaFiltro,
    readonly disponibles: number,
  ) {
    const criterio = filtro.tipo === 'genero' ? filtro.genero : filtro.artista;
    super(
      `El filtro "${criterio}" tiene solo ${disponibles} canciones disponibles (hacen falta ${TOTAL_ROUNDS})`,
    );
    this.name = 'InsufficientFilteredSongsError';
  }
}

type RocolaPhase =
  | 'waiting_ready'
  | 'countdown'
  | 'sonando'
  | 'respondiendo'
  | 'robo'
  | 'robo_respondiendo'
  | 'revelacion';

interface RocolaMatchState {
  readyGate: ReadyGate;
  filtro: RocolaFiltro | null;
  songs: RocolaSong[];
  currentIndex: number;
  phase: RocolaPhase;
  timer: RoundTimer | null;
  buzzedPlayerId: string | null;
  buzzedTeamId: string | null;
  failedTeamId: string | null;
  eligibleTeamIds: string[] | null;
  matchScores: Map<string, number>;
  resultados: RocolaRoundResult[];
}

export const TOTAL_ROUNDS = 10;
export const COUNTDOWN_SECONDS = 5;
export const SONG_SECONDS = 30;
export const ANSWER_SECONDS = 30;
export const ROBO_SECONDS = 5;
export const REVEAL_DISPLAY_MS = 4_000;
export const RESULTS_DISPLAY_MS = 10_000;

// Mismo patrón general que AdivinaPalabraService/CarasYGestosService
// (RoundTimer directo, mutación directa de room.status/room.currentGame),
// con una diferencia estructural: acá no hay reparto de turnos — es buzzer
// libre entre todos los jugadores conectados, y arranca con la convención
// de "instrucciones + Listo de todos" (ver
// specs/features/la-rocola-module/analysis.md).
@Injectable()
export class LaRocolaService implements OnModuleDestroy {
  private readonly matches = new Map<string, RocolaMatchState>();
  // Canciones ya sonadas por sala — sobrevive entre partidas, mismo límite
  // ya documentado de "no hay limpieza de salas todavía".
  private readonly roomUsedSongs = new Map<string, Set<string>>();
  private readonly eventsSubject = new Subject<LaRocolaEvent>();
  readonly events$: Observable<LaRocolaEvent> = this.eventsSubject.asObservable();

  constructor(
    private readonly rooms: RoomService,
    private readonly gameEngine: GameEngineService,
    private readonly content: RocolaContentService,
    @Optional()
    private readonly scheduler: (callback: () => void, ms: number) => void = (callback, ms) => {
      setTimeout(callback, ms);
    },
  ) {}

  onModuleDestroy(): void {
    for (const match of this.matches.values()) {
      match.timer?.stop();
    }
    this.matches.clear();
  }

  startMatch(code: string, filtro?: RocolaFiltro): void {
    if (this.matches.has(code)) {
      throw new RocolaMatchAlreadyRunningError(code);
    }

    const room = this.rooms.getRoomOrThrow(code);
    const participating = room.teams.filter((t) => t.playerIds.length > 0);
    if (participating.length < 2) {
      throw new NotEnoughTeamsError();
    }

    if (filtro) {
      const disponibles = this.content.countAvailable(filtro);
      if (disponibles < TOTAL_ROUNDS) {
        throw new InsufficientFilteredSongsError(filtro, disponibles);
      }
    }

    const eligiblePlayerIds = participating.flatMap((t) => t.playerIds);
    room.status = 'jugando';
    this.matches.set(code, {
      readyGate: new ReadyGate(eligiblePlayerIds),
      filtro: filtro ?? null,
      songs: [],
      currentIndex: 0,
      phase: 'waiting_ready',
      timer: null,
      buzzedPlayerId: null,
      buzzedTeamId: null,
      failedTeamId: null,
      eligibleTeamIds: null,
      matchScores: new Map(participating.map((t) => [t.id, 0])),
      resultados: [],
    });

    this.emit({ type: 'room_state', code, room });
    this.emitReadyState(code);
  }

  async markReady(code: string, socketId: string): Promise<void> {
    const match = this.matches.get(code);
    if (!match) {
      throw new NoRocolaMatchError(code);
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
    this.emitReadyState(code);

    if (match.readyGate.isSatisfied) {
      await this.beginContent(code);
    }
  }

  handleBuzz(code: string, socketId: string): void {
    const match = this.matches.get(code);
    if (!match) {
      throw new NoRocolaMatchError(code);
    }
    if (match.phase !== 'sonando' && match.phase !== 'robo') {
      throw new BuzzerNotOpenError(code);
    }

    const room = this.rooms.getRoomOrThrow(code);
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) {
      throw new PlayerNotInRoomError(socketId);
    }
    const team = room.teams.find((t) => t.playerIds.includes(player.id));
    if (!team) {
      throw new PlayerNotInRoomError(socketId);
    }

    if (match.phase === 'robo' && !match.eligibleTeamIds?.includes(team.id)) {
      throw new NotEligibleToBuzzError(player.id);
    }

    match.timer?.stop();
    match.buzzedPlayerId = player.id;
    match.buzzedTeamId = team.id;
    match.phase = match.phase === 'robo' ? 'robo_respondiendo' : 'respondiendo';

    this.emit({
      type: 'rocola_audio_control',
      code,
      targetSocketIds: [screenRoomName(code)],
      action: 'pause',
    });
    this.emit({
      type: 'rocola_buzzer_locked',
      code,
      playerId: player.id,
      playerName: player.name,
      teamId: team.id,
    });

    // 30 segundos para escribir la respuesta — si no llega
    // `rocola_submit_answer` antes, se juzga como si hubiera escrito nada
    // (mismo criterio que "no la escribe" en spec.md).
    const timer = new RoundTimer(
      (remainingSeconds) => {
        this.emit({ type: 'rocola_answer_tick', code, remainingSeconds });
      },
      () => this.handleSubmitAnswer(code, socketId, ''),
    );
    match.timer = timer;
    timer.start(ANSWER_SECONDS);
  }

  handleSubmitAnswer(code: string, socketId: string, texto: string): void {
    const match = this.matches.get(code);
    if (!match) {
      throw new NoRocolaMatchError(code);
    }
    if (match.phase !== 'respondiendo' && match.phase !== 'robo_respondiendo') {
      // El propio timeout interno reintenta llamar a este método — si ya se
      // resolvió (por un submit real llegado un instante antes), no hace
      // nada, en vez de fallar.
      return;
    }

    const room = this.rooms.getRoomOrThrow(code);
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player || player.id !== match.buzzedPlayerId) {
      throw new NotYourAnswerError(player?.id ?? socketId);
    }

    match.timer?.stop();
    match.timer = null;

    const song = match.songs[match.currentIndex]!;
    const acierto = isFuzzyMatch(texto, song.titulo);

    if (acierto) {
      this.gameEngine.addScore(code, match.buzzedTeamId!, 1);
      match.matchScores.set(
        match.buzzedTeamId!,
        (match.matchScores.get(match.buzzedTeamId!) ?? 0) + 1,
      );
      this.resolveRound(code, {
        teamId: match.buzzedTeamId,
        playerId: player.id,
        playerName: player.name,
        puntos: 1,
        respuesta: texto,
      });
      return;
    }

    if (match.phase === 'respondiendo') {
      const participating = room.teams.filter((t) => t.playerIds.length > 0);
      match.failedTeamId = match.buzzedTeamId;
      match.eligibleTeamIds = participating
        .filter((t) => t.id !== match.failedTeamId)
        .map((t) => t.id);
      match.buzzedPlayerId = null;
      match.buzzedTeamId = null;
      match.phase = 'robo';

      this.emit({
        type: 'rocola_audio_control',
        code,
        targetSocketIds: [screenRoomName(code)],
        action: 'resume',
      });
      const eligibleTeamNames = match.eligibleTeamIds.map(
        (id) => room.teams.find((t) => t.id === id)?.name ?? id,
      );
      this.emit({
        type: 'rocola_robo_started',
        code,
        eligibleTeamIds: match.eligibleTeamIds,
        eligibleTeamNames,
        remainingSeconds: ROBO_SECONDS,
      });

      const roboTimer = new RoundTimer(
        () => {},
        () => this.resolveEmptyRound(code),
      );
      match.timer = roboTimer;
      roboTimer.start(ROBO_SECONDS);
      return;
    }

    // phase === 'robo_respondiendo': también falló el robo, se acabó el turno.
    this.resolveRound(code, {
      teamId: null,
      playerId: player.id,
      playerName: player.name,
      puntos: 0,
      respuesta: texto,
    });
  }

  getAvailableArtists(): string[] {
    return this.content.getAvailableArtists();
  }

  private async beginContent(code: string): Promise<void> {
    const match = this.matches.get(code);
    if (!match) return;

    const used = this.roomUsedSongs.get(code) ?? new Set<string>();
    const songs = await this.content.selectSongs(
      TOTAL_ROUNDS,
      [...used],
      match.filtro ?? undefined,
    );
    songs.forEach((s) => used.add(s.id));
    this.roomUsedSongs.set(code, used);

    match.songs = songs;
    this.startRound(code);
  }

  private startRound(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;

    match.phase = 'countdown';
    match.buzzedPlayerId = null;
    match.buzzedTeamId = null;
    match.failedTeamId = null;
    match.eligibleTeamIds = null;

    const marcador = this.currentMarcador(code);
    this.emit({
      type: 'rocola_round_started',
      code,
      roundNumber: match.currentIndex + 1,
      totalRounds: TOTAL_ROUNDS,
      marcador,
    });

    const timer = new RoundTimer(
      (remainingSeconds) => {
        if (remainingSeconds > 0) {
          this.emit({ type: 'rocola_countdown_tick', code, remainingSeconds });
        }
      },
      () => this.beginSonando(code),
    );
    match.timer = timer;
    timer.start(COUNTDOWN_SECONDS);
  }

  private beginSonando(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;

    match.phase = 'sonando';
    const song = match.songs[match.currentIndex]!;

    this.emit({
      type: 'rocola_audio_control',
      code,
      targetSocketIds: [screenRoomName(code)],
      action: 'play',
      previewUrl: song.previewUrl,
    });
    this.emit({ type: 'rocola_buzzer_open', code, eligibleTeamIds: null });

    const timer = new RoundTimer(
      () => {},
      () => this.resolveEmptyRound(code),
    );
    match.timer = timer;
    timer.start(SONG_SECONDS);
  }

  // Nadie presionó el buzzer (canción completa o robo agotado) — mismo
  // resultado vacío en ambos casos (spec.md).
  private resolveEmptyRound(code: string): void {
    this.resolveRound(code, {
      teamId: null,
      playerId: null,
      playerName: null,
      puntos: 0,
      respuesta: '',
    });
  }

  private resolveRound(
    code: string,
    parcial: {
      teamId: string | null;
      playerId: string | null;
      playerName: string | null;
      puntos: 0 | 1;
      respuesta: string;
    },
  ): void {
    const match = this.matches.get(code);
    if (!match) return;

    match.timer?.stop();
    match.timer = null;

    const song = match.songs[match.currentIndex]!;
    const resultado: RocolaRoundResult = {
      songId: song.id,
      titulo: song.titulo,
      artista: song.artista,
      portadaUrl: song.portadaUrl,
      ...parcial,
    };
    match.resultados.push(resultado);
    match.phase = 'revelacion';

    this.emit({ type: 'rocola_round_result', code, resultado });
    this.scheduler(() => this.advanceRound(code), REVEAL_DISPLAY_MS);
  }

  private advanceRound(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;

    match.currentIndex += 1;
    if (match.currentIndex < TOTAL_ROUNDS) {
      this.startRound(code);
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

    const scores = this.currentMarcador(code);
    const canciones = match.resultados.map((r) => ({
      titulo: r.titulo,
      artista: r.artista,
      teamId: r.teamId,
    }));

    this.matches.delete(code);
    this.emit({ type: 'room_state', code, room });
    this.emit({ type: 'rocola_match_result', code, scores, canciones });
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

  private currentMarcador(code: string): TeamScore[] {
    const match = this.matches.get(code);
    if (!match) return [];
    const room = this.rooms.getRoomOrThrow(code);
    return room.teams
      .filter((t) => match.matchScores.has(t.id))
      .map((t) => ({ teamId: t.id, score: match.matchScores.get(t.id)! }));
  }

  private emitReadyState(code: string): void {
    const match = this.matches.get(code);
    if (!match) return;
    this.emit({
      type: 'rocola_ready_state',
      code,
      readyPlayerIds: match.readyGate.readyPlayerIds,
      eligiblePlayerIds: match.readyGate.eligiblePlayerIds,
    });
  }

  private emit(event: LaRocolaEvent): void {
    this.eventsSubject.next(event);
  }
}
