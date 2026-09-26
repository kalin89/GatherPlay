import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useJoinRoom } from "./use-join-room";
import type { RoomState } from "@/lib/room-types";

// Mismo doble mínimo que screen-lobby.spec.tsx, con `id` (para calcular
// `playerId` emparejando `player.socketId`) y `connect_error`.
class FakeSocket {
  id = "socket-1";
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

  triggerConnectError() {
    this.handlers.get("connect_error")?.();
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

describe("useJoinRoom", () => {
  afterEach(() => {
    lastSocket = null;
    vi.restoreAllMocks();
  });

  it("no emite join_room si el nombre está vacío o son solo espacios", () => {
    const { result } = renderHook(() => useJoinRoom("abcde"));

    act(() => result.current.join("   "));

    expect(lastSocket).toBeNull();
    expect(result.current.status).toBe("idle");
  });

  it("emite join_room con el código en mayúsculas y el nombre recortado", () => {
    const { result } = renderHook(() => useJoinRoom("abcde"));

    act(() => result.current.join("  Ana  "));
    lastSocket?.triggerConnect();

    expect(lastSocket?.emitted).toContainEqual({
      event: "join_room",
      payload: { code: "ABCDE", name: "Ana" },
    });
    expect(result.current.status).toBe("joining");
  });

  it("pasa a joined y calcula el playerId propio al recibir room_state", async () => {
    const { result } = renderHook(() => useJoinRoom("ABCDE"));

    act(() => result.current.join("Ana"));
    lastSocket?.triggerConnect();
    act(() =>
      lastSocket?.triggerRoomState(
        makeRoom({
          players: [
            { id: "other", name: "Beto", socketId: "socket-2" },
            { id: "p1", name: "Ana", socketId: "socket-1" },
          ],
        }),
      ),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("joined");
      expect(result.current.playerId).toBe("p1");
    });
  });

  it("pasa a error al recibir error del servidor (ej. sala inexistente)", async () => {
    const { result } = renderHook(() => useJoinRoom("ZZZZZ"));

    act(() => result.current.join("Ana"));
    lastSocket?.triggerConnect();
    act(() => lastSocket?.triggerError({ message: "La sala no existe" }));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
      expect(result.current.error?.message).toBe("La sala no existe");
    });
  });

  it("pasa a error si el socket no logra conectar", async () => {
    const { result } = renderHook(() => useJoinRoom("ABCDE"));

    act(() => result.current.join("Ana"));
    act(() => lastSocket?.triggerConnectError());

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
  });

  it("desconecta el socket al desmontar", () => {
    const { result, unmount } = renderHook(() => useJoinRoom("ABCDE"));

    act(() => result.current.join("Ana"));
    const socket = lastSocket;
    unmount();

    expect(socket?.disconnected).toBe(true);
  });

  it("submitAnswer emite submit_trivia_answer con el código en mayúsculas", () => {
    const { result } = renderHook(() => useJoinRoom("abcde"));

    act(() => result.current.join("Ana"));
    lastSocket?.triggerConnect();
    act(() => result.current.submitAnswer(2));

    expect(lastSocket?.emitted).toContainEqual({
      event: "submit_trivia_answer",
      payload: { code: "ABCDE", opcionIndex: 2 },
    });
  });

  it("un error después de joined va a actionError, no saca al jugador de la vista", async () => {
    const { result } = renderHook(() => useJoinRoom("ABCDE"));

    act(() => result.current.join("Ana"));
    lastSocket?.triggerConnect();
    act(() => lastSocket?.triggerRoomState(makeRoom()));
    await waitFor(() => expect(result.current.status).toBe("joined"));

    act(() => lastSocket?.triggerError({ message: "Ya habías respondido este turno" }));

    await waitFor(() => {
      expect(result.current.actionError?.message).toBe("Ya habías respondido este turno");
      expect(result.current.status).toBe("joined");
      expect(result.current.error).toBeNull();
    });
  });

  it("los eventos de trivia actualizan `trivia` vía el reducer compartido", async () => {
    const { result } = renderHook(() => useJoinRoom("ABCDE"));

    act(() => result.current.join("Ana"));
    lastSocket?.triggerConnect();

    act(() =>
      lastSocket?.trigger("trivia_turn_waiting", {
        code: "ABCDE",
        playerId: "p2",
        playerName: "Beto",
        teamId: "t2",
      }),
    );

    await waitFor(() => {
      expect(result.current.trivia).toEqual({
        phase: "waiting_turn",
        playerId: "p2",
        playerName: "Beto",
        teamId: "t2",
      });
    });
  });

