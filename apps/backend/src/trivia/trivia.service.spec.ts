import { vi } from 'vitest';
import { RoomService } from '../room/room.service.js';
import type { RoomState } from '../room/room.types.js';
import { GameEngineService } from '../game-engine/game-engine.service.js';
import { NotEnoughTeamsError } from '../game-engine/turn-distribution.js';
import { AiContentService } from '../ai-content/ai-content.service.js';
import type { TriviaGenerator } from '../ai-content/trivia-generator.js';
import type { RawTriviaQuestion } from '../ai-content/trivia.types.js';
import {
  AlreadyAnsweredError,
  InvalidAnswerIndexError,
  NoTriviaMatchError,
  NotYourTurnError,
  PlayerNotInRoomError,
  TriviaMatchAlreadyRunningError,
  TriviaService,
} from './trivia.service.js';
import type { TriviaEvent } from './trivia.types.js';

const DEFAULT_QUESTION: RawTriviaQuestion = {
  pregunta: '¿2+2?',
  correcta: '4',
  incorrectas: ['3', '5', '6'],
};

const TRIVIA_TURN_SECONDS = 15;
const TURN_TRANSITION_DELAY_MS = 2500;
const RESULTS_DISPLAY_MS = 10_000;

// Genera `cantidad` preguntas sintéticas distintas (mismo correcta/incorrectas, pero
// `pregunta` con un índice) para que AiContentService.isValidBatch las acepte sin caer
// al banco de respaldo real — necesario ahora que TriviaService pide todas las
// preguntas de la partida de una sola vez, no una por turno.
function fakeGenerator(): TriviaGenerator {
  return {
    generate: vi.fn(
      async (_categoria: string, cantidad: number): Promise<RawTriviaQuestion[]> =>
        Array.from({ length: cantidad }, (_, i) => ({
          pregunta: `${DEFAULT_QUESTION.pregunta} (${i})`,
          correcta: DEFAULT_QUESTION.correcta,
          incorrectas: DEFAULT_QUESTION.incorrectas,
        })),
    ),
  };
}

interface RoomSetup {
  room: RoomState;
  teamA: { teamId: string; playerId: string; socketId: string };
  teamB: { teamId: string; playerId: string; socketId: string };
}

// 2 equipos de 1 jugador cada uno — a quién le toca dentro de un equipo no
// depende del shuffle interno de distributeTurns cuando hay un solo
// candidato, así que el único elemento al azar es qué equipo arranca.
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

function turnStartedEvents(events: TriviaEvent[]) {
  return events.filter((e) => e.type === 'trivia_turn_started');
}

function turnWaitingEvents(events: TriviaEvent[]) {
  return events.filter((e) => e.type === 'trivia_turn_waiting');
}

function turnResultEvents(events: TriviaEvent[]) {
  return events.filter((e) => e.type === 'trivia_turn_result');
}

function matchResultEvents(events: TriviaEvent[]) {
  return events.filter((e) => e.type === 'trivia_match_result');
}

