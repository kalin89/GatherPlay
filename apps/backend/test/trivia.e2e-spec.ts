import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { type AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import type { RoomState } from '../src/room/room.types.js';

interface TriviaQuestionPayload {
  code: string;
  categoria: string;
  pregunta: string;
  opciones: string[];
}

interface TriviaAnswerResultPayload {
  playerId: string;
  opcionIndex: number | null;
  correcta: boolean;
  puntos: number;
}

interface TriviaResultPayload {
  code: string;
  pregunta: string;
  opciones: string[];
  indiceCorrecto: number;
  resultados: TriviaAnswerResultPayload[];
}

// Sin ANTHROPIC_API_KEY en CI, AiContentService usa siempre el banco de
// respaldo (ver ai-content/), así que la pregunta es real pero no se puede
// predecir de antemano — estas pruebas no asumen cuál opción es la correcta.
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

  async function createRoomWithPlayerAndTeam(): Promise<{
    host: Socket;
    player: Socket;
    room: RoomState;
    teamId: string;
  }> {
    const host = connect();
    const roomCreated = waitFor<RoomState>(host, 'room_state');
    host.on('connect', () => host.emit('create_room'));
    const room = await roomCreated;

    const player = connect();
    const playerJoined = waitFor<RoomState>(player, 'room_state');
    player.on('connect', () =>
      player.emit('join_room', { code: room.code, name: 'Ana' }),
    );
    const joined = await playerJoined;
    const playerId = joined.players[0]!.id;

    const teamCreated = waitFor<RoomState>(host, 'room_state');
    host.emit('create_team', { code: room.code, name: 'Rojos', color: '#FF0000' });
    const withTeam = await teamCreated;
    const teamId = withTeam.teams[0]!.id;

    const assigned = waitFor<RoomState>(host, 'room_state');
    host.emit('assign_team', { code: room.code, playerId, teamId });
    await assigned;

    return { host, player, room, teamId };
  }

  it('camino feliz: reparte la pregunta, el jugador responde y recibe el resultado', async () => {
    const { host, player, room, teamId } = await createRoomWithPlayerAndTeam();

    const questionForHost = waitFor<TriviaQuestionPayload>(host, 'trivia_question');
    const questionForPlayer = waitFor<TriviaQuestionPayload>(player, 'trivia_question');
    host.emit('start_trivia_round', {
      code: room.code,
      categoria: 'general',
      durationSeconds: 2,
    });

    const [hostQuestion, playerQuestion] = await Promise.all([
      questionForHost,
      questionForPlayer,
    ]);
    expect(hostQuestion.pregunta).toBeTruthy();
    expect(hostQuestion.opciones).toHaveLength(4);
    expect(playerQuestion.pregunta).toBe(hostQuestion.pregunta);
    expect(hostQuestion).not.toHaveProperty('indiceCorrecto');

    const accepted = waitFor<{ opcionIndex: number }>(player, 'trivia_answer_accepted');
    player.emit('submit_trivia_answer', { code: room.code, opcionIndex: 0 });
    await accepted;

    const result = waitFor<TriviaResultPayload>(host, 'trivia_result');
    const finalState = waitFor<RoomState>(host, 'room_state');
    const resultPayload = await result;

    expect(resultPayload.resultados).toHaveLength(1);
    const [playerResult] = resultPayload.resultados;
    expect(playerResult!.opcionIndex).toBe(0);
    expect(playerResult!.correcta).toBe(playerResult!.opcionIndex === resultPayload.indiceCorrecto);

    const state = await finalState;
    const team = state.teams.find((t) => t.id === teamId)!;
    if (playerResult!.correcta) {
      expect(team.score).toBe(playerResult!.puntos);
      expect(team.score).toBeGreaterThan(0);
    } else {
      expect(team.score).toBe(0);
    }
  });

  it('nadie responde a tiempo: cuenta como incorrecta, sin puntos negativos', async () => {
    const { host, room, teamId } = await createRoomWithPlayerAndTeam();

    const question = waitFor<TriviaQuestionPayload>(host, 'trivia_question');
    host.emit('start_trivia_round', { code: room.code, categoria: 'ciencia', durationSeconds: 1 });
    await question;

    const result = waitFor<TriviaResultPayload>(host, 'trivia_result');
    const resultPayload = await result;

    expect(resultPayload.resultados).toEqual([
      { playerId: expect.any(String), opcionIndex: null, correcta: false, puntos: 0 },
    ]);

    // Nadie respondió → no hubo addScore, así que no sale ningún room_state
    // nuevo por eso; watch_room pide un snapshot fresco para confirmar que
    // el puntaje del equipo se quedó en 0.
    const state = waitFor<RoomState>(host, 'room_state');
    host.emit('watch_room', { code: room.code });
    const finalState = await state;

    expect(finalState.teams.find((t) => t.id === teamId)!.score).toBe(0);
  });
});