  it("un room_state con currentGame: null resetea `trivia` a idle", async () => {
    const { result } = renderHook(() => useJoinRoom("ABCDE"));

    act(() => result.current.join("Ana"));
    lastSocket?.triggerConnect();
    act(() =>
      lastSocket?.trigger("trivia_turn_waiting", {
        code: "ABCDE",
        playerId: "p2",
        playerName: "Beto",
        teamId: "t2",
      }),
    );
    await waitFor(() => expect(result.current.trivia.phase).toBe("waiting_turn"));

    act(() => lastSocket?.triggerRoomState(makeRoom({ currentGame: null })));

    await waitFor(() => {
      expect(result.current.trivia).toEqual({ phase: "idle" });
    });
  });

  it("un room_state con currentGame no nulo no toca `trivia`", async () => {
    const { result } = renderHook(() => useJoinRoom("ABCDE"));

    act(() => result.current.join("Ana"));
    lastSocket?.triggerConnect();
    act(() =>
      lastSocket?.trigger("trivia_turn_waiting", {
        code: "ABCDE",
        playerId: "p2",
        playerName: "Beto",
        teamId: "t2",
      }),
    );
    await waitFor(() => expect(result.current.trivia.phase).toBe("waiting_turn"));

    act(() => lastSocket?.triggerRoomState(makeRoom({ currentGame: "trivia" })));

    await waitFor(() => {
      expect(result.current.trivia.phase).toBe("waiting_turn");
    });
  });

  it("startGestosTurn emite start_gestos_turn con el código en mayúsculas", () => {
    const { result } = renderHook(() => useJoinRoom("abcde"));

    act(() => result.current.join("Ana"));
    lastSocket?.triggerConnect();
    act(() => result.current.startGestosTurn());

    expect(lastSocket?.emitted).toContainEqual({
      event: "start_gestos_turn",
      payload: { code: "ABCDE" },
    });
  });

  it("markGestureWord emite mark_gesture_word con el código y el resultado", () => {
    const { result } = renderHook(() => useJoinRoom("abcde"));

    act(() => result.current.join("Ana"));
    lastSocket?.triggerConnect();
    act(() => result.current.markGestureWord("paso"));

    expect(lastSocket?.emitted).toContainEqual({
      event: "mark_gesture_word",
      payload: { code: "ABCDE", resultado: "paso" },
    });
  });

  it("gestos_turn_waiting con mi propio playerId pasa a ready_to_start", async () => {
    const { result } = renderHook(() => useJoinRoom("ABCDE"));

    act(() => result.current.join("Ana"));
    lastSocket?.triggerConnect();
    act(() =>
      lastSocket?.triggerRoomState(
        makeRoom({ players: [{ id: "p1", name: "Ana", socketId: "socket-1" }] }),
      ),
    );
    await waitFor(() => expect(result.current.playerId).toBe("p1"));

    act(() =>
      lastSocket?.trigger("gestos_turn_waiting", {
        code: "ABCDE",
        playerId: "p1",
        playerName: "Ana",
        teamId: "t1",
      }),
    );

    await waitFor(() => {
      expect(result.current.gestos).toEqual({ phase: "ready_to_start" });
    });
  });

  it("gestos_turn_waiting con el playerId de otro jugador pasa a waiting_turn", async () => {
    const { result } = renderHook(() => useJoinRoom("ABCDE"));

    act(() => result.current.join("Ana"));
    lastSocket?.triggerConnect();
    act(() =>
      lastSocket?.triggerRoomState(
        makeRoom({ players: [{ id: "p1", name: "Ana", socketId: "socket-1" }] }),
      ),
    );
    await waitFor(() => expect(result.current.playerId).toBe("p1"));

    act(() =>
      lastSocket?.trigger("gestos_turn_waiting", {
        code: "ABCDE",
        playerId: "p2",
        playerName: "Beto",
        teamId: "t2",
      }),
    );

    await waitFor(() => {
      expect(result.current.gestos).toEqual({
        phase: "waiting_turn",
        playerId: "p2",
        playerName: "Beto",
        teamId: "t2",
      });
    });
  });

  it("gestos_actor_ready pasa a my_turn_active, sin ninguna palabra", async () => {
    const { result } = renderHook(() => useJoinRoom("ABCDE"));

    act(() => result.current.join("Ana"));
    lastSocket?.triggerConnect();
    act(() => lastSocket?.trigger("gestos_actor_ready", { code: "ABCDE" }));

    await waitFor(() => {
      expect(result.current.gestos).toEqual({ phase: "my_turn_active" });
    });
  });

  it("un room_state con currentGame: null resetea `gestos` a idle", async () => {
    const { result } = renderHook(() => useJoinRoom("ABCDE"));

    act(() => result.current.join("Ana"));
    lastSocket?.triggerConnect();
    act(() => lastSocket?.trigger("gestos_actor_ready", { code: "ABCDE" }));
    await waitFor(() => expect(result.current.gestos.phase).toBe("my_turn_active"));

    act(() => lastSocket?.triggerRoomState(makeRoom({ currentGame: null })));

    await waitFor(() => {
      expect(result.current.gestos).toEqual({ phase: "idle" });
    });
  });
});
