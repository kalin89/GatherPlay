import { vi } from 'vitest';
import { RoomService } from '../room/room.service.js';
import type { RoomState } from '../room/room.types.js';
import { GameEngineService } from '../game-engine/game-engine.service.js';
import { AiContentService } from '../ai-content/ai-content.service.js';
import type { TriviaGenerator } from '../ai-content/trivia-generator.js';
import type { RawTriviaQuestion } from '../ai-content/trivia.types.js';
import {
  AlreadyAnsweredError,
  InvalidAnswerIndexError,
  NoTriviaRoundError,
  PlayerNotInRoomError,
  TriviaService,
} from './trivia.service.js';
import type { TriviaEvent } from './trivia.types.js';

const DEFAULT_QUESTION: RawTriviaQuestion = {
  pregunta: '¿2+2?',
  correcta: '4',
  incorrectas: ['3', '5', '6'],
};

function fakeGenerator(raw: RawTriviaQuestion[] = [DEFAULT_QUESTION]): TriviaGenerator {
  return { generate: vi.fn().mockResolvedValue(raw) };
}

function createRoomWithPlayerAndTeam(
  rooms: RoomService,
  playerName = 'Ana',
  socketId = 'socket-1',
): { room: RoomState; teamId: string; playerId: string } {
  const room = rooms.createRoom();
  const withPlayer = rooms.joinRoom(room.code, playerName, socketId);
  const withTeam = rooms.createTeam(room.code, 'Rojos', '#FF0000');
  const playerId = withPlayer.players[0]!.id;
  const teamId = withTeam.teams[0]!.id;
  rooms.assignPlayerToTeam(room.code, playerId, teamId);
  return { room, teamId, playerId };
}

function questionEvents(events: TriviaEvent[]) {
  return events.filter((e) => e.type === 'trivia_question');
}

function resultEvents(events: TriviaEvent[]) {
  return events.filter((e) => e.type === 'trivia_result');
}

