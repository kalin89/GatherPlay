import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { type AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import type { RoomState } from '../src/room/room.types.js';

describe('RoomGateway (e2e)', () => {
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

  it('crea una sala y devuelve un código único en lobby', async () => {
    const host = connect();
    const roomPromise = waitFor<RoomState>(host, 'room_state');
    host.on('connect', () => host.emit('create_room'));

    const room = await roomPromise;

    expect(room.code).toBeTruthy();
    expect(room.status).toBe('lobby');
    expect(room.players).toEqual([]);
  });

  it('un jugador se une por código y todos los conectados reciben el estado actualizado', async () => {
    const host = connect();
    const roomCreated = waitFor<RoomState>(host, 'room_state');
    host.on('connect', () => host.emit('create_room'));
    const room = await roomCreated;

    const player = connect();
    const hostUpdate = waitFor<RoomState>(host, 'room_state');
    const playerUpdate = waitFor<RoomState>(player, 'room_state');
    player.on('connect', () =>
      player.emit('join_room', { code: room.code, name: 'Ana' }),
    );

    const [hostState, playerState] = await Promise.all([
      hostUpdate,
      playerUpdate,
    ]);

    expect(hostState.players).toHaveLength(1);
    expect(playerState.players[0].name).toBe('Ana');
  });

  it('devuelve un error al unirse con un código que no existe', async () => {
    const player = connect();
    const errorPromise = waitFor<{ message: string }>(player, 'error');
    player.on('connect', () =>
      player.emit('join_room', { code: 'ZZZZZ', name: 'Ana' }),
    );

    const error = await errorPromise;

    expect(error.message).toBeTruthy();
  });

  it('al desconectarse un jugador, el resto ve el estado actualizado', async () => {
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

    const hostSeesDisconnect = waitFor<RoomState>(host, 'room_state');
    player.disconnect();

    const hostState = await hostSeesDisconnect;
    expect(hostState.players).toEqual([]);
  });
});
