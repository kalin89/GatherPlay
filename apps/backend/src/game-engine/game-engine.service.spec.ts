import {
  RoomNotFoundError,
  RoomService,
  TeamNotFoundError,
} from '../room/room.service.js';
import type { RoomState } from '../room/room.types.js';
import {
  GameEngineService,
  InvalidRoundDurationError,
  NoRoundRunningError,
  RoundAlreadyRunningError,
} from './game-engine.service.js';
import type { GameEngineEvent } from './game-engine.types.js';

function createRoomWithPlayerAndTeams(rooms: RoomService): RoomState {
  const room = rooms.createRoom();
  rooms.joinRoom(room.code, 'Ana', 'socket-1');
  rooms.createTeam(room.code, 'Rojos', '#FF0000');
  rooms.createTeam(room.code, 'Azules', '#0000FF');
  return room;
}

function ticksOf(
  events: GameEngineEvent[],
): Extract<GameEngineEvent, { type: 'round_update' }>['remainingSeconds'][] {
  return events
    .filter(
      (e): e is Extract<GameEngineEvent, { type: 'round_update' }> =>
        e.type === 'round_update',
    )
    .map((e) => e.remainingSeconds);
}

describe('GameEngineService', () => {
  let rooms: RoomService;
  let service: GameEngineService;

  beforeEach(() => {
    vi.useFakeTimers();
    rooms = new RoomService();
    service = new GameEngineService(rooms);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('inicia una ronda: pasa a jugando con el tiempo restante inicial', () => {
    const room = createRoomWithPlayerAndTeams(rooms);

    const updated = service.startRound(room.code, 3);

    expect(updated.status).toBe('jugando');
    expect(updated.round).toEqual({ durationSeconds: 3, remainingSeconds: 3 });
  });

  it('emite room_state y luego round_started al iniciar', () => {
    const room = createRoomWithPlayerAndTeams(rooms);
    const events: GameEngineEvent[] = [];
    service.events$.subscribe((e) => events.push(e));

    service.startRound(room.code, 3);

    expect(events.map((e) => e.type)).toEqual(['room_state', 'round_started']);
  });

  it('tickea el tiempo restante cada segundo', () => {
    const room = createRoomWithPlayerAndTeams(rooms);
    service.startRound(room.code, 3);
    const events: GameEngineEvent[] = [];
    service.events$.subscribe((e) => events.push(e));

    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);

    expect(ticksOf(events)).toEqual([2, 1]);
    expect(rooms.getRoom(room.code)?.round?.remainingSeconds).toBe(1);
  });

  it('al llegar a cero termina la ronda con resultados y puntaje final', () => {
    const room = createRoomWithPlayerAndTeams(rooms);
    const events: GameEngineEvent[] = [];
    service.events$.subscribe((e) => events.push(e));

    service.startRound(room.code, 2);
    vi.advanceTimersByTime(2000);

    const updated = rooms.getRoom(room.code)!;
    expect(updated.status).toBe('resultados');
    expect(updated.round).toBeNull();
    expect(events.map((e) => e.type)).toEqual([
      'room_state',
      'round_started',
      'round_update',
      'round_update',
      'room_state',
      'round_result',
    ]);

    events.length = 0;
    vi.advanceTimersByTime(5000);
    expect(events).toEqual([]);
  });

  it('endRound corta la ronda antes de tiempo', () => {
    const room = createRoomWithPlayerAndTeams(rooms);
    service.startRound(room.code, 10);
    const events: GameEngineEvent[] = [];
    service.events$.subscribe((e) => events.push(e));

    const updated = service.endRound(room.code);

    expect(updated.status).toBe('resultados');
    expect(updated.round).toBeNull();
    expect(events.map((e) => e.type)).toEqual(['room_state', 'round_result']);

    events.length = 0;
    vi.advanceTimersByTime(15000);
    expect(events).toEqual([]);
  });

  it('endRound sin ronda en curso lanza NoRoundRunningError', () => {
    const room = createRoomWithPlayerAndTeams(rooms);

    expect(() => service.endRound(room.code)).toThrow(NoRoundRunningError);
  });

  it('startRound con una ronda ya en curso lanza error y no duplica el intervalo', () => {
    const room = createRoomWithPlayerAndTeams(rooms);
    service.startRound(room.code, 10);

    expect(() => service.startRound(room.code, 5)).toThrow(
      RoundAlreadyRunningError,
    );

    const events: GameEngineEvent[] = [];
    service.events$.subscribe((e) => events.push(e));
    vi.advanceTimersByTime(1000);

    expect(ticksOf(events)).toEqual([9]);
    expect(rooms.getRoom(room.code)?.round?.remainingSeconds).toBe(9);
  });

  it('reiniciar una ronda desde resultados conserva el puntaje acumulado', () => {
    const room = createRoomWithPlayerAndTeams(rooms);
    const teamId = rooms.getRoom(room.code)!.teams[0].id;
    service.addScore(room.code, teamId, 10);
    service.startRound(room.code, 1);
    vi.advanceTimersByTime(1000);

    const updated = service.startRound(room.code, 5);

    expect(updated.status).toBe('jugando');
    expect(updated.teams.find((t) => t.id === teamId)?.score).toBe(10);
  });

  it('addScore acumula puntos y emite room_state', () => {
    const room = createRoomWithPlayerAndTeams(rooms);
    const teamId = rooms.getRoom(room.code)!.teams[0].id;
    const events: GameEngineEvent[] = [];
    service.events$.subscribe((e) => events.push(e));

    service.addScore(room.code, teamId, 10);
    service.addScore(room.code, teamId, 5);

    expect(rooms.getRoom(room.code)?.teams[0].score).toBe(15);
    expect(events.map((e) => e.type)).toEqual(['room_state', 'room_state']);
  });

  it('addScore con equipo inexistente lanza TeamNotFoundError', () => {
    const room = createRoomWithPlayerAndTeams(rooms);

    expect(() => service.addScore(room.code, 'inexistente', 10)).toThrow(
      TeamNotFoundError,
    );
  });

  it('startRound, endRound y addScore con código inexistente lanzan RoomNotFoundError', () => {
    expect(() => service.startRound('ZZZZZ', 5)).toThrow(RoomNotFoundError);
    expect(() => service.endRound('ZZZZZ')).toThrow(RoomNotFoundError);
    expect(() => service.addScore('ZZZZZ', 'x', 1)).toThrow(RoomNotFoundError);
  });

  it.each([0, -5, 1.5])(
    'startRound con duración inválida %s lanza error sin crear timer',
    (duration) => {
      const room = createRoomWithPlayerAndTeams(rooms);

      expect(() => service.startRound(room.code, duration)).toThrow(
        InvalidRoundDurationError,
      );

      const state = rooms.getRoom(room.code)!;
      expect(state.status).toBe('lobby');
      expect(state.round).toBeNull();
    },
  );

  it('si todos los jugadores se desconectan, el temporizador se detiene sin round_result', () => {
    const room = createRoomWithPlayerAndTeams(rooms);
    service.startRound(room.code, 10);
    rooms.removePlayerBySocketId('socket-1');

    const events: GameEngineEvent[] = [];
    service.events$.subscribe((e) => events.push(e));
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(15000);

    expect(events).toEqual([]);
  });

  it('onModuleDestroy detiene los timers vivos', () => {
    const room = createRoomWithPlayerAndTeams(rooms);
    service.startRound(room.code, 10);

    service.onModuleDestroy();

    const events: GameEngineEvent[] = [];
    service.events$.subscribe((e) => events.push(e));
    vi.advanceTimersByTime(15000);

    expect(events).toEqual([]);
  });
});