describe('TriviaService', () => {
  let rooms: RoomService;
  let gameEngine: GameEngineService;
  let clock: number;

  beforeEach(() => {
    vi.useFakeTimers();
    rooms = new RoomService();
    gameEngine = new GameEngineService(rooms);
    clock = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createTrivia(raw: RawTriviaQuestion[] = [DEFAULT_QUESTION]): TriviaService {
    const aiContent = new AiContentService(fakeGenerator(raw));
    const trivia = new TriviaService(rooms, gameEngine, aiContent, () => clock);
    trivia.onModuleInit();
    return trivia;
  }

  it('reparte la pregunta sin revelar el índice correcto', async () => {
    const { room } = createRoomWithPlayerAndTeam(rooms);
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    await trivia.startRound(room.code, 'general', 10);

    const [event] = questionEvents(events);
    expect(event).toBeDefined();
    expect(event).toMatchObject({ pregunta: '¿2+2?', categoria: 'general' });
    expect(event!.type === 'trivia_question' && event.opciones).toContain('4');
    expect(event).not.toHaveProperty('indiceCorrecto');
  });

  it('un jugador que acierta antes del límite suma puntos a su equipo, con bono por rapidez', async () => {
    const { room, teamId, playerId } = createRoomWithPlayerAndTeam(rooms);
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    await trivia.startRound(room.code, 'general', 10);
    const [question] = questionEvents(events);
    const correctIndex = question!.type === 'trivia_question' ? question.opciones.indexOf('4') : -1;

    clock = 2000; // responde a los 2s de 10s — bono alto
    trivia.submitAnswer(room.code, 'socket-1', correctIndex);

    vi.advanceTimersByTime(10_000);

    expect(rooms.getRoom(room.code)!.teams.find((t) => t.id === teamId)!.score).toBe(140);
    const [result] = resultEvents(events);
    expect(result).toMatchObject({ indiceCorrecto: correctIndex });
    expect(
      result!.type === 'trivia_result' &&
        result.resultados.find((r) => r.playerId === playerId),
    ).toMatchObject({ correcta: true, puntos: 140, opcionIndex: correctIndex });
  });

  it('un jugador que responde casi al límite recibe menos bono que uno que responde rápido', async () => {
    const { room, teamId } = createRoomWithPlayerAndTeam(rooms);
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    await trivia.startRound(room.code, 'general', 10);
    const [question] = questionEvents(events);
    const correctIndex = question!.type === 'trivia_question' ? question.opciones.indexOf('4') : -1;

    clock = 9900; // responde casi al final — bono mínimo
    trivia.submitAnswer(room.code, 'socket-1', correctIndex);

    vi.advanceTimersByTime(10_000);

    const score = rooms.getRoom(room.code)!.teams.find((t) => t.id === teamId)!.score;
    expect(score).toBeGreaterThanOrEqual(100);
    expect(score).toBeLessThan(140);
  });

  it('un jugador que no responde cuenta como incorrecta, sin puntos negativos', async () => {
    const { room, teamId, playerId } = createRoomWithPlayerAndTeam(rooms);
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    await trivia.startRound(room.code, 'general', 5);
    vi.advanceTimersByTime(5000);

    expect(rooms.getRoom(room.code)!.teams.find((t) => t.id === teamId)!.score).toBe(0);
    const [result] = resultEvents(events);
    expect(
      result!.type === 'trivia_result' &&
        result.resultados.find((r) => r.playerId === playerId),
    ).toMatchObject({ correcta: false, puntos: 0, opcionIndex: null });
  });

  it('responder dos veces lanza AlreadyAnsweredError y no cambia la primera respuesta', async () => {
    const { room, teamId } = createRoomWithPlayerAndTeam(rooms);
    const trivia = createTrivia();
    const events: TriviaEvent[] = [];
    trivia.events$.subscribe((e) => events.push(e));

    await trivia.startRound(room.code, 'general', 5);
    const [question] = questionEvents(events);
    const correctIndex = question!.type === 'trivia_question' ? question.opciones.indexOf('4') : -1;
    const wrongIndex = correctIndex === 0 ? 1 : 0;

    trivia.submitAnswer(room.code, 'socket-1', correctIndex);
    expect(() => trivia.submitAnswer(room.code, 'socket-1', wrongIndex)).toThrow(
      AlreadyAnsweredError,
    );

    vi.advanceTimersByTime(5000);

    // La segunda respuesta (incorrecta) nunca se aplicó — el equipo sigue sumando
    // como si hubiera acertado con la primera.
    expect(rooms.getRoom(room.code)!.teams.find((t) => t.id === teamId)!.score).toBeGreaterThan(0);
  });

  it('responder con una opción fuera de rango lanza InvalidAnswerIndexError', async () => {
    const { room } = createRoomWithPlayerAndTeam(rooms);
    const trivia = createTrivia();

    await trivia.startRound(room.code, 'general', 5);

    expect(() => trivia.submitAnswer(room.code, 'socket-1', 99)).toThrow(InvalidAnswerIndexError);
  });

  it('responder sin ronda activa lanza NoTriviaRoundError', () => {
    const { room } = createRoomWithPlayerAndTeam(rooms);
    const trivia = createTrivia();

    expect(() => trivia.submitAnswer(room.code, 'socket-1', 0)).toThrow(NoTriviaRoundError);
  });

  it('responder con un socket que no es de un jugador de la sala lanza PlayerNotInRoomError', async () => {
    const { room } = createRoomWithPlayerAndTeam(rooms);
    const trivia = createTrivia();

    await trivia.startRound(room.code, 'general', 5);

    expect(() => trivia.submitAnswer(room.code, 'socket-de-otra-sala', 0)).toThrow(
      PlayerNotInRoomError,
    );
  });

  it('terminar la ronda antes de tiempo con end_round genérico no otorga puntos y limpia el estado', async () => {
    const { room, teamId } = createRoomWithPlayerAndTeam(rooms);
    const trivia = createTrivia();

    await trivia.startRound(room.code, 'general', 10);
    // Responde, pero la ronda se corta antes de que el temporizador llegue a
    // cero — no pasa por el enganche de round_update(0), así que no se puntúa
    // (ver "Límite explícito" en specs/features/trivia-module/analysis.md).
    trivia.submitAnswer(room.code, 'socket-1', 0);
    gameEngine.endRound(room.code);

    expect(rooms.getRoom(room.code)!.teams.find((t) => t.id === teamId)!.score).toBe(0);
    expect(() => trivia.submitAnswer(room.code, 'socket-1', 0)).toThrow(NoTriviaRoundError);
  });
});
