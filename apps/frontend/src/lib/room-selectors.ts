import type { Player, RoomState, Team } from "./room-types";

export interface TeamWithPlayers {
  team: Team;
  players: Player[];
}

export interface RoomLobbyView {
  teams: TeamWithPlayers[];
  unassigned: Player[];
}

// `Team.playerIds` referencia a `Player.id`; `Player` no guarda su equipo.
// Esta función pura deriva, a partir de `room_state`, qué jugador va en qué
// equipo y cuáles todavía no tienen uno asignado. Es lógica de presentación
// (agrupar para pintar la pantalla), no lógica de juego: el servidor sigue
// siendo la única fuente de verdad de a quién pertenece cada jugador.
export function splitPlayersByTeam(state: RoomState): RoomLobbyView {
  const playersById = new Map(state.players.map((player) => [player.id, player]));
  const assignedIds = new Set<string>();

  // El backend garantiza que un jugador pertenece a un solo equipo a la vez
  // (`assignPlayerToTeam` lo quita de cualquier otro antes de agregarlo), pero
  // esta función se defiende igual: si `playerIds` llegara a repetirse entre
  // equipos, el jugador solo se cuenta en el primero, nunca en ambos.
  const teams: TeamWithPlayers[] = state.teams.map((team) => {
    const players: Player[] = [];
    for (const id of team.playerIds) {
      if (assignedIds.has(id)) continue;
      const player = playersById.get(id);
      if (!player) continue;
      assignedIds.add(id);
      players.push(player);
    }
    return { team, players };
  });

  const unassigned = state.players.filter((player) => !assignedIds.has(player.id));

  return { teams, unassigned };
}
