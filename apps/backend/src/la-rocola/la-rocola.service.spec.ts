import { vi } from 'vitest';
import { RoomService } from '../room/room.service.js';
import type { RoomState } from '../room/room.types.js';
import { GameEngineService } from '../game-engine/game-engine.service.js';
import { NotEnoughTeamsError } from '../game-engine/turn-distribution.js';
import { RocolaContentService } from '../rocola-content/rocola-content.service.js';
import type { RocolaBankEntry } from '../rocola-content/rocola-content.types.js';
import type { SongPreviewProvider } from '../rocola-content/song-preview-provider.js';
import {
  BuzzerNotOpenError,
  InsufficientFilteredSongsError,
  LaRocolaService,
  MatchAlreadyStartedError,
  NoRocolaMatchError,
  NotEligibleToBuzzError,
  NotYourAnswerError,
  RocolaMatchAlreadyRunningError,
  ANSWER_SECONDS,
  COUNTDOWN_SECONDS,
  SONG_SECONDS,
  ROBO_SECONDS,
  REVEAL_DISPLAY_MS,
  RESULTS_DISPLAY_MS,
  TOTAL_ROUNDS,
} from './la-rocola.service.js';
import type { LaRocolaEvent } from './la-rocola.types.js';

// Mismo título para todas las canciones del banco de prueba — así se puede
// enviar una respuesta "correcta" determinística sin necesitar saber cuál de
// las canciones tocó al azar en cada ronda.
const CORRECT_ANSWER = 'Cancion Correcta';
const WRONG_ANSWER = 'Una Respuesta Totalmente Distinta';

function makeBank(count: number): RocolaBankEntry[] {
  const generos = [
    'cumbia',
    'merengue',
    'salsa',
    'balada',
    'ranchera',
    'pop',
    'rock',
    'popular',
  ] as const;
  return Array.from({ length: count }, (_, i) => ({
    id: `song-${i}`,
    titulo: CORRECT_ANSWER,
    artista: `Artista ${i}`,
    genero: generos[i % generos.length],
    itunesTrackId: 1000 + i,
  }));
}

function alwaysAvailableProvider(): SongPreviewProvider {
  return {
    lookup: vi.fn(async (trackIds: number[]) => {
      const map = new Map<number, { previewUrl: string; portadaUrl: string }>();
      for (const id of trackIds) {
        map.set(id, { previewUrl: `https://preview/${id}`, portadaUrl: `https://art/${id}` });
      }
      return map;
    }),
  };
}

interface RoomSetup {
  room: RoomState;
  teamA: { teamId: string; playerId: string; socketId: string; playerToken: string };
  teamB: { teamId: string; playerId: string; socketId: string; playerToken: string };
}

function createRoomWithTwoSoloTeams(rooms: RoomService): RoomSetup {
  const room = rooms.createRoom();
  const joinedA = rooms.joinRoom(room.code, 'Ana', 'socket-a');
  const joinedB = rooms.joinRoom(room.code, 'Beto', 'socket-b');
  const withTeamA = rooms.createTeam(room.code, 'Rojos', '#FF0000');
  const withTeamB = rooms.createTeam(room.code, 'Azules', '#0000FF');
  const playerAId = joinedA.player.id;
  const playerBId = joinedB.player.id;
  const teamAId = withTeamA.teams[0]!.id;
  const teamBId = withTeamB.teams[1]!.id;
  rooms.assignPlayerToTeam(room.code, playerAId, teamAId);
  rooms.assignPlayerToTeam(room.code, playerBId, teamBId);
  return {
    room,
    teamA: {
      teamId: teamAId,
      playerId: playerAId,
      socketId: 'socket-a',
      playerToken: joinedA.playerToken,
    },
    teamB: {
      teamId: teamBId,
      playerId: playerBId,
      socketId: 'socket-b',
      playerToken: joinedB.playerToken,
    },
  };
}

function eventsOfType<T extends LaRocolaEvent['type']>(
  events: LaRocolaEvent[],
  type: T,
): Extract<LaRocolaEvent, { type: T }>[] {
  return events.filter((e): e is Extract<LaRocolaEvent, { type: T }> => e.type === type);
}