describe('TriviaService', () => {
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

  function createTrivia(): TriviaService {
    const aiContent = new AiContentService(fakeGenerator());
    return new TriviaService(rooms, gameEngine, aiContent);
  }

  // Devuelve el jugador (A o B) al que le toca en el evento trivia_turn_started
  // más reciente, para no depender de qué equipo arranca al azar.
  function currentTurnPlayer(events: TriviaEvent[], setup: RoomSetup) {
    const [started] = turnStartedEvents(events).slice(-1);
    if (!started || started.type !== 'trivia_turn_started') {
      throw new Error('No se emitió trivia_turn_started');
    }
    return started.playerId === setup.teamA.playerId ? setup.teamA : setup.teamB;
  }

  it('arranca la partida: el turno llega solo a la pantalla y al jugador correspondiente', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    trivia.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);

    const current = currentTurnPlayer(events, setup);

    const [started] = turnStartedEvents(events);
    expect(started).toMatchObject({
      targetSocketIds: [`${setup.room.code}:screen`, current.socketId],
      pregunta: '¿2+2? (0)',
    });

    const [waiting] = turnWaitingEvents(events);
    expect(waiting).toMatchObject({ playerId: current.playerId, teamId: current.teamId });
    expect(waiting).not.toHaveProperty('pregunta');
    expect(started && (started as { opciones: string[] }).opciones).toContain('4');
  });

  it('lanza TriviaMatchAlreadyRunningError si ya hay una partida en curso', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const trivia = createTrivia();
    trivia.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);

    expect(() => trivia.startMatch(setup.room.code)).toThrow(TriviaMatchAlreadyRunningError);
  });

  it('lanza NotEnoughTeamsError si menos de 2 equipos tienen jugadores', () => {
    const room = rooms.createRoom();
    rooms.joinRoom(room.code, 'Ana', 'socket-a');
    const withTeam = rooms.createTeam(room.code, 'Rojos', '#FF0000');
    rooms.assignPlayerToTeam(room.code, room.players[0]?.id ?? '', withTeam.teams[0]!.id);
    const trivia = createTrivia();

    expect(() => trivia.startMatch(room.code)).toThrow(NotEnoughTeamsError);
  });

  it('acierta → suma puntos fijos al equipo, sin bono', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    trivia.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);
    const current = currentTurnPlayer(events, setup);
    const correctIndex = (turnStartedEvents(events)[0] as { opciones: string[] }).opciones.indexOf(
      '4',
    );

    trivia.submitAnswer(setup.room.code, current.socketId, correctIndex);

    const [result] = turnResultEvents(events);
    expect(result).toMatchObject({
      indiceCorrecto: correctIndex,
      resultado: { playerId: current.playerId, correcta: true, puntos: 1 },
    });
    expect(rooms.getRoom(setup.room.code)!.teams.find((t) => t.id === current.teamId)!.score).toBe(
      1,
    );
  });

  it('no acierta → 0 puntos, sin negativos', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    trivia.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);
    const current = currentTurnPlayer(events, setup);
    const correctIndex = (turnStartedEvents(events)[0] as { opciones: string[] }).opciones.indexOf(
      '4',
    );
    const wrongIndex = correctIndex === 0 ? 1 : 0;

    trivia.submitAnswer(setup.room.code, current.socketId, wrongIndex);

    const [result] = turnResultEvents(events);
    expect(result).toMatchObject({ resultado: { correcta: false, puntos: 0 } });
    expect(rooms.getRoom(setup.room.code)!.teams.find((t) => t.id === current.teamId)!.score).toBe(
      0,
    );
  });

  it('no responde a tiempo → cuenta como incorrecta, sin puntos', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    trivia.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);
    const current = currentTurnPlayer(events, setup);

    await vi.advanceTimersByTimeAsync(TRIVIA_TURN_SECONDS * 1000);

    const [result] = turnResultEvents(events);
    expect(result).toMatchObject({
      resultado: { playerId: current.playerId, opcionElegida: null, correcta: false, puntos: 0 },
    });
  });

  it('responder fuera de turno lanza NotYourTurnError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    trivia.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);
    const current = currentTurnPlayer(events, setup);
    const other = current === setup.teamA ? setup.teamB : setup.teamA;

    expect(() => trivia.submitAnswer(setup.room.code, other.socketId, 0)).toThrow(
      NotYourTurnError,
    );
  });

  it('responder dos veces lanza AlreadyAnsweredError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    trivia.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);
    const current = currentTurnPlayer(events, setup);

    trivia.submitAnswer(setup.room.code, current.socketId, 0);
    expect(() => trivia.submitAnswer(setup.room.code, current.socketId, 0)).toThrow(
      AlreadyAnsweredError,
    );
  });

  it('responder con índice fuera de rango lanza InvalidAnswerIndexError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    trivia.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);
    const current = currentTurnPlayer(events, setup);

    expect(() => trivia.submitAnswer(setup.room.code, current.socketId, 99)).toThrow(
      InvalidAnswerIndexError,
    );
  });

  it('responder sin partida activa lanza NoTriviaMatchError', () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const trivia = createTrivia();

    expect(() => trivia.submitAnswer(setup.room.code, setup.teamA.socketId, 0)).toThrow(
      NoTriviaMatchError,
    );
  });

  it('responder con un socket ajeno a la sala lanza PlayerNotInRoomError', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const trivia = createTrivia();
    trivia.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);

    expect(() => trivia.submitAnswer(setup.room.code, 'socket-ajeno', 0)).toThrow(
      PlayerNotInRoomError,
    );
  });

  it('respeta la pausa entre turnos antes de avanzar al equipo contrario', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    trivia.startMatch(setup.room.code);
    await vi.advanceTimersByTimeAsync(0);
    const current = currentTurnPlayer(events, setup);
    const other = current === setup.teamA ? setup.teamB : setup.teamA;

    trivia.submitAnswer(setup.room.code, current.socketId, 0);
    expect(turnStartedEvents(events)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(TURN_TRANSITION_DELAY_MS - 1);
    expect(turnStartedEvents(events)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(turnStartedEvents(events)).toHaveLength(2);
    expect(turnStartedEvents(events)[1]).toMatchObject({ playerId: other.playerId });
  });

  it('agota los 6 turnos y termina la partida con el puntaje final', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    trivia.startMatch(setup.room.code);

    for (let turn = 0; turn < 6; turn++) {
      await vi.advanceTimersByTimeAsync(0);
      const current = currentTurnPlayer(events, setup);
      trivia.submitAnswer(setup.room.code, current.socketId, 0);
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
  });

  it('pide todas las preguntas de la partida en una sola llamada, no una por turno', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    const generate = vi.fn(
      async (_categoria: string, cantidad: number): Promise<RawTriviaQuestion[]> =>
        Array.from({ length: cantidad }, (_, i) => ({
          pregunta: `${DEFAULT_QUESTION.pregunta} (${i})`,
          correcta: DEFAULT_QUESTION.correcta,
          incorrectas: DEFAULT_QUESTION.incorrectas,
        })),
    );
    const aiContent = new AiContentService({ generate });
    const trivia = new TriviaService(rooms, gameEngine, aiContent);
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    trivia.startMatch(setup.room.code);

    for (let turn = 0; turn < 6; turn++) {
      await vi.advanceTimersByTimeAsync(0);
      const current = currentTurnPlayer(events, setup);
      trivia.submitAnswer(setup.room.code, current.socketId, 0);
      await vi.advanceTimersByTimeAsync(TURN_TRANSITION_DELAY_MS);
    }

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith('general', 6);

    const preguntas = turnStartedEvents(events).map(
      (e) => (e as { pregunta: string }).pregunta,
    );
    expect(new Set(preguntas).size).toBe(preguntas.length);
  });

  it('a los 10s de terminar la partida, vuelve a la selección de juego sin resetear el puntaje', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    rooms.selectGame(setup.room.code, 'trivia');
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    trivia.startMatch(setup.room.code);
    for (let turn = 0; turn < 6; turn++) {
      await vi.advanceTimersByTimeAsync(0);
      const current = currentTurnPlayer(events, setup);
      trivia.submitAnswer(setup.room.code, current.socketId, 0);
      await vi.advanceTimersByTimeAsync(TURN_TRANSITION_DELAY_MS);
    }

    const scoreBefore = rooms
      .getRoom(setup.room.code)!
      .teams.map((t) => ({ id: t.id, score: t.score }));

    await vi.advanceTimersByTimeAsync(RESULTS_DISPLAY_MS - 1);
    expect(rooms.getRoom(setup.room.code)!.currentGame).toBe('trivia');

    await vi.advanceTimersByTimeAsync(1);
    const room = rooms.getRoom(setup.room.code)!;
    expect(room.currentGame).toBeNull();
    expect(room.teams.map((t) => ({ id: t.id, score: t.score }))).toEqual(scoreBefore);
  });

  it('el resultado de cada partida trae solo los puntos de esa partida, no el acumulado', async () => {
    const setup = createRoomWithTwoSoloTeams(rooms);
    rooms.selectGame(setup.room.code, 'trivia');
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    async function playMatchAnsweringSiempreCorrecto() {
      trivia.startMatch(setup.room.code);
      for (let turn = 0; turn < 6; turn++) {
        await vi.advanceTimersByTimeAsync(0);
        const current = currentTurnPlayer(events, setup);
        const [started] = turnStartedEvents(events).slice(-1);
        const correctIndex = (started as { opciones: string[] }).opciones.indexOf('4');
        trivia.submitAnswer(setup.room.code, current.socketId, correctIndex);
        await vi.advanceTimersByTimeAsync(TURN_TRANSITION_DELAY_MS);
      }
      await vi.advanceTimersByTimeAsync(RESULTS_DISPLAY_MS);
    }

    await playMatchAnsweringSiempreCorrecto();
    const totalAfterFirst = rooms
      .getRoom(setup.room.code)!
      .teams.reduce((sum, t) => sum + t.score, 0);
    expect(totalAfterFirst).toBe(6); // 6 turnos x 1 punto

    rooms.selectGame(setup.room.code, 'trivia');
    await playMatchAnsweringSiempreCorrecto();

    const [, secondMatchResult] = matchResultEvents(events);
    const secondMatchTotal = (
      secondMatchResult as { scores: { score: number }[] }
    ).scores.reduce((sum, s) => sum + s.score, 0);
    expect(secondMatchTotal).toBe(6); // solo lo de la segunda partida, no 12

    const totalAfterSecond = rooms
      .getRoom(setup.room.code)!
      .teams.reduce((sum, t) => sum + t.score, 0);
    expect(totalAfterSecond).toBe(12); // el acumulado real sí duplica
  });
});
