import { vi } from 'vitest';
import { RoomService } from '../room/room.service.js';
import type { RoomState } from '../room/room.types.js';
import { GameEngineService } from '../game-engine/game-engine.service.js';
import { NotEnoughTeamsError } from '../game-engine/turn-distribution.js';
import { AiContentService } from '../ai-content/ai-content.service.js';
import type { GestureGenerator } from '../ai-content/gesture-generator.js';
import {
  CarasYGestosService,
  GestosMatchAlreadyRunningError,
  NotYourTurnError,
  TurnAlreadyStartedError,
  TurnNotStartedError,
} from './caras-y-gestos.service.js';
import type { CarasYGestosEvent } from './caras-y-gestos.types.js';

const TURN_SECONDS = 60;
const TURN_TRANSITION_DELAY_MS = 2500;
const RESULTS_DISPLAY_MS = 10_000;
const WORDS_PER_TURN = 5;

// Genera `cantidad` palabras sintéticas distintas (nunca repetidas ni en
// excluir) para que AiContentService.isValidGestureBatch las acepte sin caer
// al banco de respaldo real.
function fakeGestureGenerator(): GestureGenerator {
  let counter = 0;
  return {
    generate: vi.fn(async (cantidad: number): Promise<string[]> =>
      Array.from({ length: cantidad }, () => `Palabra${counter++}`),
    ),
  };
}

interface RoomSetup {
  room: RoomState;
  teamA: { teamId: string; playerId: string; socketId: string };
  teamB: { teamId: string; playerId: string; socketId: string };
}

function createRoomWithTwoSoloTeams(rooms: RoomService): RoomSetup {
  const room = rooms.createRoom();
  const withA = rooms.joinRoom(room.code, 'Ana', 'socket-a');
  const withB = rooms.joinRoom(room.code, 'Beto', 'socket-b');
  const withTeamA = rooms.createTeam(room.code, 'Rojos', '#FF0000');
  const withTeamB = rooms.createTeam(room.code, 'Azules', '#0000FF');
  const playerAId = withA.players[0]!.id;
  const playerBId = withB.players[1]!.id;
  const teamAId = withTeamA.teams[0]!.id;
  const teamBId = withTeamB.teams[1]!.id;
  rooms.assignPlayerToTeam(room.code, playerAId, teamAId);
  rooms.assignPlayerToTeam(room.code, playerBId, teamBId);
  return {
    room,
    teamA: { teamId: teamAId, playerId: playerAId, socketId: 'socket-a' },
    teamB: { teamId: teamBId, playerId: playerBId, socketId: 'socket-b' },
  };
}

function turnWaitingEvents(events: CarasYGestosEvent[]) {
  return events.filter((e) => e.type === 'gestos_turn_waiting');
}

function turnStartedEvents(events: CarasYGestosEvent[]) {
  return events.filter((e) => e.type === 'gestos_turn_started');
}

function actorReadyEvents(events: CarasYGestosEvent[]) {
  return events.filter((e) => e.type === 'gestos_actor_ready');
}

function wordUpdateEvents(events: CarasYGestosEvent[]) {
  return events.filter((e) => e.type === 'gestos_word_update');
}

function turnResultEvents(events: CarasYGestosEvent[]) {
  return events.filter((e) => e.type === 'gestos_turn_result');
}

function matchResultEvents(events: CarasYGestosEvent[]) {
  return events.filter((e) => e.type === 'gestos_match_result');
}