describe('LaRocolaService', () => {
  let rooms: RoomService;
  let gameEngine: GameEngineService;

  beforeEach(() => {
    vi.useFakeTimers();
    rooms = new RoomService();
    gameEngine = new GameEngineService(rooms);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createLaRocola(bankSize = 40): LaRocolaService {
    const content = new RocolaContentService(
      alwaysAvailableProvider(),
      Math.random,
      makeBank(bankSize),
      [],
    );
    return new LaRocolaService(rooms, gameEngine, content);
  }

  function createLaRocolaWithContent(
    content: RocolaContentService,
  ): LaRocolaService {
    return new LaRocolaService(rooms, gameEngine, content);
  }

  async function readyBoth(
    laRocola: LaRocolaService,
    setup: RoomSetup,
  ): Promise<void> {
    await laRocola.markReady(setup.room.code, setup.teamA.socketId);
    await laRocola.markReady(setup.room.code, setup.teamB.socketId);
  }

  it('lanza NotEnoughTeamsError si menos de 2 equipos tienen jugadores', () => {
    const room = rooms.createRoom();
    rooms.joinRoom(room.code, 'Ana', 'socket-a');
    const withTeam = rooms.createTeam(room.code, 'Rojos', '#FF0000');
    rooms.assignPlayerToTeam(room.code, room.players[0]!.id, withTeam.teams[0]!.id);
    const laRocola = createLaRocola();

    expect(() => laRocola.startMatch(room.code)).toThrow(NotEnoughTeamsError);
  });

  it('lanza RocolaMatchAlreadyRunningError si ya hay una partida en curso', () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    laRocola.startMatch(setup.room.code);

    expect(() => laRocola.startMatch(setup.room.code)).toThrow(RocolaMatchAlreadyRunningError);
  });

  it('arranca en waiting_ready, sin pedir canciones hasta que todos presionan Listo', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    const events: LaRocolaEvent[] = [];
    laRocola.events$.subscribe((e) => events.push(e));

    laRocola.startMatch(setup.room.code);
    expect(rooms.getRoom(setup.room.code)!.status).toBe('jugando');
    expect(eventsOfType(events, 'rocola_ready_state')).toHaveLength(1);
    expect(eventsOfType(events, 'rocola_round_started')).toHaveLength(0);

    await laRocola.markReady(setup.room.code, setup.teamA.socketId);
    expect(eventsOfType(events, 'rocola_round_started')).toHaveLength(0);

    await laRocola.markReady(setup.room.code, setup.teamB.socketId);
    expect(eventsOfType(events, 'rocola_round_started')).toHaveLength(1);
  });

  it('markReady dos veces (ya arrancó) lanza MatchAlreadyStartedError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    laRocola.startMatch(setup.room.code);
    await readyBoth(laRocola, setup);

    await expect(laRocola.markReady(setup.room.code, setup.teamA.socketId)).rejects.toThrow(
      MatchAlreadyStartedError,
    );
  });

  it('el conteo de 5s termina abriendo el buzzer y mandando play al audio de la pantalla', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    const events: LaRocolaEvent[] = [];
    laRocola.events$.subscribe((e) => events.push(e));

    laRocola.startMatch(setup.room.code);
    await readyBoth(laRocola, setup);

    await vi.advanceTimersByTimeAsync(COUNTDOWN_SECONDS * 1000);

    expect(eventsOfType(events, 'rocola_countdown_tick')).toHaveLength(COUNTDOWN_SECONDS - 1);
    const plays = eventsOfType(events, 'rocola_audio_control').filter((e) => e.action === 'play');
    expect(plays).toHaveLength(1);
    expect(plays[0]!.targetSocketIds).toEqual([`${setup.room.code}:screen`]);
    expect(plays[0]!.previewUrl).toBeTruthy();
    expect(eventsOfType(events, 'rocola_buzzer_open')).toHaveLength(1);
  });

  async function startAndReachSonando(laRocola: LaRocolaService, setup: RoomSetup) {
    laRocola.startMatch(setup.room.code);
    await readyBoth(laRocola, setup);
    await vi.advanceTimersByTimeAsync(COUNTDOWN_SECONDS * 1000);
  }

  it('handleBuzz fuera de sonando/robo lanza BuzzerNotOpenError', () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    laRocola.startMatch(setup.room.code);

    expect(() => laRocola.handleBuzz(setup.room.code, setup.teamA.socketId)).toThrow(
      BuzzerNotOpenError,
    );
  });

  it('handleBuzz pausa el audio, bloquea a los demás y arranca los 30s para escribir', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    const events: LaRocolaEvent[] = [];
    laRocola.events$.subscribe((e) => events.push(e));
    await startAndReachSonando(laRocola, setup);

    laRocola.handleBuzz(setup.room.code, setup.teamA.socketId);

    const pauses = eventsOfType(events, 'rocola_audio_control').filter((e) => e.action === 'pause');
    expect(pauses).toHaveLength(1);
    const locked = eventsOfType(events, 'rocola_buzzer_locked');
    expect(locked).toHaveLength(1);
    expect(locked[0]!.playerId).toBe(setup.teamA.playerId);

    await vi.advanceTimersByTimeAsync(ANSWER_SECONDS * 1000 - 1000);
    expect(eventsOfType(events, 'rocola_answer_tick').length).toBeGreaterThan(0);
  });

  it('solo el jugador que ganó el buzzer puede enviar la respuesta', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    await startAndReachSonando(laRocola, setup);
    laRocola.handleBuzz(setup.room.code, setup.teamA.socketId);

    expect(() =>
      laRocola.handleSubmitAnswer(setup.room.code, setup.teamB.socketId, CORRECT_ANSWER),
    ).toThrow(NotYourAnswerError);
  });

  it('si el jugador reconecta (cambia su socketId) mientras escribe, el timeout de respuesta igual se juzga', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    const events: LaRocolaEvent[] = [];
    laRocola.events$.subscribe((e) => events.push(e));
    await startAndReachSonando(laRocola, setup);
    laRocola.handleBuzz(setup.room.code, setup.teamA.socketId);

    rooms.rejoinRoom(setup.room.code, setup.teamA.playerToken, 'socket-a-nuevo');

    await vi.advanceTimersByTimeAsync(ANSWER_SECONDS * 1000);

    expect(eventsOfType(events, 'rocola_robo_started')).toHaveLength(1);
  });

  it('enviar una respuesta sin ninguna ronda de escritura pendiente no hace nada', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    const events: LaRocolaEvent[] = [];
    laRocola.events$.subscribe((e) => events.push(e));
    await startAndReachSonando(laRocola, setup);

    laRocola.handleSubmitAnswer(setup.room.code, setup.teamA.socketId, CORRECT_ANSWER);

    expect(eventsOfType(events, 'rocola_round_result')).toHaveLength(0);
  });

  it('una respuesta correcta suma 1 punto, termina la ronda y revela lo que se escribió', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    const events: LaRocolaEvent[] = [];
    laRocola.events$.subscribe((e) => events.push(e));
    await startAndReachSonando(laRocola, setup);

    laRocola.handleBuzz(setup.room.code, setup.teamA.socketId);
    laRocola.handleSubmitAnswer(setup.room.code, setup.teamA.socketId, CORRECT_ANSWER);

    expect(rooms.getRoom(setup.room.code)!.teams.find((t) => t.id === setup.teamA.teamId)!.score).toBe(
      1,
    );
    const results = eventsOfType(events, 'rocola_round_result');
    expect(results).toHaveLength(1);
    expect(results[0]!.resultado).toMatchObject({
      teamId: setup.teamA.teamId,
      puntos: 1,
      respuesta: CORRECT_ANSWER,
    });

    // A los REVEAL_DISPLAY_MS arranca la ronda 2 (nuevo conteo).
    await vi.advanceTimersByTimeAsync(REVEAL_DISPLAY_MS);
    expect(eventsOfType(events, 'rocola_round_started')).toHaveLength(2);
  });

  it('tolera errores de tipeo en la respuesta (fuzzy match real, no exacto)', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    const events: LaRocolaEvent[] = [];
    laRocola.events$.subscribe((e) => events.push(e));
    await startAndReachSonando(laRocola, setup);

    laRocola.handleBuzz(setup.room.code, setup.teamA.socketId);
    // "Correcto" en vez de "Correcta" — un solo carácter distinto.
    laRocola.handleSubmitAnswer(setup.room.code, setup.teamA.socketId, 'Cancion Correcto');

    const results = eventsOfType(events, 'rocola_round_result');
    expect(results[0]!.resultado.puntos).toBe(1);
  });

  it('una respuesta incorrecta arranca el robo de punto para los equipos rivales', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    const events: LaRocolaEvent[] = [];
    laRocola.events$.subscribe((e) => events.push(e));
    await startAndReachSonando(laRocola, setup);

    laRocola.handleBuzz(setup.room.code, setup.teamA.socketId);
    laRocola.handleSubmitAnswer(setup.room.code, setup.teamA.socketId, WRONG_ANSWER);

    const resumes = eventsOfType(events, 'rocola_audio_control').filter((e) => e.action === 'resume');
    expect(resumes).toHaveLength(1);
    const robo = eventsOfType(events, 'rocola_robo_started');
    expect(robo).toHaveLength(1);
    expect(robo[0]!.eligibleTeamIds).toEqual([setup.teamB.teamId]);

    // El equipo que falló no puede robar.
    expect(() => laRocola.handleBuzz(setup.room.code, setup.teamA.socketId)).toThrow(
      NotEligibleToBuzzError,
    );

    laRocola.handleBuzz(setup.room.code, setup.teamB.socketId);
    laRocola.handleSubmitAnswer(setup.room.code, setup.teamB.socketId, CORRECT_ANSWER);

    expect(rooms.getRoom(setup.room.code)!.teams.find((t) => t.id === setup.teamB.teamId)!.score).toBe(
      1,
    );
  });

  it('robo también fallido termina la ronda sin puntos para nadie, pero guarda la respuesta escrita', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    const events: LaRocolaEvent[] = [];
    laRocola.events$.subscribe((e) => events.push(e));
    await startAndReachSonando(laRocola, setup);

    laRocola.handleBuzz(setup.room.code, setup.teamA.socketId);
    laRocola.handleSubmitAnswer(setup.room.code, setup.teamA.socketId, WRONG_ANSWER);
    laRocola.handleBuzz(setup.room.code, setup.teamB.socketId);
    laRocola.handleSubmitAnswer(setup.room.code, setup.teamB.socketId, WRONG_ANSWER);

    const results = eventsOfType(events, 'rocola_round_result');
    expect(results[0]!.resultado).toMatchObject({
      teamId: null,
      puntos: 0,
      respuesta: WRONG_ANSWER,
    });
  });

  it('no envía nada antes de que se acaben los 30s: se juzga como respuesta vacía y arranca el robo', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    const events: LaRocolaEvent[] = [];
    laRocola.events$.subscribe((e) => events.push(e));
    await startAndReachSonando(laRocola, setup);

    laRocola.handleBuzz(setup.room.code, setup.teamA.socketId);
    await vi.advanceTimersByTimeAsync(ANSWER_SECONDS * 1000);

    const robo = eventsOfType(events, 'rocola_robo_started');
    expect(robo).toHaveLength(1);
  });

  it('un submit real que llega justo cuando se cumplen los 30s no duplica la resolución', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    const events: LaRocolaEvent[] = [];
    laRocola.events$.subscribe((e) => events.push(e));
    await startAndReachSonando(laRocola, setup);

    laRocola.handleBuzz(setup.room.code, setup.teamA.socketId);
    laRocola.handleSubmitAnswer(setup.room.code, setup.teamA.socketId, CORRECT_ANSWER);
    // El timeout interno de 30s no debería resolver de nuevo la misma ronda.
    await vi.advanceTimersByTimeAsync(ANSWER_SECONDS * 1000);

    expect(eventsOfType(events, 'rocola_round_result')).toHaveLength(1);
  });

  it('nadie presiona en toda la canción: ronda termina sin puntos', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    const events: LaRocolaEvent[] = [];
    laRocola.events$.subscribe((e) => events.push(e));
    await startAndReachSonando(laRocola, setup);

    await vi.advanceTimersByTimeAsync(SONG_SECONDS * 1000);

    const results = eventsOfType(events, 'rocola_round_result');
    expect(results).toHaveLength(1);
    expect(results[0]!.resultado).toMatchObject({ teamId: null, puntos: 0, respuesta: '' });
  });

  it('nadie presiona durante el robo: ronda termina sin puntos', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola();
    const events: LaRocolaEvent[] = [];
    laRocola.events$.subscribe((e) => events.push(e));
    await startAndReachSonando(laRocola, setup);

    laRocola.handleBuzz(setup.room.code, setup.teamA.socketId);
    laRocola.handleSubmitAnswer(setup.room.code, setup.teamA.socketId, WRONG_ANSWER);
    await vi.advanceTimersByTimeAsync(ROBO_SECONDS * 1000);

    const results = eventsOfType(events, 'rocola_round_result');
    expect(results[0]!.resultado).toMatchObject({ teamId: null, puntos: 0 });
  });

  it('con 3 equipos, el robo lista a los dos equipos rivales', async () => {
    const room = rooms.createRoom();
    const withA = rooms.joinRoom(room.code, 'Ana', 'socket-a').room;
    const withB = rooms.joinRoom(room.code, 'Beto', 'socket-b').room;
    const withC = rooms.joinRoom(room.code, 'Cami', 'socket-c').room;
    const withTeamA = rooms.createTeam(room.code, 'Rojos', '#FF0000');
    const withTeamB = rooms.createTeam(room.code, 'Azules', '#0000FF');
    const withTeamC = rooms.createTeam(room.code, 'Verdes', '#00FF00');
    const playerAId = withA.players[0]!.id;
    const playerBId = withB.players[1]!.id;
    const playerCId = withC.players[2]!.id;
    const teamAId = withTeamA.teams[0]!.id;
    const teamBId = withTeamB.teams[1]!.id;
    const teamCId = withTeamC.teams[2]!.id;
    rooms.assignPlayerToTeam(room.code, playerAId, teamAId);
    rooms.assignPlayerToTeam(room.code, playerBId, teamBId);
    rooms.assignPlayerToTeam(room.code, playerCId, teamCId);

    const laRocola = createLaRocola();
    const events: LaRocolaEvent[] = [];
    laRocola.events$.subscribe((e) => events.push(e));

    laRocola.startMatch(room.code);
    await laRocola.markReady(room.code, 'socket-a');
    await laRocola.markReady(room.code, 'socket-b');
    await laRocola.markReady(room.code, 'socket-c');
    await vi.advanceTimersByTimeAsync(COUNTDOWN_SECONDS * 1000);

    laRocola.handleBuzz(room.code, 'socket-a');
    laRocola.handleSubmitAnswer(room.code, 'socket-a', WRONG_ANSWER);

    const robo = eventsOfType(events, 'rocola_robo_started');
    expect(new Set(robo[0]!.eligibleTeamIds)).toEqual(new Set([teamBId, teamCId]));
  });

  it(
    'se agotan las 10 rondas: pasa a resultados y vuelve sola a selección sin resetear el acumulado',
    async () => {
      const setup = createRoomWithTwoSoloTeams(rooms);
      rooms.selectGame(setup.room.code, 'la-rocola');
      const laRocola = createLaRocola();
      const events: LaRocolaEvent[] = [];
      laRocola.events$.subscribe((e) => events.push(e));

      laRocola.startMatch(setup.room.code);
      await readyBoth(laRocola, setup);

      for (let round = 0; round < TOTAL_ROUNDS; round++) {
        await vi.advanceTimersByTimeAsync(COUNTDOWN_SECONDS * 1000);
        laRocola.handleBuzz(setup.room.code, setup.teamA.socketId);
        laRocola.handleSubmitAnswer(setup.room.code, setup.teamA.socketId, CORRECT_ANSWER);
        await vi.advanceTimersByTimeAsync(REVEAL_DISPLAY_MS);
      }

      expect(rooms.getRoom(setup.room.code)!.status).toBe('resultados');
      const matchResult = eventsOfType(events, 'rocola_match_result');
      expect(matchResult).toHaveLength(1);
      expect(matchResult[0]!.canciones).toHaveLength(TOTAL_ROUNDS);
      const scoreA = matchResult[0]!.scores.find((s) => s.teamId === setup.teamA.teamId)!.score;
      expect(scoreA).toBe(TOTAL_ROUNDS);

      const scoreBefore = rooms
        .getRoom(setup.room.code)!
        .teams.map((t) => ({ id: t.id, score: t.score }));
      await vi.advanceTimersByTimeAsync(RESULTS_DISPLAY_MS - 1);
      expect(rooms.getRoom(setup.room.code)!.currentGame).toBe('la-rocola');

      await vi.advanceTimersByTimeAsync(1);
      const room = rooms.getRoom(setup.room.code)!;
      expect(room.currentGame).toBeNull();
      expect(room.teams.map((t) => ({ id: t.id, score: t.score }))).toEqual(scoreBefore);
    },
  );

  it('dos partidas seguidas no repiten canciones', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const laRocola = createLaRocola(30); // banco chico, sin fallback
    const events: LaRocolaEvent[] = [];
    laRocola.events$.subscribe((e) => events.push(e));

    async function playFullMatch(): Promise<string[]> {
      const before = eventsOfType(events, 'rocola_round_result').length;
      laRocola.startMatch(setup.room.code);
      await readyBoth(laRocola, setup);
      for (let round = 0; round < TOTAL_ROUNDS; round++) {
        await vi.advanceTimersByTimeAsync(COUNTDOWN_SECONDS * 1000);
        laRocola.handleBuzz(setup.room.code, setup.teamA.socketId);
        laRocola.handleSubmitAnswer(setup.room.code, setup.teamA.socketId, CORRECT_ANSWER);
        await vi.advanceTimersByTimeAsync(REVEAL_DISPLAY_MS);
      }
      await vi.advanceTimersByTimeAsync(RESULTS_DISPLAY_MS);
      // Todas las canciones del banco de prueba comparten título — se
      // compara por `songId` (único por canción) en vez de por título.
      return eventsOfType(events, 'rocola_round_result')
        .slice(before)
        .map((e) => e.resultado.songId);
    }

    const primeraPartida = await playFullMatch();
    rooms.selectGame(setup.room.code, 'la-rocola');
    const segundaPartida = await playFullMatch();

    const repetidas = segundaPartida.filter((id) => primeraPartida.includes(id));
    expect(repetidas).toHaveLength(0);
  });

  describe('filtro por género/artista', () => {
    it('startMatch con un género sin suficientes canciones lanza InsufficientFilteredSongsError, sin crear partida', () => {
      // bankSize=8: 1 canción por género — ninguno llega a los 10 necesarios.
      const content = new RocolaContentService(
        alwaysAvailableProvider(),
        Math.random,
        makeBank(8),
        [],
      );
      const laRocola = createLaRocolaWithContent(content);
      const setup = createRoomWithTwoSoloTeams(rooms);

      expect(() =>
        laRocola.startMatch(setup.room.code, { tipo: 'genero', genero: 'salsa' }),
      ).toThrow(InsufficientFilteredSongsError);
      expect(rooms.getRoom(setup.room.code)!.status).toBe('lobby');

      // Sin filtro sigue pudiendo arrancar (no quedó un estado a medio crear).
      expect(() => laRocola.startMatch(setup.room.code)).not.toThrow();
    });

    it('con filtro válido, arranca normal y pasa el filtro a selectSongs recién al satisfacer el ReadyGate', async () => {
      const content = new RocolaContentService(
        alwaysAvailableProvider(),
        Math.random,
        makeBank(80), // 10 por género — justo alcanza para el filtro
        [],
      );
      const selectSongsSpy = vi.spyOn(content, 'selectSongs');
      const laRocola = createLaRocolaWithContent(content);
      const setup = createRoomWithTwoSoloTeams(rooms);
      const filtro = { tipo: 'genero' as const, genero: 'salsa' as const };

      laRocola.startMatch(setup.room.code, filtro);
      expect(selectSongsSpy).not.toHaveBeenCalled();

      await readyBoth(laRocola, setup);

      expect(selectSongsSpy).toHaveBeenCalledWith(TOTAL_ROUNDS, [], filtro);
    });

    it('getAvailableArtists delega en RocolaContentService.getAvailableArtists', () => {
      const content = new RocolaContentService(
        alwaysAvailableProvider(),
        Math.random,
        makeBank(8),
        [],
      );
      const laRocola = createLaRocolaWithContent(content);

      expect(laRocola.getAvailableArtists()).toEqual(content.getAvailableArtists());
    });
  });

  describe('cierre de sala (RoomService.closeRoom)', () => {
    it('detiene la ronda en curso: avanzar el reloj ya no emite nada y no hay partida', async () => {
      const setup = createRoomWithTwoSoloTeams(rooms);
      const laRocola = createLaRocola();
      const events: LaRocolaEvent[] = [];
      laRocola.events$.subscribe((e) => events.push(e));
      laRocola.startMatch(setup.room.code);
      await readyBoth(laRocola, setup);
      const eventsBeforeClose = events.length;

      rooms.closeRoom(setup.room.code);
      await vi.advanceTimersByTimeAsync((COUNTDOWN_SECONDS + SONG_SECONDS) * 1000 * 2);

      expect(events).toHaveLength(eventsBeforeClose);
      expect(() => laRocola.handleBuzz(setup.room.code, setup.teamA.socketId)).toThrow(
        NoRocolaMatchError,
      );
    });

    it('si la sala se cierra mientras se resuelve el catálogo, no lanza ni resucita estado', async () => {
      // Reloj real: hay que esperar un turno del event loop para que Node
      // dispare `unhandledRejection`, y `setImmediate` está falseado.
      vi.useRealTimers();
      const setup = createRoomWithTwoSoloTeams(rooms);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const provider: SongPreviewProvider = {
        lookup: vi.fn(async (trackIds: number[]) => {
          await gate;
          return new Map(
            trackIds.map((id) => [
              id,
              { previewUrl: `https://preview/${id}`, portadaUrl: `https://art/${id}` },
            ]),
          );
        }),
      };
      const content = new RocolaContentService(provider, Math.random, makeBank(40), []);
      const laRocola = createLaRocolaWithContent(content);
      const events: LaRocolaEvent[] = [];
      laRocola.events$.subscribe((e) => events.push(e));
      const unhandled = vi.fn();
      process.once('unhandledRejection', unhandled);

      laRocola.startMatch(setup.room.code);
      await laRocola.markReady(setup.room.code, setup.teamA.socketId);
      const lastReady = laRocola.markReady(setup.room.code, setup.teamB.socketId);
      rooms.closeRoom(setup.room.code);
      release();
      await expect(lastReady).resolves.toBeUndefined();
      await new Promise((resolve) => setImmediate(resolve));
      process.off('unhandledRejection', unhandled);

      expect(unhandled).not.toHaveBeenCalled();
      expect(eventsOfType(events, 'rocola_round_started')).toHaveLength(0);
      expect(
        (laRocola as unknown as { roomUsedSongs: Map<string, unknown> }).roomUsedSongs.size,
      ).toBe(0);
    });

    it('es idempotente y no falla si la sala nunca tuvo partida', () => {
      const setup = createRoomWithTwoSoloTeams(rooms);
      const laRocola = createLaRocola();

      expect(() => {
        laRocola.disposeRoom(setup.room.code);
        laRocola.disposeRoom(setup.room.code);
      }).not.toThrow();
    });
  });
});
