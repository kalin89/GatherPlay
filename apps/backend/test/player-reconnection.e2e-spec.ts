import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { type AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import { ROOM_LIFECYCLE_CONFIG } from '../src/room/room-lifecycle.config.js';
import type { RoomState } from '../src/room/room.types.js';

interface Joined {
  playerId: string;
  playerToken: string;
}

describe('Reconexión de jugadores (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const clients: Socket[] = [];

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ROOM_LIFECYCLE_CONFIG)
      .useValue({
        hostGraceMs: 60_000,
        maxAgeMs: 60_000,
        maxRooms: 100,
        sweepIntervalMs: 50,
        playerGraceMs: 400,
        lobbyPlayerGraceMs: 400,
      })
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

  function waitFor<T = void>(client: Socket, event: string): Promise<T> {
    return new Promise((resolve) => client.once(event, resolve));
  }

  // Sala con un equipo y una jugadora ya asignada a él.
  async function roomWithTeamedPlayer() {
    const host = connect();
    const created = waitFor<RoomState>(host, 'room_state');
    host.on('connect', () => host.emit('create_room'));
    const room = await created;

    const player = connect();
    const joined = waitFor<Joined>(player, 'joined');
    player.on('connect', () =>
      player.emit('join_room', { code: room.code, name: 'Ana' }),
    );
    const identity = await joined;

    const withTeam = waitFor<RoomState>(host, 'room_state');
    host.emit('create_team', { code: room.code, name: 'Rojos', color: '#FF0000' });
    const teamId = (await withTeam).teams[0]!.id;

    const assigned = waitFor<RoomState>(host, 'room_state');
    host.emit('assign_team', {
      code: room.code,
      playerId: identity.playerId,
      teamId,
    });
    await assigned;

    return { host, player, code: room.code, teamId, ...identity };
  }

  it('al reconectar con su token la jugadora conserva su id y su equipo', async () => {
    const { host, player, code, teamId, playerId, playerToken } =
      await roomWithTeamedPlayer();

    const hostSeesDisconnect = waitFor<RoomState>(host, 'room_state');
    player.disconnect();
    expect((await hostSeesDisconnect).players[0]?.connected).toBe(false);

    const returning = connect();
    const joined = waitFor<Joined>(returning, 'joined');
    const state = waitFor<RoomState>(returning, 'room_state');
    returning.on('connect', () =>
      returning.emit('rejoin_room', { code, playerToken }),
    );

    expect((await joined).playerId).toBe(playerId);
    const room = await state;
    expect(room.players).toHaveLength(1);
    expect(room.players[0]).toMatchObject({ id: playerId, connected: true });
    expect(room.teams[0]?.playerIds).toEqual([playerId]);
    expect(room.teams[0]?.id).toBe(teamId);
  });

  it('el token no viaja en ningún room_state difundido', async () => {
    const host = connect();
    const created = waitFor<RoomState>(host, 'room_state');
    host.on('connect', () => host.emit('create_room'));
    const room = await created;
    const broadcasts: unknown[] = [];
    host.on('room_state', (state: unknown) => broadcasts.push(state));

    const player = connect();
    const joined = waitFor<Joined>(player, 'joined');
    player.on('connect', () =>
      player.emit('join_room', { code: room.code, name: 'Ana' }),
    );
    const { playerToken } = await joined;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(broadcasts.length).toBeGreaterThan(0);
    expect(JSON.stringify(broadcasts)).not.toContain(playerToken);
  });

  it('una pestaña duplicada reemplaza a la anterior, que recibe replaced', async () => {
    const { player, code, playerId, playerToken } = await roomWithTeamedPlayer();

    const replaced = waitFor(player, 'replaced');
    const second = connect();
    const joined = waitFor<Joined>(second, 'joined');
    second.on('connect', () =>
      second.emit('rejoin_room', { code, playerToken }),
    );

    expect((await joined).playerId).toBe(playerId);
    await replaced;
  });

  it('vencida la gracia el jugador sale de la sala y rejoin_room falla con REJOIN_FAILED', async () => {
    const { host, player, code, playerToken } = await roomWithTeamedPlayer();

    player.disconnect();
    // Espera a que el barrido lo elimine (gracia 400 ms, barrido cada 50 ms).
    const removed = new Promise<RoomState>((resolve) => {
      host.on('room_state', (room: RoomState) => {
        if (room.players.length === 0) resolve(room);
      });
    });
    const room = await removed;
    expect(room.teams[0]?.playerIds).toEqual([]);

    const late = connect();
    const failure = waitFor<{ code?: string }>(late, 'error');
    late.on('connect', () => late.emit('rejoin_room', { code, playerToken }));
    expect((await failure).code).toBe('REJOIN_FAILED');
  });
});
