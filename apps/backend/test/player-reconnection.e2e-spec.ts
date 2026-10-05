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

  interface TeamedPlayer extends Joined {
    socket: Socket;
  }

  // Sala con dos jugadores, cada uno solo en su equipo, con el juego elegido y
  // la pantalla unida a `${code}:screen` (watch_room).
  async function roomWithTwoTeamedPlayers(gameId: string) {
    const screen = connect();
    const created = waitFor<RoomState>(screen, 'room_state');
    screen.on('connect', () => screen.emit('create_room'));
    const { code } = await created;

    async function join(name: string): Promise<TeamedPlayer> {
      const socket = connect();
      const joined = waitFor<Joined>(socket, 'joined');
      socket.on('connect', () => socket.emit('join_room', { code, name }));
      return { socket, ...(await joined) };
    }
    const ana = await join('Ana');
    const beto = await join('Beto');

    for (const [name, color] of [
      ['Rojos', '#FF0000'],
      ['Azules', '#0000FF'],
    ]) {
      const made = waitFor<RoomState>(screen, 'room_state');
      screen.emit('create_team', { code, name, color });
      await made;
    }
    const withTeams = await new Promise<RoomState>((resolve) => {
      screen.once('room_state', resolve);
      screen.emit('watch_room', { code });
    });
    for (const [player, team] of [
      [ana, withTeams.teams[0]!],
      [beto, withTeams.teams[1]!],
    ] as const) {
      const assigned = waitFor<RoomState>(screen, 'room_state');
      screen.emit('assign_team', { code, playerId: player.playerId, teamId: team.id });
      await assigned;
    }
    const selected = waitFor<RoomState>(screen, 'room_state');
    screen.emit('select_game', { code, gameId });
    await selected;

    return { screen, code, ana, beto };
  }

  // Ambos pierden la conexión y vuelven dentro de la gracia (400 ms),
  // registrando lo que reciben de los eventos `events` tras el rejoin.
  async function disconnectAndComeBack(
    code: string,
    players: TeamedPlayer[],
    events: string[],
  ) {
    for (const player of players) player.socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const results: { event: string; payload: any }[][] = [];
    for (const player of players) {
      const socket = connect();
      const received: { event: string; payload: any }[] = [];
      for (const event of events) {
        socket.on(event, (payload) => received.push({ event, payload }));
      }
      const joined = waitFor<Joined>(socket, 'joined');
      socket.on('connect', () =>
        socket.emit('rejoin_room', { code, playerToken: player.playerToken }),
      );
      await joined;
      await new Promise((resolve) => setTimeout(resolve, 150));
      results.push(received);
    }
    return results;
  }

  it('con Trivia en curso, quien reconecta recibe el estado del turno y solo el jugador en turno ve la pregunta', async () => {
    const { screen, code, ana, beto } = await roomWithTwoTeamedPlayers('trivia');

    const started = Promise.race([
      waitFor<{ playerId: string }>(ana.socket, 'trivia_turn_started'),
      waitFor<{ playerId: string }>(beto.socket, 'trivia_turn_started'),
    ]);
    screen.emit('start_trivia_game', { code });
    const { playerId: turnPlayerId } = await started;

    const [anaEvents, betoEvents] = await disconnectAndComeBack(
      code,
      [ana, beto],
      ['trivia_turn_waiting', 'trivia_turn_started', 'trivia_turn_update'],
    );

    const [inTurn, notInTurn] =
      turnPlayerId === ana.playerId
        ? [anaEvents!, betoEvents!]
        : [betoEvents!, anaEvents!];
    expect(inTurn.map((e) => e.event)).toEqual([
      'trivia_turn_waiting',
      'trivia_turn_started',
      'trivia_turn_update',
    ]);
    expect(inTurn[1]!.payload.opciones).toHaveLength(4);
    expect(notInTurn.map((e) => e.event)).toEqual(['trivia_turn_waiting']);
    expect(JSON.stringify(notInTurn)).not.toContain('opciones');
  });

  it('con Caras y Gestos en curso, el actor recupera sus botones y nadie recibe la palabra', async () => {
    const { screen, code, ana, beto } =
      await roomWithTwoTeamedPlayers('caras-y-gestos');

    const waiting = waitFor<{ playerId: string }>(screen, 'gestos_turn_waiting');
    screen.emit('start_gestos_game', { code });
    const actorId = (await waiting).playerId;
    const [actor, other] = actorId === ana.playerId ? [ana, beto] : [beto, ana];

    const actorReady = waitFor(actor.socket, 'gestos_actor_ready');
    actor.socket.emit('start_gestos_turn', { code });
    await actorReady;

    const [anaEvents, betoEvents] = await disconnectAndComeBack(
      code,
      [ana, beto],
      [
        'gestos_turn_waiting',
        'gestos_actor_ready',
        'gestos_turn_started',
        'gestos_word_update',
      ],
    );

    const [actorEvents, otherEvents] =
      actor === ana ? [anaEvents!, betoEvents!] : [betoEvents!, anaEvents!];
    expect(actorEvents.map((e) => e.event)).toEqual(['gestos_actor_ready']);
    expect(otherEvents.map((e) => e.event)).toEqual(['gestos_turn_waiting']);
    expect(other.playerId).not.toBe(actor.playerId);
  });

  it('con Adivina la palabra en curso, el Adivinador recupera su estado y nadie recibe la palabra', async () => {
    const { screen, code, ana, beto } =
      await roomWithTwoTeamedPlayers('adivina-palabra');

    const waiting = waitFor<{ playerId: string }>(screen, 'adivina_turn_waiting');
    screen.emit('start_adivina_palabra_game', { code });
    const guesserId = (await waiting).playerId;
    const guesser = guesserId === ana.playerId ? ana : beto;

    const active = waitFor(guesser.socket, 'adivina_jugador_estado');
    guesser.socket.emit('adivina_ready', { code });
    await active;

    const [anaEvents, betoEvents] = await disconnectAndComeBack(
      code,
      [ana, beto],
      ['adivina_turn_waiting', 'adivina_jugador_estado', 'adivina_pantalla_estado'],
    );

    const [guesserEvents, otherEvents] =
      guesser === ana ? [anaEvents!, betoEvents!] : [betoEvents!, anaEvents!];
    expect(guesserEvents[0]!.event).toBe('adivina_jugador_estado');
    expect(guesserEvents[0]!.payload).toMatchObject({ pasesRestantes: 3 });
    expect(guesserEvents[0]!.payload).not.toHaveProperty('palabra');
    // Los ticks siguen llegando al Adivinador; lo que no puede llegarle a nadie
    // es la pantalla, que es la única que lleva la palabra.
    expect(
      [...guesserEvents, ...otherEvents].some(
        (e) => e.event === 'adivina_pantalla_estado',
      ),
    ).toBe(false);
    expect(otherEvents[0]!.event).toBe('adivina_turn_waiting');
    expect(
      otherEvents.some((e) => e.event === 'adivina_jugador_estado'),
    ).toBe(false);
  });
});
