import {
  NoTeamsError,
  PlayerNotFoundError,
  RoomNotFoundError,
  RoomService,
  TeamNotFoundError,
} from './room.service.js';

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
    expect(room.teams).toEqual([]);
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

  describe('armado de equipos', () => {
    it('crea un equipo sin jugadores', () => {
      const room = service.createRoom();

      const updated = service.createTeam(room.code, 'Rojos', '#FF0000');

      expect(updated.teams).toHaveLength(1);
      expect(updated.teams[0]).toMatchObject({
        name: 'Rojos',
        color: '#FF0000',
        playerIds: [],
        score: 0,
      });
    });

    it('lanza RoomNotFoundError al crear un equipo en una sala inexistente', () => {
      expect(() => service.createTeam('ZZZZZ', 'Rojos', '#FF0000')).toThrow(
        RoomNotFoundError,
      );
    });

    it('asigna manualmente un jugador a un equipo', () => {
      const room = service.createRoom();
      const withPlayer = service.joinRoom(room.code, 'Ana', 'socket-1');
      const playerId = withPlayer.players[0].id;
      const withTeam = service.createTeam(room.code, 'Rojos', '#FF0000');
      const teamId = withTeam.teams[0].id;

      const updated = service.assignPlayerToTeam(room.code, playerId, teamId);

      expect(updated.teams[0].playerIds).toEqual([playerId]);
    });

    it('mueve al jugador de equipo si ya estaba en otro', () => {
      const room = service.createRoom();
      const withPlayer = service.joinRoom(room.code, 'Ana', 'socket-1');
      const playerId = withPlayer.players[0].id;
      service.createTeam(room.code, 'Rojos', '#FF0000');
      const withSecondTeam = service.createTeam(room.code, 'Azules', '#0000FF');
      const [rojos, azules] = withSecondTeam.teams;

      service.assignPlayerToTeam(room.code, playerId, rojos.id);
      const updated = service.assignPlayerToTeam(
        room.code,
        playerId,
        azules.id,
      );

      expect(updated.teams[0].playerIds).toEqual([]);
      expect(updated.teams[1].playerIds).toEqual([playerId]);
    });

    it('lanza PlayerNotFoundError al asignar un jugador inexistente', () => {
      const room = service.createRoom();
      const withTeam = service.createTeam(room.code, 'Rojos', '#FF0000');
      const teamId = withTeam.teams[0].id;

      expect(() =>
        service.assignPlayerToTeam(room.code, 'inexistente', teamId),
      ).toThrow(PlayerNotFoundError);
    });

    it('lanza TeamNotFoundError al asignar a un equipo inexistente', () => {
      const room = service.createRoom();
      const withPlayer = service.joinRoom(room.code, 'Ana', 'socket-1');
      const playerId = withPlayer.players[0].id;

      expect(() =>
        service.assignPlayerToTeam(room.code, playerId, 'inexistente'),
      ).toThrow(TeamNotFoundError);
    });

    it('arma los equipos al azar distribuyendo a todos los jugadores', () => {
      const room = service.createRoom();
      service.joinRoom(room.code, 'Ana', 'socket-1');
      service.joinRoom(room.code, 'Beto', 'socket-2');
      service.joinRoom(room.code, 'Cami', 'socket-3');
      service.joinRoom(room.code, 'Dani', 'socket-4');
      service.createTeam(room.code, 'Rojos', '#FF0000');
      service.createTeam(room.code, 'Azules', '#0000FF');

      const updated = service.randomizeTeams(room.code);

      const assigned = updated.teams.flatMap((t) => t.playerIds);
      expect(assigned).toHaveLength(4);
      expect(new Set(assigned).size).toBe(4);
      for (const team of updated.teams) {
        expect(team.playerIds.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('lanza NoTeamsError al azar si no hay equipos creados', () => {
      const room = service.createRoom();
      service.joinRoom(room.code, 'Ana', 'socket-1');

      expect(() => service.randomizeTeams(room.code)).toThrow(NoTeamsError);
    });
  });
});
