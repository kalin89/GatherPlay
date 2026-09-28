import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { type AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import type { RoomState } from '../src/room/room.types.js';
import { RocolaContentService } from '../src/rocola-content/rocola-content.service.js';
import type { RocolaBankEntry } from '../src/rocola-content/rocola-content.types.js';
import type { SongPreviewProvider } from '../src/rocola-content/song-preview-provider.js';

// Mismo título para todo el banco de prueba — así se puede enviar una
// respuesta "correcta" determinística sin depender de qué canción tocó al
// azar en cada ronda (mismo criterio que la-rocola.service.spec.ts).
const CORRECT_ANSWER = 'Cancion Correcta';
const WRONG_ANSWER = 'Una Respuesta Totalmente Distinta';

function fakeAlwaysAvailableProvider(): SongPreviewProvider {
  return {
    async lookup(trackIds: number[]) {
      const map = new Map<number, { previewUrl: string; portadaUrl: string }>();
      for (const id of trackIds) {
        map.set(id, {
          previewUrl: `https://example.com/preview-${id}.m4a`,
          portadaUrl: `https://example.com/art-${id}.jpg`,
        });
      }
      return map;
    },
  };
}

function fakeBank(count: number): RocolaBankEntry[] {
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

interface RocolaReadyStatePayload {
  code: string;
  readyPlayerIds: string[];
  eligiblePlayerIds: string[];
}

interface RocolaRoundStartedPayload {
  code: string;
  roundNumber: number;
  totalRounds: number;
  marcador: { teamId: string; score: number }[];
}

interface RocolaAudioControlPayload {
  code: string;
  action: 'play' | 'pause' | 'resume';
  previewUrl?: string;
}

interface RocolaBuzzerLockedPayload {
  code: string;
  playerId: string;
  playerName: string;
  teamId: string;
}

interface RocolaRoboStartedPayload {
  code: string;
  eligibleTeamIds: string[];
  eligibleTeamNames: string[];
  remainingSeconds: number;
}

interface RocolaAnswerTickPayload {
  code: string;
  remainingSeconds: number;
}

interface RocolaRoundResultPayload {
  code: string;
  resultado: {
    songId: string;
    titulo: string;
    teamId: string | null;
    playerId: string | null;
    puntos: number;
    respuesta: string;
  };
}

interface RocolaMatchResultPayload {
  code: string;
  scores: { teamId: string; score: number }[];
  canciones: { titulo: string; artista: string; teamId: string | null }[];
}

const TOTAL_ROUNDS = 10;

describe('LaRocolaGateway (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const clients: Socket[] = [];

  beforeAll(async () => {
    // Se reemplaza el `RocolaContentService` completo (no solo el
    // proveedor de preview) por uno con un banco de prueba de título
    // conocido — así el test puede enviar una respuesta "correcta"
    // determinística sin depender de qué canción real tocó al azar.
    const testContentService = new RocolaContentService(
      fakeAlwaysAvailableProvider(),
      Math.random,
      fakeBank(30),
      [],
    );
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RocolaContentService)
      .useValue(testContentService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    for (const client of clients) {
      client.disconnect();
    }
    clients.length = 0;
  });

  function connect(): Socket {
    const client = io(baseUrl, { transports: ['websocket'], forceNew: true });
    clients.push(client);
    return client;
  }

  function waitFor<T>(client: Socket, event: string): Promise<T> {
    return new Promise((resolve) => client.once(event, resolve));
  }

  async function createRoomWithTwoSoloTeams(): Promise<{
    screen: Socket;
    playerA: Socket;
    playerB: Socket;
    playerAId: string;
    playerBId: string;
    room: RoomState;
    teamAId: string;
    teamBId: string;
  }> {
    const screen = connect();
    const roomCreated = waitFor<RoomState>(screen, 'room_state');
    screen.on('connect', () => screen.emit('create_room'));
    const room = await roomCreated;

    const playerA = connect();
    const playerAJoined = waitFor<RoomState>(playerA, 'room_state');
    playerA.on('connect', () => playerA.emit('join_room', { code: room.code, name: 'Ana' }));
    const withA = await playerAJoined;
    const playerAId = withA.players[0]!.id;

    const playerB = connect();
    const playerBJoined = waitFor<RoomState>(playerB, 'room_state');
    playerB.on('connect', () => playerB.emit('join_room', { code: room.code, name: 'Beto' }));
    const withB = await playerBJoined;
    const playerBId = withB.players.find((p) => p.name === 'Beto')!.id;

    const teamACreated = waitFor<RoomState>(screen, 'room_state');
    screen.emit('create_team', { code: room.code, name: 'Rojos', color: '#FF0000' });
    const withTeamA = await teamACreated;
    const teamAId = withTeamA.teams[0]!.id;

    const teamBCreated = waitFor<RoomState>(screen, 'room_state');
    screen.emit('create_team', { code: room.code, name: 'Azules', color: '#0000FF' });
    const withTeamB = await teamBCreated;
    const teamBId = withTeamB.teams[1]!.id;

    const assignedA = waitFor<RoomState>(screen, 'room_state');
    screen.emit('assign_team', { code: room.code, playerId: playerAId, teamId: teamAId });
    await assignedA;

    const assignedB = waitFor<RoomState>(screen, 'room_state');
    screen.emit('assign_team', { code: room.code, playerId: playerBId, teamId: teamBId });
    await assignedB;

    const watched = waitFor<RoomState>(screen, 'room_state');
    screen.emit('watch_room', { code: room.code });
    await watched;

    return { screen, playerA, playerB, playerAId, playerBId, room, teamAId, teamBId };
  }

  // Arranca una ronda (espera el conteo real de 5s) y confirma que el audio
  // solo llega a la pantalla, nunca a los celulares.
  async function waitThroughCountdown(
    screen: Socket,
    playerA: Socket,
    playerB: Socket,
  ): Promise<RocolaAudioControlPayload> {
    const playEvent = waitFor<RocolaAudioControlPayload>(screen, 'rocola_audio_control');
    let playerAGotAudio = false;
    let playerBGotAudio = false;
    const onAudio = () => {
      playerAGotAudio = true;
    };
    const onAudioB = () => {
      playerBGotAudio = true;
    };
    playerA.on('rocola_audio_control', onAudio);
    playerB.on('rocola_audio_control', onAudioB);

    const play = await playEvent;
    expect(play.action).toBe('play');
    expect(play.previewUrl).toBeTruthy();
    expect(playerAGotAudio).toBe(false);
    expect(playerBGotAudio).toBe(false);
    playerA.off('rocola_audio_control', onAudio);
    playerB.off('rocola_audio_control', onAudioB);
    return play;
  }

  it(
    'camino feliz: instrucciones + Listo, buzzer, robo de punto y las 10 rondas hasta el resultado final',
    async () => {
      const { screen, playerA, playerB, playerAId, playerBId, room, teamAId, teamBId } =
        await createRoomWithTwoSoloTeams();

      const selected = waitFor<RoomState>(screen, 'room_state');
      screen.emit('select_game', { code: room.code, gameId: 'la-rocola' });
      await selected;

      const readyState = waitFor<RocolaReadyStatePayload>(screen, 'rocola_ready_state');
      screen.emit('start_la_rocola_game', { code: room.code });
      const initialReady = await readyState;
      expect(initialReady.readyPlayerIds).toHaveLength(0);
      expect(new Set(initialReady.eligiblePlayerIds)).toEqual(new Set([playerAId, playerBId]));

      const readyStateA = waitFor<RocolaReadyStatePayload>(screen, 'rocola_ready_state');
      playerA.emit('rocola_ready', { code: room.code });
      await readyStateA;

      const roundStarted = waitFor<RocolaRoundStartedPayload>(screen, 'rocola_round_started');
      playerB.emit('rocola_ready', { code: room.code });
      const round1 = await roundStarted;
      expect(round1.roundNumber).toBe(1);
      expect(round1.totalRounds).toBe(TOTAL_ROUNDS);

      await waitThroughCountdown(screen, playerA, playerB);

      // Ronda 1: A presiona primero, responde incorrecto -> se abre el robo
      // de punto para B -> B presiona y acierta.
      const buzzerLocked = waitFor<RocolaBuzzerLockedPayload>(screen, 'rocola_buzzer_locked');
      const pauseAudio = waitFor<RocolaAudioControlPayload>(screen, 'rocola_audio_control');
      playerA.emit('rocola_buzz', { code: room.code });
      const locked = await buzzerLocked;
      expect(locked.playerId).toBe(playerAId);
      expect((await pauseAudio).action).toBe('pause');

      const answerTick = waitFor<RocolaAnswerTickPayload>(screen, 'rocola_answer_tick');
      expect((await answerTick).remainingSeconds).toBeGreaterThan(0);

      const roboStarted = waitFor<RocolaRoboStartedPayload>(screen, 'rocola_robo_started');
      const resumeAudio = waitFor<RocolaAudioControlPayload>(screen, 'rocola_audio_control');
      playerA.emit('rocola_submit_answer', { code: room.code, texto: WRONG_ANSWER });
      const robo = await roboStarted;
      expect(robo.eligibleTeamIds).toEqual([teamBId]);
      expect((await resumeAudio).action).toBe('resume');

      const roundResult1 = waitFor<RocolaRoundResultPayload>(screen, 'rocola_round_result');
      playerB.emit('rocola_buzz', { code: room.code });
      // Con una falta de ortografía — debe seguir contando como correcta.
      playerB.emit('rocola_submit_answer', { code: room.code, texto: 'Cancion Korrecta' });
      const result1 = await roundResult1;
      expect(result1.resultado.teamId).toBe(teamBId);
      expect(result1.resultado.puntos).toBe(1);

      // Rondas 2 a 10: siempre A acierta de una, camino corto para llegar
      // al resultado final sin estirar demasiado el test.
      let lastResult = result1;
      for (let round = 2; round <= TOTAL_ROUNDS; round++) {
        const nextRound = waitFor<RocolaRoundStartedPayload>(screen, 'rocola_round_started');
        const started = await nextRound;
        expect(started.roundNumber).toBe(round);

        await waitThroughCountdown(screen, playerA, playerB);
        const roundResult = waitFor<RocolaRoundResultPayload>(screen, 'rocola_round_result');
        playerA.emit('rocola_buzz', { code: room.code });
        playerA.emit('rocola_submit_answer', { code: room.code, texto: CORRECT_ANSWER });
        lastResult = await roundResult;
        expect(lastResult.resultado.teamId).toBe(teamAId);
      }

      const matchResultPromise = waitFor<RocolaMatchResultPayload>(screen, 'rocola_match_result');
      const matchResult = await matchResultPromise;
      expect(matchResult.canciones).toHaveLength(TOTAL_ROUNDS);
      const scoreA = matchResult.scores.find((s) => s.teamId === teamAId)!.score;
      const scoreB = matchResult.scores.find((s) => s.teamId === teamBId)!.score;
      expect(scoreA + scoreB).toBe(TOTAL_ROUNDS);

      const backToSelection = waitFor<RoomState>(screen, 'room_state');
      const back = await backToSelection;
      expect(back.currentGame).toBeNull();
    },
    (TOTAL_ROUNDS * (5 + 4) + 20) * 1000,
  );
});
