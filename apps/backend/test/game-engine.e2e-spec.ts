import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { type AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import type { RoomState, RoundState } from '../src/room/room.types.js';

interface RoundStartedPayload {
  code: string;
  round: RoundState;
}

interface RoundUpdatePayload {
  code: string;
  remainingSeconds: number;
}

interface RoundResultPayload {
  code: string;
  scores: { teamId: string; score: number }[];
}

describe('GameEngineGateway (e2e)', () => {
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
    await playerJoined;

    const teamCreated = waitFor<RoomState>(host, 'room_state');
    const playerSeesTeam = waitFor<RoomState>(player, 'room_state');
    host.emit('create_team', {
      code: room.code,
      name: 'Rojos',
      color: '#FF0000',
    });
    const [withTeam] = await Promise.all([teamCreated, playerSeesTeam]);

    return { host, player, room, teamId: withTeam.teams[0].id };
  }

  it('camino feliz: inicia una ronda, tickea y termina con resultados', async () => {
    const { host, room } = await createRoomWithPlayerAndTeam();

    const started = waitFor<RoomState>(host, 'room_state');
    const roundStarted = waitFor<RoundStartedPayload>(host, 'round_started');
    host.emit('start_round', { code: room.code, durationSeconds: 1 });

    const startedState = await started;
    expect(startedState.status).toBe('jugando');
    expect(startedState.round).toEqual({
      durationSeconds: 1,
      remainingSeconds: 1,
    });
    const roundStartedPayload = await roundStarted;
    expect(roundStartedPayload.round.remainingSeconds).toBe(1);

    const tick = waitFor<RoundUpdatePayload>(host, 'round_update');
    const finished = waitFor<RoomState>(host, 'room_state');
    const result = waitFor<RoundResultPayload>(host, 'round_result');

    const tickPayload = await tick;
    expect(tickPayload.remainingSeconds).toBe(0);
    const finishedState = await finished;
    expect(finishedState.status).toBe('resultados');
    expect(finishedState.round).toBeNull();
    const resultPayload = await result;
    expect(resultPayload.scores).toHaveLength(1);
  });

  it('el jugador (no solo el host) recibe los ticks del temporizador', async () => {
    const { host, player, room } = await createRoomWithPlayerAndTeam();

    const playerTick = waitFor<RoundUpdatePayload>(player, 'round_update');
    host.emit('start_round', { code: room.code, durationSeconds: 1 });

    const tickPayload = await playerTick;
    expect(tickPayload.remainingSeconds).toBe(0);
  });

  it('end_round corta la ronda antes de tiempo', async () => {
    const { host, room } = await createRoomWithPlayerAndTeam();
    const started = waitFor<RoomState>(host, 'room_state');
    host.emit('start_round', { code: room.code, durationSeconds: 30 });
    await started;

    const finished = waitFor<RoomState>(host, 'room_state');
    const result = waitFor<RoundResultPayload>(host, 'round_result');
    host.emit('end_round', { code: room.code });

    const finishedState = await finished;
    expect(finishedState.status).toBe('resultados');
    await result;
  });

  it('una segunda ronda mientras hay una en curso devuelve error y no afecta a la original', async () => {
    const { host, room } = await createRoomWithPlayerAndTeam();
    const started = waitFor<RoomState>(host, 'room_state');
    host.emit('start_round', { code: room.code, durationSeconds: 30 });
    await started;

    const errorPromise = waitFor<{ message: string }>(host, 'error');
    host.emit('start_round', { code: room.code, durationSeconds: 5 });

    const error = await errorPromise;
    expect(error.message).toBeTruthy();
  });

  it('award_points actualiza el marcador y llega a todos los clientes', async () => {
    const { host, player, teamId, room } = await createRoomWithPlayerAndTeam();

    const hostUpdate = waitFor<RoomState>(host, 'room_state');
    const playerUpdate = waitFor<RoomState>(player, 'room_state');
    host.emit('award_points', { code: room.code, teamId, points: 10 });

    const [hostState, playerState] = await Promise.all([
      hostUpdate,
      playerUpdate,
    ]);
    expect(hostState.teams[0].score).toBe(10);
    expect(playerState.teams[0].score).toBe(10);
  });

  it('start_round con un código de sala inexistente devuelve error', async () => {
    const host = connect();
    const errorPromise = waitFor<{ message: string }>(host, 'error');
    host.on('connect', () =>
      host.emit('start_round', { code: 'ZZZZZ', durationSeconds: 5 }),
    );

    const error = await errorPromise;
    expect(error.message).toBeTruthy();
  });
});
