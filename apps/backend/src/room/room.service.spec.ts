import { DEFAULT_ROOM_LIFECYCLE_CONFIG } from './room-lifecycle.config.js';
import {
  GameAlreadyStartedError,
  NoTeamsError,
  PlayerNotFoundError,
  RejoinFailedError,
  RoomNotFoundError,
  RoomService,
  TeamNotFoundError,
  UnknownGameError,
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
    expect(room.currentGame).toBeNull();
  });

  it('genera códigos distintos para salas distintas', () => {
    const room1 = service.createRoom();
    const room2 = service.createRoom();

    expect(room1.code).not.toBe(room2.code);
  });

  it('permite unirse con un código válido', () => {
    const room = service.createRoom();

    const updated = service.joinRoom(room.code, 'Ana', 'socket-1').room;

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
    const updated = service.joinRoom(room.code, 'Beto', 'socket-2').room;

    expect(updated.players.map((p) => p.name)).toEqual(['Ana', 'Beto']);
  });

  describe('desconexión y reconexión de jugadores', () => {
    const CONFIG = {
      ...DEFAULT_ROOM_LIFECYCLE_CONFIG,
      playerGraceMs: 90_000,
      lobbyPlayerGraceMs: 30_000,
    };
    let svc: RoomService;

    beforeEach(() => {
      svc = new RoomService(CONFIG);
    });

    function roomWithTeamedPlayer() {
      const room = svc.createRoom();
      const { player, playerToken } = svc.joinRoom(room.code, 'Ana', 'socket-1');
      const team = svc.createTeam(room.code, 'Rojos', '#FF0000').teams[0]!;
      svc.assignPlayerToTeam(room.code, player.id, team.id);
      return { room, player, playerToken, team };
    }

    it('joinRoom devuelve un token y el jugador entra conectado', () => {
      const room = svc.createRoom();

      const { player, playerToken } = svc.joinRoom(room.code, 'Ana', 'socket-1');

      expect(playerToken).toEqual(expect.any(String));
      expect(player.connected).toBe(true);
    });

    it('el token nunca aparece en el estado serializable de la sala', () => {
      const { room, playerToken } = roomWithTeamedPlayer();

      expect(JSON.stringify(room)).not.toContain(playerToken);
    });

    it('al desconectarse, el jugador se conserva con su equipo', () => {
      const { room, player, team } = roomWithTeamedPlayer();

      const updated = svc.markPlayerDisconnected('socket-1');

      expect(updated?.code).toBe(room.code);
      expect(updated?.players).toHaveLength(1);
      expect(updated?.players[0]?.connected).toBe(false);
      expect(updated?.teams[0]?.playerIds).toEqual([player.id]);
      expect(team.playerIds).toEqual([player.id]);
    });

    it('no hace nada si el socketId no pertenece a ninguna sala', () => {
      svc.createRoom();

      expect(svc.markPlayerDisconnected('inexistente')).toBeUndefined();
    });

    it('rejoinRoom con token válido restaura el mismo jugador con el socket nuevo', () => {
      const { room, player, playerToken } = roomWithTeamedPlayer();
      svc.markPlayerDisconnected('socket-1');

      const result = svc.rejoinRoom(room.code, playerToken, 'socket-2');

      expect(result.player.id).toBe(player.id);
      expect(result.player.socketId).toBe('socket-2');
      expect(result.player.connected).toBe(true);
      expect(result.previousSocketId).toBeNull();
      expect(result.room.teams[0]?.playerIds).toEqual([player.id]);
    });

    it('rejoinRoom con el jugador aún conectado devuelve el socket anterior (pestaña duplicada)', () => {
      const { room, playerToken } = roomWithTeamedPlayer();

      const result = svc.rejoinRoom(room.code, playerToken, 'socket-2');

      expect(result.previousSocketId).toBe('socket-1');
    });

    it('rejoinRoom lanza RejoinFailedError con token inválido o sala inexistente', () => {
      const { room, playerToken } = roomWithTeamedPlayer();

      expect(() => svc.rejoinRoom(room.code, 'nope', 'socket-2')).toThrow(
        RejoinFailedError,
      );
      expect(() => svc.rejoinRoom('ZZZZZ', playerToken, 'socket-2')).toThrow(
        RejoinFailedError,
      );
    });

    it('el token de una sala no sirve en otra', () => {
      const { playerToken } = roomWithTeamedPlayer();
      const other = svc.createRoom();

      expect(() => svc.rejoinRoom(other.code, playerToken, 'socket-2')).toThrow(
        RejoinFailedError,
      );
    });

    it('vencida la gracia de lobby, el jugador sale de la sala y de su equipo', () => {
      const { room, playerToken } = roomWithTeamedPlayer();
      svc.markPlayerDisconnected('socket-1', 1000);

      expect(svc.removeExpiredPlayers(1000 + 29_999)).toEqual([]);
      expect(svc.removeExpiredPlayers(1000 + 30_000)).toEqual([room.code]);

      expect(room.players).toEqual([]);
      expect(room.teams[0]?.playerIds).toEqual([]);
      expect(() => svc.rejoinRoom(room.code, playerToken, 'socket-2')).toThrow(
        RejoinFailedError,
      );
    });

    it('con un juego elegido aplica la gracia larga', () => {
      const { room } = roomWithTeamedPlayer();
      svc.selectGame(room.code, 'trivia');
      svc.markPlayerDisconnected('socket-1', 1000);

      expect(svc.removeExpiredPlayers(1000 + 30_000)).toEqual([]);
      expect(svc.removeExpiredPlayers(1000 + 90_000)).toEqual([room.code]);
      expect(room.players).toEqual([]);
    });

    it('un jugador que vuelve a tiempo ya no expira', () => {
      const { room, playerToken } = roomWithTeamedPlayer();
      svc.markPlayerDisconnected('socket-1', 1000);
      svc.rejoinRoom(room.code, playerToken, 'socket-2');

      expect(svc.removeExpiredPlayers(1000 + 999_999)).toEqual([]);
      expect(room.players).toHaveLength(1);
    });
  });

  describe('snapshot de reconexión', () => {
    it('concatena lo de los servicios que lo implementan e ignora los demás', () => {
      const room = service.createRoom();
      service.registerRoomScoped({ disposeRoom: () => undefined });
      service.registerRoomScoped({
        disposeRoom: () => undefined,
        snapshotFor: (code, playerId) => [
          { event: 'a', payload: { code, playerId } },
        ],
      });
      service.registerRoomScoped({
        disposeRoom: () => undefined,
        snapshotFor: () => [{ event: 'b', payload: 1 }],
      });

      expect(service.getSnapshot(room.code, 'p1')).toEqual([
        { event: 'a', payload: { code: room.code, playerId: 'p1' } },
        { event: 'b', payload: 1 },
      ]);
    });
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
      const withPlayer = service.joinRoom(room.code, 'Ana', 'socket-1').room;
      const playerId = withPlayer.players[0].id;
      const withTeam = service.createTeam(room.code, 'Rojos', '#FF0000');
      const teamId = withTeam.teams[0].id;

      const updated = service.assignPlayerToTeam(room.code, playerId, teamId);

      expect(updated.teams[0].playerIds).toEqual([playerId]);
    });

    it('mueve al jugador de equipo si ya estaba en otro', () => {
      const room = service.createRoom();
      const withPlayer = service.joinRoom(room.code, 'Ana', 'socket-1').room;
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
      const withPlayer = service.joinRoom(room.code, 'Ana', 'socket-1').room;
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

    it('el reparto al azar deja fuera a los jugadores desconectados', () => {
      const room = service.createRoom();
      service.joinRoom(room.code, 'Ana', 'socket-1');
      const { player: beto } = service.joinRoom(room.code, 'Beto', 'socket-2');
      service.joinRoom(room.code, 'Cami', 'socket-3');
      service.createTeam(room.code, 'Rojos', '#FF0000');
      service.markPlayerDisconnected('socket-2');

      const updated = service.randomizeTeams(room.code);

      const assigned = updated.teams.flatMap((t) => t.playerIds);
      expect(assigned).toHaveLength(2);
      expect(assigned).not.toContain(beto.id);
    });

    it('lanza NoTeamsError al azar si no hay equipos creados', () => {
      const room = service.createRoom();
      service.joinRoom(room.code, 'Ana', 'socket-1');

      expect(() => service.randomizeTeams(room.code)).toThrow(NoTeamsError);
    });

    it('elimina un equipo sin jugadores', () => {
      const room = service.createRoom();
      const withTeam = service.createTeam(room.code, 'Rojos', '#FF0000');
      const teamId = withTeam.teams[0].id;

      const updated = service.removeTeam(room.code, teamId);

      expect(updated.teams).toEqual([]);
    });

    it('elimina un equipo con jugadores y los deja sin equipo (siguen en la sala)', () => {
      const room = service.createRoom();
      const withPlayer = service.joinRoom(room.code, 'Ana', 'socket-1').room;
      const playerId = withPlayer.players[0].id;
      const withTeam = service.createTeam(room.code, 'Rojos', '#FF0000');
      const teamId = withTeam.teams[0].id;
      service.assignPlayerToTeam(room.code, playerId, teamId);

      const updated = service.removeTeam(room.code, teamId);

      expect(updated.teams).toEqual([]);
      expect(updated.players).toHaveLength(1);
      expect(updated.players[0].id).toBe(playerId);
    });

    it('lanza TeamNotFoundError al eliminar un equipo inexistente', () => {
      const room = service.createRoom();

      expect(() => service.removeTeam(room.code, 'inexistente')).toThrow(
        TeamNotFoundError,
      );
    });

    it('lanza RoomNotFoundError al eliminar un equipo en una sala inexistente', () => {
      expect(() => service.removeTeam('ZZZZZ', 'inexistente')).toThrow(
        RoomNotFoundError,
      );
    });
  });

  describe('selección de juego', () => {
    it('guarda el juego elegido', () => {
      const room = service.createRoom();

      const updated = service.selectGame(room.code, 'trivia');

      expect(updated.currentGame).toBe('trivia');
    });

    it('lanza RoomNotFoundError al elegir juego en una sala inexistente', () => {
      expect(() => service.selectGame('ZZZZZ', 'trivia')).toThrow(
        RoomNotFoundError,
      );
    });

    it('lanza UnknownGameError si el id de juego no existe', () => {
      const room = service.createRoom();

      expect(() => service.selectGame(room.code, 'inexistente')).toThrow(
        UnknownGameError,
      );
    });

    it('lanza GameAlreadyStartedError si ya se eligió un juego antes', () => {
      const room = service.createRoom();
      service.selectGame(room.code, 'trivia');

      expect(() => service.selectGame(room.code, 'trivia')).toThrow(
        GameAlreadyStartedError,
      );
    });
  });
});
