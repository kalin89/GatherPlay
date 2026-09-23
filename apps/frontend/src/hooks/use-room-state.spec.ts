import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRoomState } from "./use-room-state";
import type { RoomState } from "@/lib/room-types";

class FakeSocket {
  handlers = new Map<string, (payload?: unknown) => void>();
  emitted: { event: string; payload: unknown }[] = [];
  disconnected = false;

  on(event: string, handler: (payload?: unknown) => void) {
    this.handlers.set(event, handler);
  }

  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
  }

  disconnect() {
    this.disconnected = true;
  }

  triggerConnect() {
    this.handlers.get("connect")?.();
  }

  triggerRoomState(state: RoomState) {
    this.handlers.get("room_state")?.(state);
  }

  triggerError(payload: { message: string }) {
    this.handlers.get("error")?.(payload);
  }
}

let lastSocket: FakeSocket | null = null;

vi.mock("@/lib/socket", () => ({
  createSocket: () => {
    lastSocket = new FakeSocket();
    return lastSocket;
  },
}));

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: "ABCDE",
    status: "lobby",
    players: [],
    teams: [],
    round: null,
    ...overrides,
  };
}

describe("useRoomState", () => {
  afterEach(() => {
    lastSocket = null;
    vi.restoreAllMocks();
  });

  it("createTeam emite create_team con el código de sala", () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    act(() => result.current.actions.createTeam("Rojos", "#ef4444"));

    expect(lastSocket?.emitted).toContainEqual({
      event: "create_team",
      payload: { code: "ABCDE", name: "Rojos", color: "#ef4444" },
    });
  });

  it("removeTeam emite remove_team con el código de sala", () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    act(() => result.current.actions.removeTeam("t1"));

    expect(lastSocket?.emitted).toContainEqual({
      event: "remove_team",
      payload: { code: "ABCDE", teamId: "t1" },
    });
  });

  it("assignPlayerToTeam emite assign_team con el código de sala", () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    act(() => result.current.actions.assignPlayerToTeam("p1", "t1"));

    expect(lastSocket?.emitted).toContainEqual({
      event: "assign_team",
      payload: { code: "ABCDE", playerId: "p1", teamId: "t1" },
    });
  });

  it("randomizeTeams emite randomize_teams con el código de sala", () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    act(() => result.current.actions.randomizeTeams());

    expect(lastSocket?.emitted).toContainEqual({
      event: "randomize_teams",
      payload: { code: "ABCDE" },
    });
  });

  it("un error antes del primer room_state es fatal (error)", async () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    act(() => lastSocket?.triggerConnect());
    act(() => lastSocket?.triggerError({ message: "La sala no existe" }));

    await waitFor(() => {
      expect(result.current.error?.message).toBe("La sala no existe");
      expect(result.current.actionError).toBeNull();
    });
  });

  it("un error después de tener state cargado va a actionError, no a error", async () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    act(() => lastSocket?.triggerConnect());
    act(() => lastSocket?.triggerRoomState(makeRoom()));
    act(() => lastSocket?.triggerError({ message: "No existe un equipo con ese id" }));

    await waitFor(() => {
      expect(result.current.actionError?.message).toBe(
        "No existe un equipo con ese id",
      );
      expect(result.current.error).toBeNull();
      expect(result.current.state).not.toBeNull();
    });
  });
});
