import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { type AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import type { RoomState } from '../src/room/room.types.js';

interface TriviaTurnWaitingPayload {
  code: string;
  playerId: string;
  playerName: string;
  teamId: string;
}

interface TriviaTurnStartedPayload {
  code: string;
  playerId: string;
  playerName: string;
  pregunta: string;
  opciones: string[];
  durationSeconds: number;
}

interface TriviaTurnResultPayload {
  code: string;
  pregunta: string;
  opciones: string[];
  indiceCorrecto: number;
  resultado: {
    playerId: string;
    playerName: string;
    teamId: string;
    opcionElegida: number | null;
    correcta: boolean;
    puntos: number;
  };
}

interface TriviaMatchResultPayload {
  code: string;
  scores: { teamId: string; score: number }[];
}

const TOTAL_TURNS = 6; // 2 equipos de 1 jugador x 3 rondas por jugador

// Sin ANTHROPIC_API_KEY en CI, AiContentService usa siempre el banco de
// respaldo, así que la pregunta es real pero no se puede predecir de
// antemano — estas pruebas no asumen cuál opción es la correcta.
describe('TriviaGateway (e2e)', () => {
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

    return { screen, playerA, playerB, room, teamAId, teamBId };
  }

  it(
    'camino feliz: reparte turnos individuales, cada jugador responde y la partida termina con puntaje final',
    async () => {
      const { screen, playerA, playerB, room } = await createRoomWithTwoSoloTeams();

      const selected = waitFor<RoomState>(screen, 'room_state');
      screen.emit('select_game', { code: room.code, gameId: 'trivia' });
      await selected;

      const matchResultPromise = waitFor<TriviaMatchResultPayload>(
        screen,
        'trivia_match_result',
      );

      // Se arman los listeners del turno 0 ANTES de arrancar la partida —
      // si se armaran adentro del loop, después de emitir start_trivia_game,
      // podría haber una carrera con el servidor ya habiendo emitido esos
      // eventos (a diferencia de los turnos siguientes, que sí tienen de
      // por medio la pausa de TURN_TRANSITION_DELAY_MS).
      let startedOnA = waitFor<TriviaTurnStartedPayload>(playerA, 'trivia_turn_started');
      let startedOnB = waitFor<TriviaTurnStartedPayload>(playerB, 'trivia_turn_started');
      let waitingOnScreen = waitFor<TriviaTurnWaitingPayload>(screen, 'trivia_turn_waiting');
      screen.emit('start_trivia_game', { code: room.code });

      for (let turn = 0; turn < TOTAL_TURNS; turn++) {
        await waitingOnScreen;

        const [current, other, startedPayload] = await Promise.race([
          startedOnA.then((payload) => [playerA, playerB, payload] as const),
          startedOnB.then((payload) => [playerB, playerA, payload] as const),
        ]);

        expect(startedPayload.pregunta).toBeTruthy();
        expect(startedPayload.opciones).toHaveLength(4);

        const otherGotQuestion = Promise.race([
          waitFor(other, 'trivia_turn_started').then(() => true),
          new Promise((resolve) => setTimeout(() => resolve(false), 200)),
        ]);

        // Listeners del próximo turno armados antes de responder este, por
        // la misma razón de arriba.
        const isLastTurn = turn === TOTAL_TURNS - 1;
        if (!isLastTurn) {
          startedOnA = waitFor<TriviaTurnStartedPayload>(playerA, 'trivia_turn_started');
          startedOnB = waitFor<TriviaTurnStartedPayload>(playerB, 'trivia_turn_started');
          waitingOnScreen = waitFor<TriviaTurnWaitingPayload>(screen, 'trivia_turn_waiting');
        }

        const accepted = waitFor<{ opcionIndex: number }>(current, 'trivia_answer_accepted');
        const resultOnScreen = waitFor<TriviaTurnResultPayload>(screen, 'trivia_turn_result');
        current.emit('submit_trivia_answer', { code: room.code, opcionIndex: 0 });
        await accepted;

        expect(await otherGotQuestion).toBe(false);

        const result = await resultOnScreen;
        expect(result.resultado.opcionElegida).toBe(0);
        expect(result.resultado.correcta).toBe(result.resultado.puntos > 0);
      }

      const matchResult = await matchResultPromise;
      expect(matchResult.scores).toHaveLength(2);
    },
    30_000,
  );

  it(
    'nadie responde a tiempo: cuenta como incorrecta, sin puntos negativos',
    async () => {
      const { screen, room } = await createRoomWithTwoSoloTeams();

      const selected = waitFor<RoomState>(screen, 'room_state');
      screen.emit('select_game', { code: room.code, gameId: 'trivia' });
      await selected;

      const result = waitFor<TriviaTurnResultPayload>(screen, 'trivia_turn_result');
      screen.emit('start_trivia_game', { code: room.code });

      const resultPayload = await result;

      expect(resultPayload.resultado).toMatchObject({
        opcionElegida: null,
        correcta: false,
        puntos: 0,
      });
    },
    30_000,
  );
});
