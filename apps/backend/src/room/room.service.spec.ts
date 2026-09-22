import { RoomNotFoundError, RoomService } from './room.service.js';

describe('RoomService', () => {
  let service: RoomService;

  beforeEach(() => {
    service = new RoomService();
  });

  it('crea una sala con código único, en lobby y sin jugadores', () => {
    const room = service.createRoom();

    expect(room.code).toMatch(/^[A-Z2-9]{5}$/);
    expect(room.status).toBe('lobby');
    expect(room.players).toEqual([]);
  });

  it('genera códigos distintos para salas distintas', () => {
    const room1 = service.createRoom();
    const room2 = service.createRoom();

    expect(room1.code).not.toBe(room2.code);
  });

  it('permite unirse con un código válido', () => {
    const room = service.createRoom();

    const updated = service.joinRoom(room.code, 'Ana', 'socket-1');

    expect(updated.players).toHaveLength(1);
    expect(updated.players[0]).toMatchObject({
      name: 'Ana',
      socketId: 'socket-1',
    });
  });

  it('lanza RoomNotFoundError al unirse con un código inexistente', () => {
    expect(() => service.joinRoom('ZZZZZ', 'Ana', 'socket-1')).toThrow(
      RoomNotFoundError,
    );
  });

  it('permite que dos jugadores se unan a la misma sala sin pisarse', () => {
    const room = service.createRoom();

    service.joinRoom(room.code, 'Ana', 'socket-1');
    const updated = service.joinRoom(room.code, 'Beto', 'socket-2');

    expect(updated.players.map((p) => p.name)).toEqual(['Ana', 'Beto']);
  });

  it('remueve un jugador por su socketId y devuelve la sala actualizada', () => {
    const room = service.createRoom();
    service.joinRoom(room.code, 'Ana', 'socket-1');

    const updated = service.removePlayerBySocketId('socket-1');

    expect(updated?.code).toBe(room.code);
    expect(updated?.players).toEqual([]);
  });

  it('no hace nada si el socketId a remover no pertenece a ninguna sala', () => {
    service.createRoom();

    const result = service.removePlayerBySocketId('inexistente');

    expect(result).toBeUndefined();
  });
});
