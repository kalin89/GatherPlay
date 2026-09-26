import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { type AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import type { RoomState } from '../src/room/room.types.js';

interface AdivinaTurnWaitingPayload {
  code: string;
  playerId: string;
  playerName: string;
  teamId: string;
  marcador: { teamId: string; score: number }[];
}

interface AdivinaPantallaEstadoPayload {
  code: string;
  palabra: string | null;
  remainingSeconds: number;
  pasesRestantes: number;
  ultimaAccion: 'adivinada' | 'paso' | null;
}

interface AdivinaJugadorEstadoPayload {
  code: string;
  remainingSeconds: number;
  pasesRestantes: number;
}

interface AdivinaTurnResultPayload {
  code: string;
  resultado: {
    playerId: string;
    playerName: string;
    teamId: string;
    adivinadas: string[];
    pasadas: string[];
    puntos: number;
  };
}

interface AdivinaMatchResultPayload {
  code: string;
  scores: { teamId: string; score: number }[];
  palabrasPorEquipo: { teamId: string; palabras: string[] }[];
}

interface ErrorPayload {
  message: string;
}

const ADIVINA_TURN_SECONDS = 30;
const TOTAL_TURNS = 6; // 2 equipos de 1 jugador x 3 rondas por jugador
const MAX_PASSES_PER_TURN = 3;

// Sin ANTHROPIC_API_KEY en CI, AiContentService usa siempre el banco de
// respaldo, así que las palabras son reales pero no se pueden predecir de
// antemano — estas pruebas no asumen cuáles son.
describe('AdivinaPalabraGateway (e2e)', () => {
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

  // A diferencia de `waitFor` (para el evento que SÍ se espera), esta espera
  // limpia su listener pase lo que pase — si se usara `.once()` + Promise.race
  // contra un timeout, el listener perdedor quedaría colgado y podría
  // dispararse más tarde con un evento legítimo de un turno futuro (falso
  // positivo). Se usa para confirmar que un socket NUNCA recibe cierto evento
  // en una ventana corta.
  function assertNeverEmits(client: Socket, event: string, ms = 200): Promise<boolean> {
    return new Promise((resolve) => {
      let fired = false;
      const handler = () => {
        fired = true;
      };
      client.on(event, handler);
      setTimeout(() => {
        client.off(event, handler);
        resolve(fired);
      }, ms);
    });
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

    // La pantalla se re-suscribe con watch_room, que es lo que la une a la
    // sala `${code}:screen` (join_room/create_room no lo hacen).
    const watched = waitFor<RoomState>(screen, 'room_state');
    screen.emit('watch_room', { code: room.code });
    await watched;

    return { screen, playerA, playerB, playerAId, playerBId, room, teamAId, teamBId };
  }

  // Presiona "Listo", confirma que la palabra llega SOLO a la pantalla y
  // nunca al Adivinador (ni a nadie más), adivina una palabra, pasa hasta el
  // límite (confirmando que un pase de más se rechaza) y espera a que se
  // agote el tiempo del turno.
  async function playTurnToTimeout(
    screen: Socket,
    actor: Socket,
    other: Socket,
    code: string,
    // El chequeo de "other nunca recibe adivina_jugador_estado" solo es
    // inequívoco en el primer turno: a partir del segundo, `other` es el
    // Adivinador del turno anterior, y su propio último tick (remainingSeconds
    // 0, perfectamente legítimo) puede llegar justo en el instante en que
    // arranca el turno siguiente — un falso positivo de timing, no un error
    // real de privacidad (ya verificado sin ambigüedad en el primer turno, y
    // exhaustivamente en adivina-palabra.service.spec.ts).
    checkOtherNeverGetsJugadorEstado: boolean,
  ): Promise<AdivinaTurnResultPayload['resultado']> {
    const pantallaEstado = waitFor<AdivinaPantallaEstadoPayload>(screen, 'adivina_pantalla_estado');
    const jugadorEstado = waitFor<AdivinaJugadorEstadoPayload>(actor, 'adivina_jugador_estado');
    const otherGotPantalla = assertNeverEmits(other, 'adivina_pantalla_estado');
    const otherGotJugador = checkOtherNeverGetsJugadorEstado
      ? assertNeverEmits(other, 'adivina_jugador_estado')
      : null;

    actor.emit('adivina_ready', { code });

    const pantalla = await pantallaEstado;
    expect(pantalla.palabra).toBeTruthy();
    expect(pantalla.pasesRestantes).toBe(MAX_PASSES_PER_TURN);

    const jugador = await jugadorEstado;
    expect(jugador).not.toHaveProperty('palabra');
    expect(await otherGotPantalla).toBe(false);
    if (otherGotJugador) {
      expect(await otherGotJugador).toBe(false);
    }

    const afterGuess = waitFor<AdivinaPantallaEstadoPayload>(screen, 'adivina_pantalla_estado');
    actor.emit('adivina_guess', { code });
    const guessed = await afterGuess;
    expect(guessed.ultimaAccion).toBe('adivinada');
    expect(guessed.palabra).not.toBe(pantalla.palabra);

    for (let i = 0; i < MAX_PASSES_PER_TURN; i++) {
      const afterPass = waitFor<AdivinaPantallaEstadoPayload>(screen, 'adivina_pantalla_estado');
      actor.emit('adivina_pass', { code });
      const passed = await afterPass;
      expect(passed.ultimaAccion).toBe('paso');
      expect(passed.pasesRestantes).toBe(MAX_PASSES_PER_TURN - (i + 1));
    }

    const rejectedPass = waitFor<ErrorPayload>(actor, 'error');
    actor.emit('adivina_pass', { code });
    const rejection = await rejectedPass;
    expect(rejection.message).toContain('límite de pases');

    const resultPromise = waitFor<AdivinaTurnResultPayload>(screen, 'adivina_turn_result');
    const result = await resultPromise;
    return result.resultado;
  }

  it(
    'camino feliz: el Adivinador nunca recibe la palabra y la partida termina con resultado final',
    async () => {
      const { screen, playerA, playerB, playerAId, room } = await createRoomWithTwoSoloTeams();

      const selected = waitFor<RoomState>(screen, 'room_state');
      screen.emit('select_game', { code: room.code, gameId: 'adivina-palabra' });
      await selected;

      const matchResultPromise = waitFor<AdivinaMatchResultPayload>(screen, 'adivina_match_result');

      let waitingEvent = waitFor<AdivinaTurnWaitingPayload>(screen, 'adivina_turn_waiting');
      screen.emit('start_adivina_palabra_game', { code: room.code });

      for (let turn = 0; turn < TOTAL_TURNS; turn++) {
        const waiting = await waitingEvent;
        const actor = waiting.playerId === playerAId ? playerA : playerB;
        const other = actor === playerA ? playerB : playerA;

        const isLastTurn = turn === TOTAL_TURNS - 1;
        if (!isLastTurn) {
          waitingEvent = waitFor<AdivinaTurnWaitingPayload>(screen, 'adivina_turn_waiting');
        }

        const resultado = await playTurnToTimeout(screen, actor, other, room.code, turn === 0);
        expect(resultado.puntos).toBe(1);
        expect(resultado.adivinadas).toHaveLength(1);
      }

      const matchResult = await matchResultPromise;
      expect(matchResult.scores).toHaveLength(2);
      const equipoConPalabras = matchResult.palabrasPorEquipo.find(
        (p) => p.palabras.length > 0,
      );
      expect(equipoConPalabras?.palabras).toHaveLength(3); // 3 turnos x 1 adivinada
    },
    (ADIVINA_TURN_SECONDS * TOTAL_TURNS + 90) * 1000,
  );
});
