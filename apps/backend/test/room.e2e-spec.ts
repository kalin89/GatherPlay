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

  it('el host crea equipos y asigna jugadores manualmente', async () => {
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
    const playerId = joined.players[0].id;

    const teamCreated = waitFor<RoomState>(host, 'room_state');
    host.emit('create_team', {
      code: room.code,
      name: 'Rojos',
      color: '#FF0000',
    });
    const withTeam = await teamCreated;
    const teamId = withTeam.teams[0].id;

    const teamAssigned = waitFor<RoomState>(host, 'room_state');
    host.emit('assign_team', { code: room.code, playerId, teamId });
    const assigned = await teamAssigned;

    expect(assigned.teams[0].playerIds).toEqual([playerId]);
  });

  it('el host arma los equipos al azar y todos quedan asignados', async () => {
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

    const teamsCreated = waitFor<RoomState>(host, 'room_state');
    host.emit('create_team', {
      code: room.code,
      name: 'Rojos',
      color: '#FF0000',
    });
    await teamsCreated;
    const secondTeamCreated = waitFor<RoomState>(host, 'room_state');
    host.emit('create_team', {
      code: room.code,
      name: 'Azules',
      color: '#0000FF',
    });
    await secondTeamCreated;

    const randomized = waitFor<RoomState>(host, 'room_state');
    host.emit('randomize_teams', { code: room.code });
    const result = await randomized;

    const assigned = result.teams.flatMap((t) => t.playerIds);
    expect(assigned).toHaveLength(1);
  });

  it('una pantalla se suscribe a la sala sin registrarse como jugador', async () => {
    const host = connect();
    const roomCreated = waitFor<RoomState>(host, 'room_state');
    host.on('connect', () => host.emit('create_room'));
    const room = await roomCreated;

    const screen = connect();
    const watched = waitFor<RoomState>(screen, 'room_state');
    screen.on('connect', () => screen.emit('watch_room', { code: room.code }));
    const watchedState = await watched;

    expect(watchedState.code).toBe(room.code);
    expect(watchedState.players).toEqual([]);
  });

  it('devuelve un error al mirar una sala con un código que no existe', async () => {
    const screen = connect();
    const errorPromise = waitFor<{ message: string }>(screen, 'error');
    screen.on('connect', () => screen.emit('watch_room', { code: 'ZZZZZ' }));

    const error = await errorPromise;

    expect(error.message).toBeTruthy();
  });

  it('la pantalla recibe el estado actualizado cuando un jugador se une', async () => {
    const host = connect();
    const roomCreated = waitFor<RoomState>(host, 'room_state');
    host.on('connect', () => host.emit('create_room'));
    const room = await roomCreated;

    const screen = connect();
    const watched = waitFor<RoomState>(screen, 'room_state');
    screen.on('connect', () => screen.emit('watch_room', { code: room.code }));
    await watched;

    const player = connect();
    const playerJoined = waitFor<RoomState>(player, 'room_state');
    const screenUpdate = waitFor<RoomState>(screen, 'room_state');
    player.on('connect', () =>
      player.emit('join_room', { code: room.code, name: 'Ana' }),
    );
    await playerJoined;
    const screenState = await screenUpdate;

    expect(screenState.players).toHaveLength(1);
    expect(screenState.players[0].name).toBe('Ana');
  });

  it('la desconexión de la pantalla no altera la lista de jugadores', async () => {
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

    const screen = connect();
    const watched = waitFor<RoomState>(screen, 'room_state');
    screen.on('connect', () => screen.emit('watch_room', { code: room.code }));
    const watchedState = await watched;
    expect(watchedState.players).toHaveLength(1);

    screen.disconnect();

    // Verifica el estado real de la sala con una segunda pantalla,
    // en vez de asumir que la desconexión no disparó ningún cambio.
    const secondScreen = connect();
    const recheck = waitFor<RoomState>(secondScreen, 'room_state');
    secondScreen.on('connect', () =>
      secondScreen.emit('watch_room', { code: room.code }),
    );
    const finalState = await recheck;

    expect(finalState.players).toHaveLength(1);
    expect(finalState.players[0].name).toBe('Ana');
  });

  it('devuelve un error al asignar un jugador a un equipo inexistente', async () => {
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
    const playerId = joined.players[0].id;

    const errorPromise = waitFor<{ message: string }>(host, 'error');
    host.emit('assign_team', {
      code: room.code,
      playerId,
      teamId: 'inexistente',
    });

    const error = await errorPromise;
    expect(error.message).toBeTruthy();
  });

  it('el host elimina un equipo y todos los clientes ven el estado actualizado', async () => {
    const host = connect();
    const roomCreated = waitFor<RoomState>(host, 'room_state');
    host.on('connect', () => host.emit('create_room'));
    const room = await roomCreated;

    const teamCreated = waitFor<RoomState>(host, 'room_state');
    host.emit('create_team', {
      code: room.code,
      name: 'Rojos',
      color: '#FF0000',
    });
    const withTeam = await teamCreated;
    const teamId = withTeam.teams[0].id;

    const screen = connect();
    const watched = waitFor<RoomState>(screen, 'room_state');
    screen.on('connect', () => screen.emit('watch_room', { code: room.code }));
    await watched;

    const hostSeesRemoval = waitFor<RoomState>(host, 'room_state');
    const screenSeesRemoval = waitFor<RoomState>(screen, 'room_state');
    host.emit('remove_team', { code: room.code, teamId });

    const [hostState, screenState] = await Promise.all([
      hostSeesRemoval,
      screenSeesRemoval,
    ]);

    expect(hostState.teams).toEqual([]);
    expect(screenState.teams).toEqual([]);
  });

  it('un jugador asignado a un equipo eliminado queda sin equipo', async () => {
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
    const playerId = joined.players[0].id;

    const teamCreated = waitFor<RoomState>(host, 'room_state');
    host.emit('create_team', {
      code: room.code,
      name: 'Rojos',
      color: '#FF0000',
    });
    const withTeam = await teamCreated;
    const teamId = withTeam.teams[0].id;

    const assigned = waitFor<RoomState>(host, 'room_state');
    host.emit('assign_team', { code: room.code, playerId, teamId });
    await assigned;

    const removed = waitFor<RoomState>(host, 'room_state');
    host.emit('remove_team', { code: room.code, teamId });
    const finalState = await removed;

    expect(finalState.teams).toEqual([]);
    expect(finalState.players).toHaveLength(1);
    expect(finalState.players[0].id).toBe(playerId);
  });

  it('devuelve un error al eliminar un equipo inexistente', async () => {
    const host = connect();
    const roomCreated = waitFor<RoomState>(host, 'room_state');
    host.on('connect', () => host.emit('create_room'));
    const room = await roomCreated;

    const errorPromise = waitFor<{ message: string }>(host, 'error');
    host.emit('remove_team', { code: room.code, teamId: 'inexistente' });

    const error = await errorPromise;
    expect(error.message).toBeTruthy();
  });
});
