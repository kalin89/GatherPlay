import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { type AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import {
  ROOM_LIFECYCLE_CONFIG,
  type RoomLifecycleConfig,
} from '../src/room/room-lifecycle.config.js';
import type { RoomState } from '../src/room/room.types.js';

interface TestServer {
  app: INestApplication;
  baseUrl: string;
}

async function startServer(config: RoomLifecycleConfig): Promise<TestServer> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ROOM_LIFECYCLE_CONFIG)
    .useValue(config)
    .compile();
  const app = moduleFixture.createNestApplication();
  await app.listen(0);
  const address = app.getHttpServer().address() as AddressInfo;
  return { app, baseUrl: `http://localhost:${address.port}` };
}

describe('Ciclo de vida de salas (e2e)', () => {
  const clients: Socket[] = [];

  function connect(baseUrl: string): Socket {
    const client = io(baseUrl, { transports: ['websocket'], forceNew: true });
    clients.push(client);
    return client;
  }

  function waitFor<T = void>(client: Socket, event: string): Promise<T> {
    return new Promise((resolve) => client.once(event, resolve));
  }

  afterEach(() => {
    for (const client of clients) {
      client.disconnect();
    }
    clients.length = 0;
  });

  describe('pantalla de host', () => {
    let server: TestServer;

    beforeAll(async () => {
      server = await startServer({
        hostGraceMs: 500,
        maxAgeMs: 60_000,
        maxRooms: 100,
        sweepIntervalMs: 50,
        playerGraceMs: 60_000,
        lobbyPlayerGraceMs: 60_000,
      });
    });

    afterAll(async () => {
      await server.app.close();
    });

    // Reproduce el flujo real del frontend: un socket crea la sala y se va,
    // después la pantalla se suscribe con `watch_room` y un celular se une.
    async function openRoomWithScreenAndPlayer() {
      const creator = connect(server.baseUrl);
      const created = waitFor<RoomState>(creator, 'room_state');
      creator.on('connect', () => creator.emit('create_room'));
      const room = await created;
      creator.disconnect();

      const screen = connect(server.baseUrl);
      const screenSeesRoom = waitFor<RoomState>(screen, 'room_state');
      screen.on('connect', () => screen.emit('watch_room', { code: room.code }));
      await screenSeesRoom;

      const player = connect(server.baseUrl);
      const joined = waitFor<RoomState>(player, 'room_state');
      player.on('connect', () =>
        player.emit('join_room', { code: room.code, name: 'Ana' }),
      );
      await joined;

      return { code: room.code, screen, player };
    }

    it('avisa al celular cuando la pantalla se desconecta y cuando vuelve a tiempo', async () => {
      const { code, screen, player } = await openRoomWithScreenAndPlayer();

      const disconnected = waitFor(player, 'host_disconnected');
      screen.disconnect();
      await disconnected;

      const reconnected = waitFor(player, 'host_reconnected');
      const screen2 = connect(server.baseUrl);
      screen2.on('connect', () => screen2.emit('watch_room', { code }));
      await reconnected;

      // La sala sigue viva pasada la gracia original: el host volvió.
      await new Promise((resolve) => setTimeout(resolve, 700));
      const lateJoiner = connect(server.baseUrl);
      const lateState = waitFor<RoomState>(lateJoiner, 'room_state');
      lateJoiner.on('connect', () =>
        lateJoiner.emit('join_room', { code, name: 'Beto' }),
      );
      expect((await lateState).players).toHaveLength(2);
    });

    it('cierra la sala y avisa a los celulares si la pantalla no vuelve a tiempo', async () => {
      const { code, screen, player } = await openRoomWithScreenAndPlayer();

      const closed = waitFor<{ reason: string }>(player, 'room_closed');
      screen.disconnect();

      expect(await closed).toEqual({ reason: 'host_left' });

      const lateJoiner = connect(server.baseUrl);
      const error = waitFor<{ message: string }>(lateJoiner, 'error');
      lateJoiner.on('connect', () =>
        lateJoiner.emit('join_room', { code, name: 'Beto' }),
      );
      expect((await error).message).toBeTruthy();
    });

    it('una sala cuya pantalla nunca se abrió también se cierra', async () => {
      const creator = connect(server.baseUrl);
      const created = waitFor<RoomState>(creator, 'room_state');
      creator.on('connect', () => creator.emit('create_room'));
      const room = await created;

      const closed = waitFor<{ reason: string }>(creator, 'room_closed');
      // El creador sigue conectado (no se desconecta) y aun así la sala
      // expira: solo cuenta una pantalla con `watch_room`.
      expect(await closed).toEqual({ reason: 'host_left' });
      expect(room.code).toBeTruthy();
    });
  });

  describe('tope de salas', () => {
    let server: TestServer;

    beforeAll(async () => {
      server = await startServer({
        hostGraceMs: 60_000,
        maxAgeMs: 60_000,
        maxRooms: 2,
        sweepIntervalMs: 50,
        playerGraceMs: 60_000,
        lobbyPlayerGraceMs: 60_000,
      });
    });

    afterAll(async () => {
      await server.app.close();
    });

    it('rechaza create_room con un error al superar el máximo', async () => {
      for (let i = 0; i < 2; i++) {
        const creator = connect(server.baseUrl);
        const created = waitFor<RoomState>(creator, 'room_state');
        creator.on('connect', () => creator.emit('create_room'));
        await created;
      }

      const extra = connect(server.baseUrl);
      const error = waitFor<{ message: string }>(extra, 'error');
      extra.on('connect', () => extra.emit('create_room'));

      expect((await error).message).toMatch(/máximo/);
    });
  });
});
