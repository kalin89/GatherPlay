import { vi } from 'vitest';
import {
  RoomNotFoundError,
  RoomService,
  TooManyRoomsError,
} from './room.service.js';
import type { RoomLifecycleConfig } from './room-lifecycle.config.js';

const CONFIG: RoomLifecycleConfig = {
  hostGraceMs: 1000,
  maxAgeMs: 10_000,
  maxRooms: 3,
  sweepIntervalMs: 50,
};

describe('RoomService — ciclo de vida', () => {
  let service: RoomService;

  beforeEach(() => {
    service = new RoomService(CONFIG);
  });

  describe('sala sin pantalla de host', () => {
    it('se cierra al vencer la gracia si nunca se conectó un host', () => {
      const room = service.createRoom(0);

      expect(service.closeExpiredRooms(999)).toEqual([]);
      expect(service.closeExpiredRooms(1000)).toEqual([
        { code: room.code, reason: 'host_left' },
      ]);
      expect(service.getRoom(room.code)).toBeUndefined();
    });

    it('no se cierra mientras hay una pantalla conectada', () => {
      const room = service.createRoom(0);
      service.attachHost(room.code, 'screen-1');

      expect(service.closeExpiredRooms(5000)).toEqual([]);
      expect(service.getRoom(room.code)).toBeDefined();
    });

    it('se cierra al vencer la gracia contada desde que se fue el host', () => {
      const room = service.createRoom(0);
      service.attachHost(room.code, 'screen-1');
      service.detachHost('screen-1', 5000);

      expect(service.closeExpiredRooms(5999)).toEqual([]);
      expect(service.closeExpiredRooms(6000)).toEqual([
        { code: room.code, reason: 'host_left' },
      ]);
    });

    it('no se cierra si el host vuelve antes de que venza la gracia', () => {
      const room = service.createRoom(0);
      service.attachHost(room.code, 'screen-1');
      service.detachHost('screen-1', 5000);
      service.attachHost(room.code, 'screen-2', 5500);

      expect(service.closeExpiredRooms(9000)).toEqual([]);
      expect(service.getRoom(room.code)).toBeDefined();
    });

    it('con dos pantallas, perder una no deja la sala sin host', () => {
      const room = service.createRoom(0);
      service.attachHost(room.code, 'screen-1');
      service.attachHost(room.code, 'screen-2');

      expect(service.detachHost('screen-1', 100)).toEqual({
        code: room.code,
        hostless: false,
      });
      expect(service.closeExpiredRooms(100_000_000)).not.toContainEqual({
        code: room.code,
        reason: 'host_left',
      });
    });
  });

  describe('attachHost / detachHost', () => {
    it('reconnected es false en la primera conexión y true tras perder al host', () => {
      const room = service.createRoom(0);

      expect(service.attachHost(room.code, 'screen-1')).toEqual({
        reconnected: false,
      });
      service.detachHost('screen-1');
      expect(service.attachHost(room.code, 'screen-2')).toEqual({
        reconnected: true,
      });
      expect(service.attachHost(room.code, 'screen-3')).toEqual({
        reconnected: false,
      });
    });

    it('detachHost de un socket que no era host no hace nada', () => {
      expect(service.detachHost('desconocido')).toBeUndefined();
    });

    it('attachHost a una sala inexistente lanza RoomNotFoundError', () => {
      expect(() => service.attachHost('NOPE1', 'screen-1')).toThrow(
        RoomNotFoundError,
      );
    });

    it('un socket que pasa a otra sala deja de contar como host de la anterior', () => {
      const first = service.createRoom(0);
      const second = service.createRoom(0);
      service.attachHost(first.code, 'screen-1');
      service.attachHost(second.code, 'screen-1', 0);

      const closed = service.closeExpiredRooms(1000);

      expect(closed).toEqual([{ code: first.code, reason: 'host_left' }]);
    });
  });

  describe('vida máxima', () => {
    it('cierra la sala aunque tenga un host conectado', () => {
      const room = service.createRoom(0);
      service.attachHost(room.code, 'screen-1');

      expect(service.closeExpiredRooms(9999)).toEqual([]);
      expect(service.closeExpiredRooms(10_000)).toEqual([
        { code: room.code, reason: 'max_age' },
      ]);
    });
  });

  describe('tope de salas', () => {
    it('lanza TooManyRoomsError al superar maxRooms y permite crear tras cerrar una', () => {
      const rooms = [
        service.createRoom(),
        service.createRoom(),
        service.createRoom(),
      ];

      expect(() => service.createRoom()).toThrow(TooManyRoomsError);

      service.closeRoom(rooms[0]!.code);
      expect(() => service.createRoom()).not.toThrow();
    });
  });

  describe('closeRoom', () => {
    it('invoca disposeRoom en todos los servicios registrados y borra la sala', () => {
      const first = { disposeRoom: vi.fn() };
      const second = { disposeRoom: vi.fn() };
      service.registerRoomScoped(first);
      service.registerRoomScoped(second);
      const room = service.createRoom();

      service.closeRoom(room.code);

      expect(first.disposeRoom).toHaveBeenCalledWith(room.code);
      expect(second.disposeRoom).toHaveBeenCalledWith(room.code);
      expect(service.getRoom(room.code)).toBeUndefined();
    });

    it('es idempotente', () => {
      const room = service.createRoom();

      service.closeRoom(room.code);

      expect(() => service.closeRoom(room.code)).not.toThrow();
      expect(service.getStats()).toEqual({ rooms: 0 });
    });

    it('una vez cerrada, el host ya no puede reconectarse ni unirse un jugador', () => {
      const room = service.createRoom();
      service.attachHost(room.code, 'screen-1');
      service.closeRoom(room.code);

      expect(() => service.attachHost(room.code, 'screen-2')).toThrow(
        RoomNotFoundError,
      );
      expect(() => service.joinRoom(room.code, 'Ana', 's-1')).toThrow(
        RoomNotFoundError,
      );
    });
  });

  describe('fuga de memoria', () => {
    it('crear y cerrar 1.000 salas no deja ningún rastro interno', () => {
      const big = new RoomService({ ...CONFIG, maxRooms: 1000 });

      for (let i = 0; i < 1000; i++) {
        const room = big.createRoom();
        big.attachHost(room.code, `screen-${i}`);
        big.joinRoom(room.code, 'Ana', `player-${i}`);
        big.closeRoom(room.code);
      }

      const internals = big as unknown as {
        rooms: Map<string, unknown>;
        roomMeta: Map<string, unknown>;
        hostSocketToRoom: Map<string, unknown>;
      };
      expect(big.getStats()).toEqual({ rooms: 0 });
      expect(internals.rooms.size).toBe(0);
      expect(internals.roomMeta.size).toBe(0);
      expect(internals.hostSocketToRoom.size).toBe(0);
    });
  });
});
