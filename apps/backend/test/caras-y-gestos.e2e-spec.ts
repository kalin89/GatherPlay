import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { type AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import type { RoomState } from '../src/room/room.types.js';

interface GestosTurnWaitingPayload {
  code: string;
  playerId: string;
  playerName: string;
  teamId: string;
}

interface GestosTurnStartedPayload {
  code: string;
  playerId: string;
  playerName: string;
  palabra: string;
  durationSeconds: number;
  palabrasRestantes: number;
}

interface GestosActorReadyPayload {
  code: string;
}

interface GestosTurnResultPayload {
  code: string;
  resultado: {
    playerId: string;
    playerName: string;
    teamId: string;
    palabrasAdivinadas: string[];
    puntos: number;
    motivo: 'completado' | 'tiempo';
  };
}

interface GestosMatchResultPayload {
  code: string;
  scores: { teamId: string; score: number }[];
  palabrasPorEquipo: Record<string, string[]>;
}

const WORDS_PER_TURN = 5;
const TOTAL_TURNS = 6; // 2 equipos de 1 jugador x 3 rondas por jugador
const TURN_SECONDS = 60;

// Sin ANTHROPIC_API_KEY en CI, AiContentService usa siempre el banco de
// respaldo, así que las palabras son reales pero no se pueden predecir de
// antemano — estas pruebas no asumen cuáles son.
describe('CarasYGestosGateway (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const clients: Socket[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
    playerA.on('connect', () =>
      playerA.emit('join_room', { code: room.code, name: 'Ana' }),
    );
    const withA = await playerAJoined;
    const playerAId = withA.players[0]!.id;

    const playerB = connect();
    const playerBJoined = waitFor<RoomState>(playerB, 'room_state');
    playerB.on('connect', () =>
      playerB.emit('join_room', { code: room.code, name: 'Beto' }),
    );
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

    // La pantalla se re-suscribe con watch_room, que es lo que la une a la
    // sala `${code}:screen` (join_room/create_room no lo hacen).
    const watched = waitFor<RoomState>(screen, 'room_state');
    screen.emit('watch_room', { code: room.code });
    await watched;

    return { screen, playerA, playerB, playerAId, playerBId, room, teamAId, teamBId };
  }

  // Arranca el turno del actor y adivina las 5 palabras, sin esperar el
  // timer. Confirma en el camino que el actor nunca recibe la palabra.
  async function playTurnGuessingAllWords(
    screen: Socket,
    actor: Socket,
    other: Socket,
    code: string,
  ): Promise<void> {
    const started = waitFor<GestosTurnStartedPayload>(screen, 'gestos_turn_started');
    const actorReady = waitFor<GestosActorReadyPayload>(actor, 'gestos_actor_ready');
    const otherGotWord = Promise.race([
      waitFor(other, 'gestos_turn_started').then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 200)),
    ]);
    const actorGotWord = Promise.race([
      waitFor(actor, 'gestos_turn_started').then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 200)),
    ]);

    actor.emit('start_gestos_turn', { code });

    const startedPayload = await started;
    expect(startedPayload.palabra).toBeTruthy();
    expect(startedPayload.palabrasRestantes).toBe(WORDS_PER_TURN);
    await actorReady;
    expect(await otherGotWord).toBe(false);
    expect(await actorGotWord).toBe(false);

    const resultPromise = waitFor<GestosTurnResultPayload>(screen, 'gestos_turn_result');
    for (let i = 0; i < WORDS_PER_TURN; i++) {
      actor.emit('mark_gesture_word', { code, resultado: 'adivinada' });
    }
    const result = await resultPromise;
    expect(result.resultado.motivo).toBe('completado');
    expect(result.resultado.puntos).toBe(WORDS_PER_TURN);
  }

  it(
    'camino feliz: el actor nunca recibe la palabra, adivina las 5 y la partida termina con resultado final',
    async () => {
      const { screen, playerA, playerB, playerAId, room } = await createRoomWithTwoSoloTeams();

      const selected = waitFor<RoomState>(screen, 'room_state');
      screen.emit('select_game', { code: room.code, gameId: 'caras-y-gestos' });
      await selected;

      const matchResultPromise = waitFor<GestosMatchResultPayload>(screen, 'gestos_match_result');

      let waitingEvent = waitFor<GestosTurnWaitingPayload>(screen, 'gestos_turn_waiting');
      screen.emit('start_gestos_game', { code: room.code });

      for (let turn = 0; turn < TOTAL_TURNS; turn++) {
        const waiting = await waitingEvent;
        const actor = waiting.playerId === playerAId ? playerA : playerB;
        const other = actor === playerA ? playerB : playerA;

        const isLastTurn = turn === TOTAL_TURNS - 1;
        if (!isLastTurn) {
          waitingEvent = waitFor<GestosTurnWaitingPayload>(screen, 'gestos_turn_waiting');
        }

        await playTurnGuessingAllWords(screen, actor, other, room.code);
      }

      const matchResult = await matchResultPromise;
      expect(matchResult.scores).toHaveLength(2);
      expect(matchResult.palabrasPorEquipo[matchResult.scores[0]!.teamId]).toHaveLength(15);
    },
    30_000,
  );

  it(
    'se acaba el tiempo con palabras pendientes: solo suman las adivinadas, sin negativos',
    async () => {
      const { screen, playerA, playerB, playerAId, room } = await createRoomWithTwoSoloTeams();

      const selected = waitFor<RoomState>(screen, 'room_state');
      screen.emit('select_game', { code: room.code, gameId: 'caras-y-gestos' });
      await selected;

      const waitingEvent = waitFor<GestosTurnWaitingPayload>(screen, 'gestos_turn_waiting');
      screen.emit('start_gestos_game', { code: room.code });
      const waiting = await waitingEvent;
      const actor = waiting.playerId === playerAId ? playerA : playerB;

      const started = waitFor<GestosTurnStartedPayload>(screen, 'gestos_turn_started');
      actor.emit('start_gestos_turn', { code: room.code });
      await started;

      const resultPromise = waitFor<GestosTurnResultPayload>(screen, 'gestos_turn_result');
      actor.emit('mark_gesture_word', { code: room.code, resultado: 'adivinada' });
      actor.emit('mark_gesture_word', { code: room.code, resultado: 'adivinada' });

      const result = await resultPromise;

      expect(result.resultado).toMatchObject({ motivo: 'tiempo', puntos: 2 });
    },
    (TURN_SECONDS + 15) * 1000,
  );
});
