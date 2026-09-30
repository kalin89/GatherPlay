import { vi } from 'vitest';
import { RoomService } from '../room/room.service.js';
import type { RoomState } from '../room/room.types.js';
import { GameEngineService } from '../game-engine/game-engine.service.js';
import { NotEnoughTeamsError } from '../game-engine/turn-distribution.js';
import { MemorizaObjetosContentService } from '../memoriza-objetos-content/memoriza-objetos-content.service.js';
import type { MemorizaObjetosBankEntry } from '../memoriza-objetos-content/memoriza-objetos-content.types.js';
import {
  EmptyGuessError,
  MatchAlreadyStartedError,
  MemorizaMatchAlreadyRunningError,
  MemorizaObjetosService,
  NoMemorizaMatchError,
  NotYourTurnError,
  PassNotAvailableYetError,
} from './memoriza-objetos.service.js';
import {
  ATTENTION_SECONDS,
  MEMORIZE_SECONDS,
  PASS_UNLOCK_SECONDS,
  RESULTS_DISPLAY_MS,
  TEAM_CLOCK_SECONDS,
  type MemorizaObjetosEvent,
} from './memoriza-objetos.types.js';

// 20 palabras distintas y sin parecido entre sí (para que isFuzzyMatch nunca
// confunda una con otra por casualidad).
const WORDS = [
  'perro',
  'gato',
  'pez',
  'ave',
  'sol',
  'luna',
  'mesa',
  'silla',
  'carro',
  'pan',
  'flor',
  'nube',
  'rio',
  'mar',
  'sal',
  'miel',
  'oso',
  'vaca',
  'rana',
  'lobo',
];

function makeBank(count: number): MemorizaObjetosBankEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `objeto-${i}`,
    palabra: WORDS[i % WORDS.length]! + (i >= WORDS.length ? `-${i}` : ''),
    imagenUrl: `https://example.com/${i}.svg`,
  }));
}

interface RoomSetup {
  room: RoomState;
  teamA: { teamId: string; playerId: string; socketId: string };
  teamB: { teamId: string; playerId: string; socketId: string };
}

