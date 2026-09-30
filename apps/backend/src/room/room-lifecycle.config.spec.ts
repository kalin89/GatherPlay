import {
  DEFAULT_ROOM_LIFECYCLE_CONFIG,
  loadRoomLifecycleConfig,
} from './room-lifecycle.config.js';

describe('loadRoomLifecycleConfig', () => {
  it('usa los valores por defecto cuando no hay variables definidas', () => {
    expect(loadRoomLifecycleConfig({})).toEqual(DEFAULT_ROOM_LIFECYCLE_CONFIG);
  });

  it('ignora variables vacías', () => {
    expect(loadRoomLifecycleConfig({ MAX_ROOMS: '  ' })).toEqual(
      DEFAULT_ROOM_LIFECYCLE_CONFIG,
    );
  });

  it('lee cada variable de entorno', () => {
    expect(
      loadRoomLifecycleConfig({
        ROOM_HOST_GRACE_MS: '1000',
        ROOM_MAX_AGE_MS: '2000',
        MAX_ROOMS: '5',
        ROOM_SWEEP_INTERVAL_MS: '50',
        PLAYER_GRACE_MS: '3000',
        PLAYER_LOBBY_GRACE_MS: '400',
      }),
    ).toEqual({
      hostGraceMs: 1000,
      maxAgeMs: 2000,
      maxRooms: 5,
      sweepIntervalMs: 50,
      playerGraceMs: 3000,
      lobbyPlayerGraceMs: 400,
    });
  });

  it('lanza un error si la gracia de jugador es inválida', () => {
    expect(() => loadRoomLifecycleConfig({ PLAYER_GRACE_MS: 'x' })).toThrow(
      /PLAYER_GRACE_MS/,
    );
  });

  it.each(['abc', '0', '-5', '1.5'])(
    'lanza un error ante un valor inválido (%s)',
    (raw) => {
      expect(() => loadRoomLifecycleConfig({ MAX_ROOMS: raw })).toThrow(
        /MAX_ROOMS/,
      );
    },
  );
});
