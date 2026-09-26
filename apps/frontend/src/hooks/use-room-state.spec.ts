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

  off(event: string) {
    this.handlers.delete(event);
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

  trigger(event: string, payload?: unknown) {
    this.handlers.get(event)?.(payload);
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
    currentGame: null,
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

  it("selectGame emite select_game con el código de sala", () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    act(() => result.current.actions.selectGame("trivia"));

    expect(lastSocket?.emitted).toContainEqual({
      event: "select_game",
      payload: { code: "ABCDE", gameId: "trivia" },
    });
  });

  it("startTriviaGame emite start_trivia_game con el código de sala", () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    act(() => result.current.actions.startTriviaGame());

    expect(lastSocket?.emitted).toContainEqual({
      event: "start_trivia_game",
      payload: { code: "ABCDE" },
    });
  });

  it("startGestosGame emite start_gestos_game con el código de sala", () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    act(() => result.current.actions.startGestosGame());

    expect(lastSocket?.emitted).toContainEqual({
      event: "start_gestos_game",
      payload: { code: "ABCDE" },
    });
  });

  it("los eventos de trivia actualizan `trivia` vía el reducer compartido", async () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    expect(result.current.trivia).toEqual({ phase: "idle" });

    act(() =>
      lastSocket?.trigger("trivia_turn_started", {
        code: "ABCDE",
        playerId: "p1",
        playerName: "Ana",
        pregunta: "¿2+2?",
        opciones: ["3", "4", "5", "6"],
        durationSeconds: 15,
      }),
    );

    await waitFor(() => {
      expect(result.current.trivia).toMatchObject({ phase: "my_turn", pregunta: "¿2+2?" });
    });
  });

  it("un room_state con currentGame: null resetea `trivia` a idle", async () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    act(() =>
      lastSocket?.trigger("trivia_turn_started", {
        code: "ABCDE",
        playerId: "p1",
        playerName: "Ana",
        pregunta: "¿2+2?",
        opciones: ["3", "4", "5", "6"],
        durationSeconds: 15,
      }),
    );
    await waitFor(() => expect(result.current.trivia.phase).toBe("my_turn"));

    act(() => lastSocket?.triggerRoomState(makeRoom({ currentGame: null })));

    await waitFor(() => {
      expect(result.current.trivia).toEqual({ phase: "idle" });
    });
  });

  it("un room_state con currentGame no nulo no toca `trivia`", async () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    act(() =>
      lastSocket?.trigger("trivia_turn_started", {
        code: "ABCDE",
        playerId: "p1",
        playerName: "Ana",
        pregunta: "¿2+2?",
        opciones: ["3", "4", "5", "6"],
        durationSeconds: 15,
      }),
    );
    await waitFor(() => expect(result.current.trivia.phase).toBe("my_turn"));

    act(() => lastSocket?.triggerRoomState(makeRoom({ currentGame: "trivia" })));

    await waitFor(() => {
      expect(result.current.trivia.phase).toBe("my_turn");
    });
  });

  it("los eventos de Caras y Gestos actualizan `gestos` vía el reducer compartido, siempre en waiting_turn (nunca ready_to_start)", async () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    expect(result.current.gestos).toEqual({ phase: "idle" });

    act(() =>
      lastSocket?.trigger("gestos_turn_waiting", {
        code: "ABCDE",
        playerId: "p1",
        playerName: "Ana",
        teamId: "t1",
      }),
    );

    await waitFor(() => {
      expect(result.current.gestos).toEqual({
        phase: "waiting_turn",
        playerId: "p1",
        playerName: "Ana",
        teamId: "t1",
      });
    });
  });

  it("un room_state con currentGame: null resetea `gestos` a idle", async () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    act(() =>
      lastSocket?.trigger("gestos_turn_started", {
        code: "ABCDE",
        playerId: "p1",
        playerName: "Ana",
        palabra: "Elefante",
        durationSeconds: 60,
        palabrasRestantes: 5,
      }),
    );
    await waitFor(() => expect(result.current.gestos.phase).toBe("acting"));

    act(() => lastSocket?.triggerRoomState(makeRoom({ currentGame: null })));

    await waitFor(() => {
      expect(result.current.gestos).toEqual({ phase: "idle" });
    });
  });

  it("startAdivinaPalabraGame emite start_adivina_palabra_game con el código de sala", () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    act(() => result.current.actions.startAdivinaPalabraGame());

    expect(lastSocket?.emitted).toContainEqual({
      event: "start_adivina_palabra_game",
      payload: { code: "ABCDE" },
    });
  });

  it("los eventos de Adivina la palabra actualizan `adivinaPalabra` vía el reducer compartido", async () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    expect(result.current.adivinaPalabra).toEqual({ phase: "idle" });

    act(() =>
      lastSocket?.trigger("adivina_turn_waiting", {
        code: "ABCDE",
        playerId: "p1",
        playerName: "Ana",
        teamId: "t1",
        marcador: [{ teamId: "t1", score: 0 }],
      }),
    );

    await waitFor(() => {
      expect(result.current.adivinaPalabra).toEqual({
        phase: "waiting_ready",
        playerId: "p1",
        playerName: "Ana",
        teamId: "t1",
        marcador: [{ teamId: "t1", score: 0 }],
      });
    });
  });

  it("un room_state con currentGame: null resetea `adivinaPalabra` a idle", async () => {
    const { result } = renderHook(() => useRoomState("ABCDE"));

    act(() =>
      lastSocket?.trigger("adivina_pantalla_estado", {
        code: "ABCDE",
        palabra: "Mesa",
        remainingSeconds: 30,
        pasesRestantes: 3,
        ultimaAccion: null,
      }),
    );
    await waitFor(() => expect(result.current.adivinaPalabra.phase).toBe("active_screen"));

    act(() => lastSocket?.triggerRoomState(makeRoom({ currentGame: null })));

    await waitFor(() => {
      expect(result.current.adivinaPalabra).toEqual({ phase: "idle" });
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