function createRoomWithTwoSoloTeams(rooms: RoomService): RoomSetup {
  const room = rooms.createRoom();
  const withA = rooms.joinRoom(room.code, 'Ana', 'socket-a').room;
  const withB = rooms.joinRoom(room.code, 'Beto', 'socket-b').room;
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

function eventsOfType<T extends MemorizaObjetosEvent['type']>(
  events: MemorizaObjetosEvent[],
  type: T,
): Extract<MemorizaObjetosEvent, { type: T }>[] {
  return events.filter((e): e is Extract<MemorizaObjetosEvent, { type: T }> => e.type === type);
}

// random fijo en 0: elige siempre el primer equipo del Map (= Rojos, creado
// primero) como equipo inicial, y siempre "inicio" como posición de la letra
// revelada — determinismo total para las pruebas.
const fixedRandom = () => 0;

describe('MemorizaObjetosService', () => {
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

  function createMemorizaObjetos(bankSize = 20): MemorizaObjetosService {
    const content = new MemorizaObjetosContentService(fixedRandom, makeBank(bankSize));
    return new MemorizaObjetosService(rooms, gameEngine, content, fixedRandom);
  }

  async function reachGuessingPhase(
    memoriza: MemorizaObjetosService,
    setup: RoomSetup,
  ): Promise<void> {
    memoriza.markReady(setup.room.code, setup.teamA.socketId);
    memoriza.markReady(setup.room.code, setup.teamB.socketId);
    await vi.advanceTimersByTimeAsync(ATTENTION_SECONDS * 1000);
    await vi.advanceTimersByTimeAsync(MEMORIZE_SECONDS * 1000);
  }

  it('lanza NotEnoughTeamsError si menos de 2 equipos tienen jugadores', () => {
    const room = rooms.createRoom();
    rooms.joinRoom(room.code, 'Ana', 'socket-a');
    const withTeam = rooms.createTeam(room.code, 'Rojos', '#FF0000');
    rooms.assignPlayerToTeam(room.code, room.players[0]!.id, withTeam.teams[0]!.id);
    const memoriza = createMemorizaObjetos();

    expect(() => memoriza.startMatch(room.code)).toThrow(NotEnoughTeamsError);
  });

  it('arranca con 20 objetos, sin revelar nada, y pone la sala en jugando', () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    const events: MemorizaObjetosEvent[] = [];
    memoriza.events$.subscribe((e) => events.push(e));

    memoriza.startMatch(setup.room.code);

    const waiting = eventsOfType(events, 'memoriza_waiting_ready');
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.items).toHaveLength(20);
    expect(new Set(waiting[0]!.items.map((i) => i.id)).size).toBe(20);
    expect(rooms.getRoom(setup.room.code)!.status).toBe('jugando');
  });

  it('lanza NoMemorizaMatchError si la sala no tiene partida activa', () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();

    expect(() => memoriza.markReady(setup.room.code, setup.teamA.socketId)).toThrow(
      NoMemorizaMatchError,
    );
    expect(() => memoriza.submitGuess(setup.room.code, setup.teamA.socketId, 'perro')).toThrow(
      NoMemorizaMatchError,
    );
    expect(() => memoriza.passTurn(setup.room.code, setup.teamA.socketId)).toThrow(
      NoMemorizaMatchError,
    );
  });

  it('lanza MemorizaMatchAlreadyRunningError si ya hay una partida en curso', () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    memoriza.startMatch(setup.room.code);

    expect(() => memoriza.startMatch(setup.room.code)).toThrow(MemorizaMatchAlreadyRunningError);
  });

  it('markReady fuera de la fase waiting_ready lanza MatchAlreadyStartedError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    memoriza.startMatch(setup.room.code);
    await reachGuessingPhase(memoriza, setup);

    expect(() => memoriza.markReady(setup.room.code, setup.teamA.socketId)).toThrow(
      MatchAlreadyStartedError,
    );
  });

  it('recorre Pon Mucha Atención (5s) → memorizando (30s, sin palabra) → adivinando con ambos relojes en 90', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    const events: MemorizaObjetosEvent[] = [];
    memoriza.events$.subscribe((e) => events.push(e));
    memoriza.startMatch(setup.room.code);

    memoriza.markReady(setup.room.code, setup.teamA.socketId);
    memoriza.markReady(setup.room.code, setup.teamB.socketId);

    const atencion = eventsOfType(events, 'memoriza_pon_atencion');
    expect(atencion[0]!.remainingSeconds).toBe(ATTENTION_SECONDS);

    await vi.advanceTimersByTimeAsync(ATTENTION_SECONDS * 1000);

    const memorizando = eventsOfType(events, 'memoriza_memorizando');
    expect(memorizando[0]!.remainingSeconds).toBe(MEMORIZE_SECONDS);
    expect(memorizando[0]!.items).toHaveLength(20);
    for (const item of memorizando[0]!.items) {
      expect(item).not.toHaveProperty('palabra');
    }

    await vi.advanceTimersByTimeAsync(MEMORIZE_SECONDS * 1000);

    const tablero = eventsOfType(events, 'memoriza_tablero');
    const last = tablero[tablero.length - 1]!;
    expect(last.clocks).toEqual(
      expect.arrayContaining([
        { teamId: setup.teamA.teamId, remainingSeconds: TEAM_CLOCK_SECONDS },
        { teamId: setup.teamB.teamId, remainingSeconds: TEAM_CLOCK_SECONDS },
      ]),
    );
    expect(last.equipoActivoId).toBe(setup.teamA.teamId);
    expect(last.jugadorActivo?.playerId).toBe(setup.teamA.playerId);
  });

  it('"Enviar" fuera de turno lanza NotYourTurnError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    memoriza.startMatch(setup.room.code);
    await reachGuessingPhase(memoriza, setup);

    expect(() =>
      memoriza.submitGuess(setup.room.code, setup.teamB.socketId, 'perro'),
    ).toThrow(NotYourTurnError);
  });

  it('"Enviar" vacío lanza EmptyGuessError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    memoriza.startMatch(setup.room.code);
    await reachGuessingPhase(memoriza, setup);

    expect(() => memoriza.submitGuess(setup.room.code, setup.teamA.socketId, '   ')).toThrow(
      EmptyGuessError,
    );
  });

  it('acierto (incluido un typo tolerable) revela la palabra, suma un punto y pasa el turno al equipo contrario', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    const events: MemorizaObjetosEvent[] = [];
    memoriza.events$.subscribe((e) => events.push(e));
    memoriza.startMatch(setup.room.code);
    await reachGuessingPhase(memoriza, setup);

    memoriza.submitGuess(setup.room.code, setup.teamA.socketId, 'pero'); // typo de "perro"

    const resultados = eventsOfType(events, 'memoriza_intento_resultado');
    expect(resultados[0]!.acierto).toBe(true);
    expect(resultados[0]!.teamId).toBe(setup.teamA.teamId);
    expect(rooms.getRoom(setup.room.code)!.teams.find((t) => t.id === setup.teamA.teamId)!.score).toBe(1);

    const tablero = eventsOfType(events, 'memoriza_tablero');
    const last = tablero[tablero.length - 1]!;
    expect(last.equipoActivoId).toBe(setup.teamB.teamId);
    const revelado = last.items.find((i) => i.estado === 'revelada');
    expect(revelado?.palabra).toBe('perro');
    expect(revelado?.equipoQueAcerto).toBe(setup.teamA.teamId);
  });

  it('error no revela nada pero igual pasa el turno', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    const events: MemorizaObjetosEvent[] = [];
    memoriza.events$.subscribe((e) => events.push(e));
    memoriza.startMatch(setup.room.code);
    await reachGuessingPhase(memoriza, setup);

    memoriza.submitGuess(setup.room.code, setup.teamA.socketId, 'palabra-inexistente-zzz');

    const resultados = eventsOfType(events, 'memoriza_intento_resultado');
    expect(resultados[0]!.acierto).toBe(false);
    expect(rooms.getRoom(setup.room.code)!.teams.find((t) => t.id === setup.teamA.teamId)!.score).toBe(0);

    const tablero = eventsOfType(events, 'memoriza_tablero');
    expect(tablero[tablero.length - 1]!.equipoActivoId).toBe(setup.teamB.teamId);
  });

  it('"Pasar" antes de los 10 segundos lanza PassNotAvailableYetError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    memoriza.startMatch(setup.room.code);
    await reachGuessingPhase(memoriza, setup);

    expect(() => memoriza.passTurn(setup.room.code, setup.teamA.socketId)).toThrow(
      PassNotAvailableYetError,
    );
  });

  it('"Pasar" después de los 10 segundos pasa el turno sin revelar nada, pero suena como un error', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    const events: MemorizaObjetosEvent[] = [];
    memoriza.events$.subscribe((e) => events.push(e));
    memoriza.startMatch(setup.room.code);
    await reachGuessingPhase(memoriza, setup);

    await vi.advanceTimersByTimeAsync(PASS_UNLOCK_SECONDS * 1000);
    memoriza.passTurn(setup.room.code, setup.teamA.socketId);

    // Mismo evento que un intento fallido (acierto: false, sin palabra) — la
    // pantalla reacciona con el mismo sonido de error, "Pasar" no queda mudo.
    const resultados = eventsOfType(events, 'memoriza_intento_resultado');
    expect(resultados).toEqual([
      { type: 'memoriza_intento_resultado', code: setup.room.code, teamId: setup.teamA.teamId, acierto: false, palabra: null },
    ]);
    const tablero = eventsOfType(events, 'memoriza_tablero');
    expect(tablero[tablero.length - 1]!.equipoActivoId).toBe(setup.teamB.teamId);
  });

  it('el reloj del equipo activo llega a 0 a mitad de turno: el turno pasa automáticamente al contrario', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    const events: MemorizaObjetosEvent[] = [];
    memoriza.events$.subscribe((e) => events.push(e));
    memoriza.startMatch(setup.room.code);
    await reachGuessingPhase(memoriza, setup);

    await vi.advanceTimersByTimeAsync(TEAM_CLOCK_SECONDS * 1000);

    const tablero = eventsOfType(events, 'memoriza_tablero');
    const last = tablero[tablero.length - 1]!;
    expect(last.equipoActivoId).toBe(setup.teamB.teamId);
    expect(last.clocks.find((c) => c.teamId === setup.teamA.teamId)!.remainingSeconds).toBe(0);
  });

  it('un equipo en 0 y el otro con tiempo: solo ese equipo sigue jugando sin volver a alternar', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    const events: MemorizaObjetosEvent[] = [];
    memoriza.events$.subscribe((e) => events.push(e));
    memoriza.startMatch(setup.room.code);
    await reachGuessingPhase(memoriza, setup);

    // Equipo A se queda sin tiempo.
    await vi.advanceTimersByTimeAsync(TEAM_CLOCK_SECONDS * 1000);
    const turnNumberAlEmpezarB = eventsOfType(events, 'memoriza_tablero').at(-1)!.turnNumber;

    // Equipo B pasa dos turnos seguidos (a sí mismo, sin acertar) sin que A
    // vuelva a aparecer como activo.
    memoriza.submitGuess(setup.room.code, setup.teamB.socketId, 'zzz-no-existe-1');
    const turnNumberTrasElPrimerIntento = eventsOfType(events, 'memoriza_tablero').at(-1)!.turnNumber;
    memoriza.submitGuess(setup.room.code, setup.teamB.socketId, 'zzz-no-existe-2');

    const tablero = eventsOfType(events, 'memoriza_tablero');
    const last = tablero[tablero.length - 1]!;
    expect(last.equipoActivoId).toBe(setup.teamB.teamId);
    expect(last.jugadorActivo?.playerId).toBe(setup.teamB.playerId);
    // `turnNumber` sube en cada turno nuevo aunque el jugador activo sea
    // siempre el mismo — es lo que le permite al celular de B resetear su
    // formulario de respuesta entre un intento y el siguiente.
    expect(turnNumberTrasElPrimerIntento).toBeGreaterThan(turnNumberAlEmpezarB);
    expect(last.turnNumber).toBeGreaterThan(turnNumberTrasElPrimerIntento);
  });

  it('turnNumber se mantiene igual entre los tableros que emite el tick de reloj dentro de un mismo turno', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    const events: MemorizaObjetosEvent[] = [];
    memoriza.events$.subscribe((e) => events.push(e));
    memoriza.startMatch(setup.room.code);
    await reachGuessingPhase(memoriza, setup);

    await vi.advanceTimersByTimeAsync(3000);

    const tablero = eventsOfType(events, 'memoriza_tablero');
    const turnNumbers = new Set(tablero.map((t) => t.turnNumber));
    expect(turnNumbers.size).toBe(1);
  });

  it('ambos relojes en 0 termina la partida', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    const events: MemorizaObjetosEvent[] = [];
    memoriza.events$.subscribe((e) => events.push(e));
    memoriza.startMatch(setup.room.code);
    await reachGuessingPhase(memoriza, setup);

    // Equipo A se agota; el turno pasa a B, que también se deja agotar.
    await vi.advanceTimersByTimeAsync(TEAM_CLOCK_SECONDS * 1000);
    await vi.advanceTimersByTimeAsync(TEAM_CLOCK_SECONDS * 1000);

    expect(rooms.getRoom(setup.room.code)!.status).toBe('resultados');
    expect(eventsOfType(events, 'memoriza_match_result')).toHaveLength(1);
  });

  it('se revelan las 20 palabras antes de que se acabe el tiempo: termina igual', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    const events: MemorizaObjetosEvent[] = [];
    memoriza.events$.subscribe((e) => events.push(e));
    memoriza.startMatch(setup.room.code);
    await reachGuessingPhase(memoriza, setup);

    for (let i = 0; i < WORDS.length; i++) {
      const activeSocket =
        eventsOfType(events, 'memoriza_tablero').at(-1)!.equipoActivoId === setup.teamA.teamId
          ? setup.teamA.socketId
          : setup.teamB.socketId;
      memoriza.submitGuess(setup.room.code, activeSocket, WORDS[i]!);
    }

    expect(rooms.getRoom(setup.room.code)!.status).toBe('resultados');
    const matchResult = eventsOfType(events, 'memoriza_match_result');
    expect(matchResult).toHaveLength(1);
    const totalScore = matchResult[0]!.scores.reduce((acc, s) => acc + s.score, 0);
    expect(totalScore).toBe(20);
  });

  it('el resultado trae el puntaje de esta partida, no el acumulado entre partidas', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    const events: MemorizaObjetosEvent[] = [];
    memoriza.events$.subscribe((e) => events.push(e));
    memoriza.startMatch(setup.room.code);
    await reachGuessingPhase(memoriza, setup);
    memoriza.submitGuess(setup.room.code, setup.teamA.socketId, 'perro');
    await vi.advanceTimersByTimeAsync(TEAM_CLOCK_SECONDS * 1000); // agota a B
    await vi.advanceTimersByTimeAsync(TEAM_CLOCK_SECONDS * 1000); // agota a A

    const matchResult = eventsOfType(events, 'memoriza_match_result').at(-1)!;
    expect(matchResult.scores.find((s) => s.teamId === setup.teamA.teamId)!.score).toBe(1);
  });

  it('memoriza_match_result revela las 20 palabras: la adivinada con su equipo, el resto sin equipo', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    const events: MemorizaObjetosEvent[] = [];
    memoriza.events$.subscribe((e) => events.push(e));
    memoriza.startMatch(setup.room.code);
    await reachGuessingPhase(memoriza, setup);
    memoriza.submitGuess(setup.room.code, setup.teamA.socketId, 'perro');
    await vi.advanceTimersByTimeAsync(TEAM_CLOCK_SECONDS * 1000); // agota a B
    await vi.advanceTimersByTimeAsync(TEAM_CLOCK_SECONDS * 1000); // agota a A

    const matchResult = eventsOfType(events, 'memoriza_match_result').at(-1)!;
    expect(matchResult.items).toHaveLength(20);
    expect(matchResult.items.every((i) => i.estado === 'revelada')).toBe(true);
    expect(matchResult.items.every((i) => i.palabra !== null)).toBe(true);

    const acertada = matchResult.items.find((i) => i.palabra === 'perro')!;
    expect(acertada.equipoQueAcerto).toBe(setup.teamA.teamId);

    const sinAdivinar = matchResult.items.filter((i) => i.palabra !== 'perro');
    expect(sinAdivinar.every((i) => i.equipoQueAcerto === null)).toBe(true);
  });

  it('a los RESULTS_DISPLAY_MS, currentGame vuelve a null', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos();
    memoriza.startMatch(setup.room.code);
    rooms.selectGame(setup.room.code, 'memoriza-objetos');
    await reachGuessingPhase(memoriza, setup);
    await vi.advanceTimersByTimeAsync(TEAM_CLOCK_SECONDS * 1000);
    await vi.advanceTimersByTimeAsync(TEAM_CLOCK_SECONDS * 1000);

    await vi.advanceTimersByTimeAsync(RESULTS_DISPLAY_MS);

    expect(rooms.getRoom(setup.room.code)!.currentGame).toBeNull();
  });

  it('dos partidas seguidas en la misma sala no repiten objetos mientras el banco alcance', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const memoriza = createMemorizaObjetos(50);
    const events: MemorizaObjetosEvent[] = [];
    memoriza.events$.subscribe((e) => events.push(e));

    memoriza.startMatch(setup.room.code);
    const firstIds = new Set(eventsOfType(events, 'memoriza_waiting_ready')[0]!.items.map((i) => i.id));
    await reachGuessingPhase(memoriza, setup);
    await vi.advanceTimersByTimeAsync(TEAM_CLOCK_SECONDS * 1000);
    await vi.advanceTimersByTimeAsync(TEAM_CLOCK_SECONDS * 1000);

    memoriza.startMatch(setup.room.code);
    const secondIds = new Set(
      eventsOfType(events, 'memoriza_waiting_ready').at(-1)!.items.map((i) => i.id),
    );

    const overlap = [...firstIds].filter((id) => secondIds.has(id));
    expect(overlap).toHaveLength(0);
  });

  describe('cierre de sala (RoomService.closeRoom)', () => {
    it('detiene los relojes en curso: avanzar el reloj ya no emite nada y no hay partida', async () => {
      const setup = createRoomWithTwoSoloTeams(rooms);
      const memoriza = createMemorizaObjetos();
      const events: MemorizaObjetosEvent[] = [];
      memoriza.events$.subscribe((e) => events.push(e));
      memoriza.startMatch(setup.room.code);
      await reachGuessingPhase(memoriza, setup);
      const eventsBeforeClose = events.length;

      rooms.closeRoom(setup.room.code);
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

      expect(events).toHaveLength(eventsBeforeClose);
      expect(() => memoriza.passTurn(setup.room.code, setup.teamA.socketId)).toThrow(
        NoMemorizaMatchError,
      );
    });

    it('borra el acumulador de objetos ya usados de la sala', () => {
      const setup = createRoomWithTwoSoloTeams(rooms);
      const memoriza = createMemorizaObjetos();
      memoriza.startMatch(setup.room.code);
      const internals = memoriza as unknown as { roomUsedObjects: Map<string, unknown> };
      expect(internals.roomUsedObjects.size).toBe(1);

      rooms.closeRoom(setup.room.code);

      expect(internals.roomUsedObjects.size).toBe(0);
    });

    it('es idempotente y no falla si la sala nunca tuvo partida', () => {
      const setup = createRoomWithTwoSoloTeams(rooms);
      const memoriza = createMemorizaObjetos();

      expect(() => {
        memoriza.disposeRoom(setup.room.code);
        memoriza.disposeRoom(setup.room.code);
      }).not.toThrow();
    });
  });
});
