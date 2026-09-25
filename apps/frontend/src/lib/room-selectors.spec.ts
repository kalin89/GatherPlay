import { describe, expect, it } from "vitest";
import { splitPlayersByTeam } from "./room-selectors";
import type { RoomState } from "./room-types";

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: "ABCDE",
    status: "lobby",
    players: [],
    teams: [],
    round: null,
    currentGame: null,
    ...overrides,
  };
}

describe("splitPlayersByTeam", () => {
  it("agrupa cada jugador bajo su equipo", () => {
    const room = makeRoom({
      players: [
        { id: "p1", name: "Ana", socketId: "s1" },
        { id: "p2", name: "Beto", socketId: "s2" },
      ],
      teams: [
        { id: "t1", name: "Rojos", color: "#ff0000", playerIds: ["p1"], score: 0 },
        { id: "t2", name: "Azules", color: "#0000ff", playerIds: ["p2"], score: 0 },
      ],
    });

    const result = splitPlayersByTeam(room);

    expect(result.teams).toHaveLength(2);
    expect(result.teams[0].players.map((p) => p.name)).toEqual(["Ana"]);
    expect(result.teams[1].players.map((p) => p.name)).toEqual(["Beto"]);
    expect(result.unassigned).toEqual([]);
  });

  it("deja a los jugadores sin equipo en unassigned", () => {
    const room = makeRoom({
      players: [
        { id: "p1", name: "Ana", socketId: "s1" },
        { id: "p2", name: "Beto", socketId: "s2" },
      ],
      teams: [
        { id: "t1", name: "Rojos", color: "#ff0000", playerIds: ["p1"], score: 0 },
      ],
    });

    const result = splitPlayersByTeam(room);

    expect(result.unassigned.map((p) => p.name)).toEqual(["Beto"]);
  });

  it("un jugador nunca aparece en dos equipos", () => {
    const room = makeRoom({
      players: [{ id: "p1", name: "Ana", socketId: "s1" }],
      teams: [
        { id: "t1", name: "Rojos", color: "#ff0000", playerIds: ["p1"], score: 0 },
        { id: "t2", name: "Azules", color: "#0000ff", playerIds: ["p1"], score: 0 },
      ],
    });

    const result = splitPlayersByTeam(room);
    const totalAppearances = result.teams.reduce(
      (sum, t) => sum + t.players.length,
      0,
    );

    expect(totalAppearances).toBe(1);
  });

  it("un equipo sin jugadores devuelve una lista vacía", () => {
    const room = makeRoom({
      players: [],
      teams: [
        { id: "t1", name: "Rojos", color: "#ff0000", playerIds: [], score: 0 },
      ],
    });

    const result = splitPlayersByTeam(room);

    expect(result.teams[0].players).toEqual([]);
  });
});
