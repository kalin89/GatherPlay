import { vi } from 'vitest';
import { RoomService } from '../room/room.service.js';
import type { RoomState } from '../room/room.types.js';
import { GameEngineService } from '../game-engine/game-engine.service.js';
import { NotEnoughTeamsError } from '../game-engine/turn-distribution.js';
import { AiContentService } from '../ai-content/ai-content.service.js';
import type { WordGenerator } from '../ai-content/word-generator.js';
import {
  AdivinaPalabraService,
  AdivinaMatchAlreadyRunningError,
  NotYourTurnError,
  PassLimitReachedError,
  TurnAlreadyStartedError,
  TurnNotStartedError,
} from './adivina-palabra.service.js';
import type { AdivinaPalabraEvent } from './adivina-palabra.types.js';

const ADIVINA_TURN_SECONDS = 30;
const RESULTS_DISPLAY_MS = 10_000;

// Genera palabras sintéticas distintas (nunca repetidas ni en excluir) para
// que AiContentService las acepte sin caer al banco de respaldo real.
function fakeWordGenerator(): WordGenerator {
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

function turnWaitingEvents(events: AdivinaPalabraEvent[]) {
  return events.filter((e) => e.type === 'adivina_turn_waiting');
}
function pantallaEstadoEvents(events: AdivinaPalabraEvent[]) {
  return events.filter((e) => e.type === 'adivina_pantalla_estado');
}
function jugadorEstadoEvents(events: AdivinaPalabraEvent[]) {
  return events.filter((e) => e.type === 'adivina_jugador_estado');
}
function turnResultEvents(events: AdivinaPalabraEvent[]) {
  return events.filter((e) => e.type === 'adivina_turn_result');
}
function matchResultEvents(events: AdivinaPalabraEvent[]) {
  return events.filter((e) => e.type === 'adivina_match_result');
}

describe('AdivinaPalabraService', () => {
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

  function createAdivinaPalabra(): AdivinaPalabraService {
    const aiContent = new AiContentService(null, Math.random, null, fakeWordGenerator());
    return new AdivinaPalabraService(rooms, gameEngine, aiContent);
  }

  function currentTurnPlayer(events: AdivinaPalabraEvent[], setup: RoomSetup) {
    const [waiting] = turnWaitingEvents(events).slice(-1);
    if (!waiting || waiting.type !== 'adivina_turn_waiting') {
      throw new Error('No se emitió adivina_turn_waiting');
    }
    return waiting.playerId === setup.teamA.playerId ? setup.teamA : setup.teamB;
  }

  it('arranca la partida con el reparto de turnos correcto, sin arrancar el timer todavía', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const adivina = createAdivinaPalabra();
    const events: AdivinaPalabraEvent[] = [];
    adivina.events$.subscribe((e) => events.push(e));

    await adivina.startMatch(setup.room.code);

    expect(turnWaitingEvents(events)).toHaveLength(1);
    expect(pantallaEstadoEvents(events)).toHaveLength(0);
    expect(rooms.getRoom(setup.room.code)!.status).toBe('jugando');
  });

  it('lanza AdivinaMatchAlreadyRunningError si ya hay una partida en curso', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const adivina = createAdivinaPalabra();
    await adivina.startMatch(setup.room.code);

    await expect(adivina.startMatch(setup.room.code)).rejects.toThrow(
      AdivinaMatchAlreadyRunningError,
    );
  });

  it('lanza NotEnoughTeamsError si menos de 2 equipos tienen jugadores', async () => {
    const room = rooms.createRoom();
    rooms.joinRoom(room.code, 'Ana', 'socket-a');
    const withTeam = rooms.createTeam(room.code, 'Rojos', '#FF0000');
    rooms.assignPlayerToTeam(room.code, room.players[0]?.id ?? '', withTeam.teams[0]!.id);
    const adivina = createAdivinaPalabra();

    await expect(adivina.startMatch(room.code)).rejects.toThrow(NotEnoughTeamsError);
  });

  it('"Listo" fuera de turno lanza NotYourTurnError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const adivina = createAdivinaPalabra();
    const events: AdivinaPalabraEvent[] = [];
    adivina.events$.subscribe((e) => events.push(e));

    await adivina.startMatch(setup.room.code);
    const current = currentTurnPlayer(events, setup);
    const other = current === setup.teamA ? setup.teamB : setup.teamA;

    expect(() => adivina.markReady(setup.room.code, other.socketId)).toThrow(NotYourTurnError);
  });

  it('"Listo" arranca el timer y revela la palabra solo a la pantalla, nunca al jugador', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const adivina = createAdivinaPalabra();
    const events: AdivinaPalabraEvent[] = [];
    adivina.events$.subscribe((e) => events.push(e));

    await adivina.startMatch(setup.room.code);
    const current = currentTurnPlayer(events, setup);

    adivina.markReady(setup.room.code, current.socketId);

    const [pantalla] = pantallaEstadoEvents(events);
    expect(pantalla).toMatchObject({
      targetSocketIds: [`${setup.room.code}:screen`],
      remainingSeconds: ADIVINA_TURN_SECONDS,
      pasesRestantes: 3,
      ultimaAccion: null,
    });
    expect((pantalla as { palabra: string }).palabra).toBeTruthy();

    const [jugador] = jugadorEstadoEvents(events);
    expect(jugador).toMatchObject({
      targetSocketIds: [current.socketId],
      remainingSeconds: ADIVINA_TURN_SECONDS,
      pasesRestantes: 3,
    });
    expect(jugador).not.toHaveProperty('palabra');
  });

  it('"Listo" dos veces lanza TurnAlreadyStartedError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const adivina = createAdivinaPalabra();
    const events: AdivinaPalabraEvent[] = [];
    adivina.events$.subscribe((e) => events.push(e));

    await adivina.startMatch(setup.room.code);
    const current = currentTurnPlayer(events, setup);
    adivina.markReady(setup.room.code, current.socketId);

    expect(() => adivina.markReady(setup.room.code, current.socketId)).toThrow(
      TurnAlreadyStartedError,
    );
  });

  it('"Adivinada"/"Paso" antes de "Listo" lanzan TurnNotStartedError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const adivina = createAdivinaPalabra();
    const events: AdivinaPalabraEvent[] = [];
    adivina.events$.subscribe((e) => events.push(e));

    await adivina.startMatch(setup.room.code);
    const current = currentTurnPlayer(events, setup);

    expect(() => adivina.markGuessed(setup.room.code, current.socketId)).toThrow(
      TurnNotStartedError,
    );
    expect(() => adivina.markPassed(setup.room.code, current.socketId)).toThrow(
      TurnNotStartedError,
    );
  });

  it('"Adivinada" revela la siguiente palabra de inmediato; el punto se acredita al cerrar el turno', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const adivina = createAdivinaPalabra();
    const events: AdivinaPalabraEvent[] = [];
    adivina.events$.subscribe((e) => events.push(e));

    await adivina.startMatch(setup.room.code);
    const current = currentTurnPlayer(events, setup);
    adivina.markReady(setup.room.code, current.socketId);
    const primeraPalabra = (pantallaEstadoEvents(events)[0] as { palabra: string }).palabra;

    adivina.markGuessed(setup.room.code, current.socketId);

    const pantallaEventos = pantallaEstadoEvents(events);
    const ultima = pantallaEventos[pantallaEventos.length - 1] as {
      palabra: string;
      ultimaAccion: string;
    };
    expect(ultima.ultimaAccion).toBe('adivinada');
    expect(ultima.palabra).not.toBe(primeraPalabra);
    // El puntaje acumulado del equipo (team.score) recién se acredita al
    // cerrar el turno (resolveTurnEnd) — mismo criterio que Trivia/Gestos de
    // no tocar el marcador acumulado a mitad de un turno en curso.
    expect(rooms.getRoom(setup.room.code)!.teams.find((t) => t.id === current.teamId)!.score).toBe(
      0,
    );

    await vi.advanceTimersByTimeAsync(ADIVINA_TURN_SECONDS * 1000);

    expect(rooms.getRoom(setup.room.code)!.teams.find((t) => t.id === current.teamId)!.score).toBe(
      1,
    );
  });

  it('"Paso" no suma puntos, descarta la palabra y decrementa pasesRestantes', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const adivina = createAdivinaPalabra();
    const events: AdivinaPalabraEvent[] = [];
    adivina.events$.subscribe((e) => events.push(e));

    await adivina.startMatch(setup.room.code);
    const current = currentTurnPlayer(events, setup);
    adivina.markReady(setup.room.code, current.socketId);
    const primeraPalabra = (pantallaEstadoEvents(events)[0] as { palabra: string }).palabra;

    adivina.markPassed(setup.room.code, current.socketId);

    const pantallaEventos = pantallaEstadoEvents(events);
    const ultima = pantallaEventos[pantallaEventos.length - 1] as {
      palabra: string;
      ultimaAccion: string;
      pasesRestantes: number;
    };
    expect(ultima.ultimaAccion).toBe('paso');
    expect(ultima.palabra).not.toBe(primeraPalabra);
    expect(ultima.pasesRestantes).toBe(2);
    expect(rooms.getRoom(setup.room.code)!.teams.find((t) => t.id === current.teamId)!.score).toBe(
      0,
    );
  });

  it('al cuarto "Paso" en el mismo turno lanza PassLimitReachedError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const adivina = createAdivinaPalabra();
    const events: AdivinaPalabraEvent[] = [];
    adivina.events$.subscribe((e) => events.push(e));

    await adivina.startMatch(setup.room.code);
    const current = currentTurnPlayer(events, setup);
    adivina.markReady(setup.room.code, current.socketId);

    adivina.markPassed(setup.room.code, current.socketId);
    adivina.markPassed(setup.room.code, current.socketId);
    adivina.markPassed(setup.room.code, current.socketId);

    expect(() => adivina.markPassed(setup.room.code, current.socketId)).toThrow(
      PassLimitReachedError,
    );
  });

  it('se acaba el tiempo con una palabra a medio mostrar: aparece en pasadas sin afectar pasesRestantes', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const adivina = createAdivinaPalabra();
    const events: AdivinaPalabraEvent[] = [];
    adivina.events$.subscribe((e) => events.push(e));

    await adivina.startMatch(setup.room.code);
    const current = currentTurnPlayer(events, setup);
    adivina.markReady(setup.room.code, current.socketId);
    adivina.markGuessed(setup.room.code, current.socketId);
    adivina.markPassed(setup.room.code, current.socketId);
    // La palabra que queda mostrada sin resolver es la que sigue después del
    // último "Paso" — la que se corta a mitad de mostrar cuando llega el
    // timeout.
    const palabraAMedioMostrar = (pantallaEstadoEvents(events).slice(-1)[0] as { palabra: string })
      .palabra;

    await vi.advanceTimersByTimeAsync(ADIVINA_TURN_SECONDS * 1000);

    const [result] = turnResultEvents(events);
    const resultado = (result as { resultado: { adivinadas: string[]; pasadas: string[]; puntos: number } })
      .resultado;
    expect(resultado.puntos).toBe(1);
    expect(resultado.pasadas).toContain(palabraAMedioMostrar);
  });

  it('se agotan todos los turnos: room.status pasa a resultados y llega adivina_match_result', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const adivina = createAdivinaPalabra();
    const events: AdivinaPalabraEvent[] = [];
    adivina.events$.subscribe((e) => events.push(e));

    await adivina.startMatch(setup.room.code);

    for (let turn = 0; turn < 6; turn++) {
      const current = currentTurnPlayer(events, setup);
      adivina.markReady(setup.room.code, current.socketId);
      adivina.markGuessed(setup.room.code, current.socketId);
      await vi.advanceTimersByTimeAsync(ADIVINA_TURN_SECONDS * 1000);
    }

    expect(rooms.getRoom(setup.room.code)!.status).toBe('resultados');
    const [matchResult] = matchResultEvents(events);
    expect(matchResult).toMatchObject({
      scores: expect.arrayContaining([
        expect.objectContaining({ teamId: setup.teamA.teamId }),
        expect.objectContaining({ teamId: setup.teamB.teamId }),
      ]),
    });
    const palabrasPorEquipo = (
      matchResult as { palabrasPorEquipo: { teamId: string; palabras: string[] }[] }
    ).palabrasPorEquipo;
    const equipoA = palabrasPorEquipo.find((p) => p.teamId === setup.teamA.teamId);
    expect(equipoA?.palabras).toHaveLength(3); // 3 turnos x 1 adivinada
  });

  it('a los 10s de terminar la partida vuelve a la selección de juego sin resetear el puntaje', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    rooms.selectGame(setup.room.code, 'adivina-palabra');
    const adivina = createAdivinaPalabra();
    const events: AdivinaPalabraEvent[] = [];
    adivina.events$.subscribe((e) => events.push(e));

    await adivina.startMatch(setup.room.code);
    for (let turn = 0; turn < 6; turn++) {
      const current = currentTurnPlayer(events, setup);
      adivina.markReady(setup.room.code, current.socketId);
      adivina.markGuessed(setup.room.code, current.socketId);
      await vi.advanceTimersByTimeAsync(ADIVINA_TURN_SECONDS * 1000);
    }

    const scoreBefore = rooms
      .getRoom(setup.room.code)!
      .teams.map((t) => ({ id: t.id, score: t.score }));

    await vi.advanceTimersByTimeAsync(RESULTS_DISPLAY_MS - 1);
    expect(rooms.getRoom(setup.room.code)!.currentGame).toBe('adivina-palabra');

    await vi.advanceTimersByTimeAsync(1);
    const room = rooms.getRoom(setup.room.code)!;
    expect(room.currentGame).toBeNull();
    expect(room.teams.map((t) => ({ id: t.id, score: t.score }))).toEqual(scoreBefore);
  });

  it('dos partidas seguidas no repiten palabras: reusa lo sin mostrar antes de pedir más a la IA', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    rooms.selectGame(setup.room.code, 'adivina-palabra');
    let counter = 0;
    const generate = vi.fn(async (cantidad: number): Promise<string[]> =>
      Array.from({ length: cantidad }, () => `Palabra${counter++}`),
    );
    const aiContent = new AiContentService(null, Math.random, null, { generate });
    const adivina = new AdivinaPalabraService(rooms, gameEngine, aiContent);
    const events: AdivinaPalabraEvent[] = [];
    adivina.events$.subscribe((e) => events.push(e));

    async function playFullMatch(mostradas: string[]) {
      await adivina.startMatch(setup.room.code);
      for (let turn = 0; turn < 6; turn++) {
        const current = currentTurnPlayer(events, setup);
        adivina.markReady(setup.room.code, current.socketId);
        mostradas.push((pantallaEstadoEvents(events).slice(-1)[0] as { palabra: string }).palabra);
        adivina.markGuessed(setup.room.code, current.socketId);
        mostradas.push((pantallaEstadoEvents(events).slice(-1)[0] as { palabra: string }).palabra);
        await vi.advanceTimersByTimeAsync(ADIVINA_TURN_SECONDS * 1000);
      }
      await vi.advanceTimersByTimeAsync(RESULTS_DISPLAY_MS);
    }

    const mostradasPrimeraPartida: string[] = [];
    await playFullMatch(mostradasPrimeraPartida);
    // Pool inicial: 90 = WORDS_PER_TURN_ESTIMATE(15) x 6 turnos, pedidas de una
    // sola vez y sin exclusión (primera partida de la sala).
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenNthCalledWith(1, 90, []);

    rooms.selectGame(setup.room.code, 'adivina-palabra');
    const mostradasSegundaPartida: string[] = [];
    await playFullMatch(mostradasSegundaPartida);

    // Cada turno consume 2 palabras de la cola (la que se muestra al
    // presionar Listo + la que queda a medio mostrar al cortar el tiempo, ya
    // que se adivina de inmediato) => 12 usadas de las 90, quedan 78 sin
    // mostrar que vuelven al pool. La segunda partida solo le pide a la IA el
    // faltante (90 - 78 = 12), nunca los 90 completos de nuevo.
    expect(generate).toHaveBeenCalledTimes(2);
    const segundaLlamada = generate.mock.calls[1]!;
    expect(segundaLlamada[0]).toBe(12);

    const repetidas = mostradasSegundaPartida.filter((p) => mostradasPrimeraPartida.includes(p));
    expect(repetidas).toHaveLength(0);
  });
});
