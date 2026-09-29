import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { type AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import type { RoomState } from '../src/room/room.types.js';
import { OBJECT_BANK } from '../src/memoriza-objetos-content/object-bank.js';

interface MemorizaWaitingReadyPayload {
  code: string;
  readyPlayerIds: string[];
  eligiblePlayerIds: string[];
  items: { id: string; imagenUrl: string }[];
}

interface MemorizaMemorizandoPayload {
  code: string;
  items: { id: string; imagenUrl: string }[];
  remainingSeconds: number;
}

interface MemorizaBoardItemPayload {
  id: string;
  imagenUrl: string;
  pista: string;
  estado: 'oculta' | 'revelada';
  equipoQueAcerto: string | null;
  palabra: string | null;
}

interface MemorizaTableroPayload {
  code: string;
  items: MemorizaBoardItemPayload[];
  clocks: { teamId: string; remainingSeconds: number }[];
  equipoActivoId: string | null;
  jugadorActivo: { teamId: string; playerId: string; playerName: string } | null;
}

interface MemorizaMatchResultPayload {
  code: string;
  scores: { teamId: string; score: number }[];
  palabrasPorEquipo: { teamId: string; palabras: string[] }[];
}

const ATTENTION_SECONDS = 5;
const MEMORIZE_SECONDS = 30;
const OBJECTS_PER_MATCH = 20;

// El banco de imágenes es real acá (sin bancos de prueba inyectados como en
// el spec unitario), así que las palabras del tablero no se pueden predecir
// de antemano — se resuelven en el momento a partir de OBJECT_BANK (id →
// palabra), igual que hace cualquier cliente real leyendo `spec.md`.
const PALABRA_POR_ID = new Map(OBJECT_BANK.map((entry) => [entry.id, entry.palabra]));

describe('MemorizaObjetosGateway (e2e)', () => {
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

    return { screen, playerA, playerB, playerAId, playerBId, room };
  }

  it(
    'camino feliz: memorización animada por el servidor, adivinanza con reloj de equipo, y resultado final con las 20 palabras adivinadas',
    async () => {
      const { screen, playerA, playerB, playerAId, playerBId, room } =
        await createRoomWithTwoSoloTeams();

      const selected = waitFor<RoomState>(screen, 'room_state');
      screen.emit('select_game', { code: room.code, gameId: 'memoriza-objetos' });
      await selected;

      const waitingReady = waitFor<MemorizaWaitingReadyPayload>(screen, 'memoriza_waiting_ready');
      screen.emit('start_memoriza_objetos_game', { code: room.code });
      const waiting = await waitingReady;
      expect(waiting.items).toHaveLength(OBJECTS_PER_MATCH);
      expect(waiting.eligiblePlayerIds).toHaveLength(2);

      const memorizando = waitFor<MemorizaMemorizandoPayload>(screen, 'memoriza_memorizando');
      playerA.emit('memoriza_ready', { code: room.code });
      playerB.emit('memoriza_ready', { code: room.code });
      const memorizandoPayload = await memorizando;
      expect(memorizandoPayload.remainingSeconds).toBe(MEMORIZE_SECONDS);
      for (const item of memorizandoPayload.items) {
        expect(item).not.toHaveProperty('palabra');
      }

      const primerTablero = waitFor<MemorizaTableroPayload>(screen, 'memoriza_tablero');
      const tablero = await primerTablero;
      expect(tablero.clocks).toHaveLength(2);
      expect(tablero.equipoActivoId).toBeTruthy();

      // Cada equipo adivina todas las palabras correctamente hasta terminar
      // la partida, sin dejar correr ningún reloj hasta cero — el camino
      // feliz completo, dentro de un tiempo de ejecución razonable.
      const matchResultPromise = waitFor<MemorizaMatchResultPayload>(screen, 'memoriza_match_result');

      let current = tablero;
      let acertadas = 0;
      while (acertadas < OBJECTS_PER_MATCH) {
        const oculta = current.items.find((i) => i.estado === 'oculta');
        if (!oculta) break;
        const palabra = PALABRA_POR_ID.get(oculta.id)!;
        const actor = current.jugadorActivo!.playerId === playerAId ? playerA : playerB;
        expect([playerAId, playerBId]).toContain(current.jugadorActivo!.playerId);

        const nextTablero = waitFor<MemorizaTableroPayload>(screen, 'memoriza_tablero');
        actor.emit('memoriza_submit_guess', { code: room.code, texto: palabra });
        acertadas += 1;
        if (acertadas < OBJECTS_PER_MATCH) {
          current = await nextTablero;
        }
      }

      const matchResult = await matchResultPromise;
      expect(matchResult.scores).toHaveLength(2);
      const totalScore = matchResult.scores.reduce((acc, s) => acc + s.score, 0);
      expect(totalScore).toBe(OBJECTS_PER_MATCH);
      const totalPalabras = matchResult.palabrasPorEquipo.reduce(
        (acc, p) => acc + p.palabras.length,
        0,
      );
      expect(totalPalabras).toBe(OBJECTS_PER_MATCH);
    },
    (ATTENTION_SECONDS + MEMORIZE_SECONDS + 60) * 1000,
  );
});