describe('CarasYGestosService', () => {
  let rooms: RoomService;
  let gameEngine: GameEngineService;

  beforeEach(() => {
    vi.useFakeTimers();
    rooms = new RoomService();
    gameEngine = new GameEngineService(rooms);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createCarasYGestos(): CarasYGestosService {
    const aiContent = new AiContentService(null, Math.random, fakeGestureGenerator());
    return new CarasYGestosService(rooms, gameEngine, aiContent);
  }

  // Devuelve el jugador (A o B) al que le toca según el evento
  // gestos_turn_waiting más reciente, sin depender de qué equipo arranca al azar.
  function currentTurnPlayer(events: CarasYGestosEvent[], setup: RoomSetup) {
    const [waiting] = turnWaitingEvents(events).slice(-1);
    if (!waiting || waiting.type !== 'gestos_turn_waiting') {
      throw new Error('No se emitió gestos_turn_waiting');
    }
    return waiting.playerId === setup.teamA.playerId ? setup.teamA : setup.teamB;
  }

  it('arranca la partida: identifica al jugador en turno sin arrancar el temporizador todavía', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const gestos = createCarasYGestos();
    const events: CarasYGestosEvent[] = [];
    gestos.events$.subscribe((e) => events.push(e));

    gestos.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);

    expect(turnWaitingEvents(events)).toHaveLength(1);
    expect(turnStartedEvents(events)).toHaveLength(0);
  });

  it('lanza GestosMatchAlreadyRunningError si ya hay una partida en curso', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const gestos = createCarasYGestos();
    gestos.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);

    expect(() => gestos.startMatch(setup.room.code)).toThrow(GestosMatchAlreadyRunningError);
  });

  it('lanza NotEnoughTeamsError si menos de 2 equipos tienen jugadores', () => {
    const room = rooms.createRoom();
    rooms.joinRoom(room.code, 'Ana', 'socket-a');
    const withTeam = rooms.createTeam(room.code, 'Rojos', '#FF0000');
    rooms.assignPlayerToTeam(room.code, room.players[0]?.id ?? '', withTeam.teams[0]!.id);
    const gestos = createCarasYGestos();

    expect(() => gestos.startMatch(room.code)).toThrow(NotEnoughTeamsError);
  });

  it('startTurn: la palabra y el progreso llegan solo a la pantalla, nunca al actor', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const gestos = createCarasYGestos();
    const events: CarasYGestosEvent[] = [];
    gestos.events$.subscribe((e) => events.push(e));

    gestos.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);
    const current = currentTurnPlayer(events, setup);

    gestos.startTurn(setup.room.code, current.socketId);

    const [started] = turnStartedEvents(events);
    expect(started).toMatchObject({
      targetSocketIds: [`${setup.room.code}:screen`],
      playerId: current.playerId,
      durationSeconds: TURN_SECONDS,
      palabrasRestantes: WORDS_PER_TURN,
    });
    expect((started as { palabra: string }).palabra).toBeTruthy();

    const [ready] = actorReadyEvents(events);
    expect(ready).toMatchObject({ targetSocketId: current.socketId });
    expect(ready).not.toHaveProperty('palabra');
  });

  it('startTurn de alguien que no es el jugador del turno actual lanza NotYourTurnError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const gestos = createCarasYGestos();
    const events: CarasYGestosEvent[] = [];
    gestos.events$.subscribe((e) => events.push(e));

    gestos.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);
    const current = currentTurnPlayer(events, setup);
    const other = current === setup.teamA ? setup.teamB : setup.teamA;

    expect(() => gestos.startTurn(setup.room.code, other.socketId)).toThrow(NotYourTurnError);
  });

  it('startTurn dos veces lanza TurnAlreadyStartedError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const gestos = createCarasYGestos();
    const events: CarasYGestosEvent[] = [];
    gestos.events$.subscribe((e) => events.push(e));

    gestos.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);
    const current = currentTurnPlayer(events, setup);

    gestos.startTurn(setup.room.code, current.socketId);

    expect(() => gestos.startTurn(setup.room.code, current.socketId)).toThrow(
      TurnAlreadyStartedError,
    );
  });

  it('markWord antes de startTurn lanza TurnNotStartedError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const gestos = createCarasYGestos();
    const events: CarasYGestosEvent[] = [];
    gestos.events$.subscribe((e) => events.push(e));

    gestos.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);
    const current = currentTurnPlayer(events, setup);

    expect(() => gestos.markWord(setup.room.code, current.socketId, 'adivinada')).toThrow(
      TurnNotStartedError,
    );
  });

  it('"Adivinada" suma un punto y avanza a la siguiente palabra', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const gestos = createCarasYGestos();
    const events: CarasYGestosEvent[] = [];
    gestos.events$.subscribe((e) => events.push(e));

    gestos.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);
    const current = currentTurnPlayer(events, setup);
    gestos.startTurn(setup.room.code, current.socketId);
    const primeraPalabra = (turnStartedEvents(events)[0] as { palabra: string }).palabra;

    gestos.markWord(setup.room.code, current.socketId, 'adivinada');

    const [update] = wordUpdateEvents(events);
    expect(update).toMatchObject({
      targetSocketIds: [`${setup.room.code}:screen`],
      palabrasRestantes: WORDS_PER_TURN - 1,
      motivo: 'adivinada',
    });
    expect((update as { palabra: string }).palabra).not.toBe(primeraPalabra);
    expect(rooms.getRoom(setup.room.code)!.teams.find((t) => t.id === current.teamId)!.score).toBe(
      1,
    );
  });

  it('"Paso" pospone la palabra al final y no suma punto', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const gestos = createCarasYGestos();
    const events: CarasYGestosEvent[] = [];
    gestos.events$.subscribe((e) => events.push(e));

    gestos.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);
    const current = currentTurnPlayer(events, setup);
    gestos.startTurn(setup.room.code, current.socketId);
    const primeraPalabra = (turnStartedEvents(events)[0] as { palabra: string }).palabra;

    gestos.markWord(setup.room.code, current.socketId, 'paso');

    const [update] = wordUpdateEvents(events);
    expect(update).toMatchObject({ palabrasRestantes: WORDS_PER_TURN, motivo: 'paso' });
    expect((update as { palabra: string }).palabra).not.toBe(primeraPalabra);
    expect(rooms.getRoom(setup.room.code)!.teams.find((t) => t.id === current.teamId)!.score).toBe(
      0,
    );

    // La palabra pasada sigue disponible — reaparece tras dar la vuelta completa
    // a las 5 palabras del turno (5 "paso" en total, incluido el de arriba).
    for (let i = 0; i < 4; i++) {
      gestos.markWord(setup.room.code, current.socketId, 'paso');
    }
    const [, , , , quinta] = wordUpdateEvents(events);
    expect((quinta as { palabra: string }).palabra).toBe(primeraPalabra);
  });

  it('las 5 palabras adivinadas antes de tiempo terminan el turno con 5 puntos sin esperar el timer', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const gestos = createCarasYGestos();
    const events: CarasYGestosEvent[] = [];
    gestos.events$.subscribe((e) => events.push(e));

    gestos.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);
    const current = currentTurnPlayer(events, setup);
    gestos.startTurn(setup.room.code, current.socketId);

    for (let i = 0; i < WORDS_PER_TURN; i++) {
      gestos.markWord(setup.room.code, current.socketId, 'adivinada');
    }

    const [result] = turnResultEvents(events);
    expect(result).toMatchObject({
      resultado: {
        playerId: current.playerId,
        puntos: WORDS_PER_TURN,
        motivo: 'completado',
      },
    });
    expect((result as { resultado: { palabrasAdivinadas: string[] } }).resultado.palabrasAdivinadas).toHaveLength(
      WORDS_PER_TURN,
    );
  });

  it('el timer llega a cero con solo N de 5 adivinadas termina con N puntos, sin negativos', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const gestos = createCarasYGestos();
    const events: CarasYGestosEvent[] = [];
    gestos.events$.subscribe((e) => events.push(e));

    gestos.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);
    const current = currentTurnPlayer(events, setup);
    gestos.startTurn(setup.room.code, current.socketId);

    gestos.markWord(setup.room.code, current.socketId, 'adivinada');
    gestos.markWord(setup.room.code, current.socketId, 'adivinada');

    await vi.advanceTimersByTimeAsync(TURN_SECONDS * 1000);

    const [result] = turnResultEvents(events);
    expect(result).toMatchObject({ resultado: { puntos: 2, motivo: 'tiempo' } });
    expect(rooms.getRoom(setup.room.code)!.teams.find((t) => t.id === current.teamId)!.score).toBe(
      2,
    );
  });

  it('se agotan todos los turnos: room.status pasa a resultados y llega gestos_match_result', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const gestos = createCarasYGestos();
    const events: CarasYGestosEvent[] = [];
    gestos.events$.subscribe((e) => events.push(e));

    gestos.startMatch(setup.room.code);

    for (let turn = 0; turn < 6; turn++) {
      await vi.advanceTimersByTimeAsync(0);
      const current = currentTurnPlayer(events, setup);
      gestos.startTurn(setup.room.code, current.socketId);
      for (let i = 0; i < WORDS_PER_TURN; i++) {
        gestos.markWord(setup.room.code, current.socketId, 'adivinada');
      }
      await vi.advanceTimersByTimeAsync(TURN_TRANSITION_DELAY_MS);
    }

    expect(rooms.getRoom(setup.room.code)!.status).toBe('resultados');
    const [matchResult] = matchResultEvents(events);
    expect(matchResult).toMatchObject({
      scores: expect.arrayContaining([
        expect.objectContaining({ teamId: setup.teamA.teamId }),
        expect.objectContaining({ teamId: setup.teamB.teamId }),
      ]),
    });
    const palabrasPorEquipo = (matchResult as { palabrasPorEquipo: Record<string, string[]> })
      .palabrasPorEquipo;
    expect(palabrasPorEquipo[setup.teamA.teamId]).toHaveLength(15); // 3 turnos x 5 palabras
    expect(palabrasPorEquipo[setup.teamB.teamId]).toHaveLength(15);
  });

  it('a los 10s de terminar la partida vuelve a la selección de juego sin resetear el puntaje', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    rooms.selectGame(setup.room.code, 'caras-y-gestos');
    const gestos = createCarasYGestos();
    const events: CarasYGestosEvent[] = [];
    gestos.events$.subscribe((e) => events.push(e));

    gestos.startMatch(setup.room.code);
    for (let turn = 0; turn < 6; turn++) {
      await vi.advanceTimersByTimeAsync(0);
      const current = currentTurnPlayer(events, setup);
      gestos.startTurn(setup.room.code, current.socketId);
      for (let i = 0; i < WORDS_PER_TURN; i++) {
        gestos.markWord(setup.room.code, current.socketId, 'adivinada');
      }
      await vi.advanceTimersByTimeAsync(TURN_TRANSITION_DELAY_MS);
    }

    const scoreBefore = rooms
      .getRoom(setup.room.code)!
      .teams.map((t) => ({ id: t.id, score: t.score }));

    await vi.advanceTimersByTimeAsync(RESULTS_DISPLAY_MS - 1);
    expect(rooms.getRoom(setup.room.code)!.currentGame).toBe('caras-y-gestos');

    await vi.advanceTimersByTimeAsync(1);
    const room = rooms.getRoom(setup.room.code)!;
    expect(room.currentGame).toBeNull();
    expect(room.teams.map((t) => ({ id: t.id, score: t.score }))).toEqual(scoreBefore);
  });

  it('el pool de palabras respeta excluir de una partida anterior en la misma sala', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    rooms.selectGame(setup.room.code, 'caras-y-gestos');
    const generate = vi.fn(async (cantidad: number): Promise<string[]> =>
      Array.from({ length: cantidad }, (_, i) => `Palabra${i}`),
    );
    const aiContent = new AiContentService(null, Math.random, { generate });
    const gestos = new CarasYGestosService(rooms, gameEngine, aiContent);
    const events: CarasYGestosEvent[] = [];
    gestos.events$.subscribe((e) => events.push(e));

    async function playFullMatch() {
      gestos.startMatch(setup.room.code);
      for (let turn = 0; turn < 6; turn++) {
        await vi.advanceTimersByTimeAsync(0);
        const current = currentTurnPlayer(events, setup);
        gestos.startTurn(setup.room.code, current.socketId);
        for (let i = 0; i < WORDS_PER_TURN; i++) {
          gestos.markWord(setup.room.code, current.socketId, 'adivinada');
        }
        await vi.advanceTimersByTimeAsync(TURN_TRANSITION_DELAY_MS);
      }
      await vi.advanceTimersByTimeAsync(RESULTS_DISPLAY_MS);
    }

    await playFullMatch();
    expect(generate).toHaveBeenNthCalledWith(1, 30, []);

    rooms.selectGame(setup.room.code, 'caras-y-gestos');
    await playFullMatch();

    const primeraPartida = Array.from({ length: 30 }, (_, i) => `Palabra${i}`);
    expect(generate).toHaveBeenNthCalledWith(2, 30, primeraPartida);
  });
});
