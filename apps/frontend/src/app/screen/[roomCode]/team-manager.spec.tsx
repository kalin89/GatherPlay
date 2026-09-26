import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TeamManager } from "./team-manager";
import type { RoomState } from "@/lib/room-types";
import type { RoomActions } from "@/hooks/use-room-state";

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

function makeActions(overrides: Partial<RoomActions> = {}): RoomActions {
  return {
    createTeam: vi.fn(),
    removeTeam: vi.fn(),
    assignPlayerToTeam: vi.fn(),
    randomizeTeams: vi.fn(),
    selectGame: vi.fn(),
    startTriviaGame: vi.fn(),
    startGestosGame: vi.fn(),
    ...overrides,
  };
}

describe("TeamManager", () => {
  it("crear un equipo llama a actions.createTeam", () => {
    const actions = makeActions();
    render(<TeamManager state={makeRoom()} actions={actions} />);

    fireEvent.change(screen.getByPlaceholderText("Nombre del equipo"), {
      target: { value: "Rojos" },
    });
    fireEvent.click(screen.getByRole("button", { name: /agregar equipo/i }));

    expect(actions.createTeam).toHaveBeenCalledWith("Rojos", expect.any(String));
  });

  it("eliminar un equipo llama a actions.removeTeam", () => {
    const actions = makeActions();
    const room = makeRoom({
      teams: [{ id: "t1", name: "Rojos", color: "#ef4444", playerIds: [], score: 0 }],
    });
    render(<TeamManager state={room} actions={actions} />);

    fireEvent.click(screen.getByRole("button", { name: /eliminar equipo rojos/i }));

    expect(actions.removeTeam).toHaveBeenCalledWith("t1");
  });

  it("asignar un jugador sin equipo llama a actions.assignPlayerToTeam", () => {
    const actions = makeActions();
    const room = makeRoom({
      players: [{ id: "p1", name: "Ana", socketId: "s1" }],
      teams: [{ id: "t1", name: "Rojos", color: "#ef4444", playerIds: [], score: 0 }],
    });
    render(<TeamManager state={room} actions={actions} />);

    fireEvent.click(screen.getByLabelText("Asignar a Ana al equipo Rojos"));

    expect(actions.assignPlayerToTeam).toHaveBeenCalledWith("p1", "t1");
  });

  it("randomizar llama a actions.randomizeTeams", () => {
    const actions = makeActions();
    const room = makeRoom({
      teams: [{ id: "t1", name: "Rojos", color: "#ef4444", playerIds: [], score: 0 }],
    });
    render(<TeamManager state={room} actions={actions} />);

    fireEvent.click(screen.getByRole("button", { name: /randomizar equipos/i }));

    expect(actions.randomizeTeams).toHaveBeenCalled();
  });

  it("el botón de randomizar está deshabilitado sin equipos", () => {
    render(<TeamManager state={makeRoom()} actions={makeActions()} />);

    expect(screen.getByRole("button", { name: /randomizar equipos/i })).toBeDisabled();
  });
});
