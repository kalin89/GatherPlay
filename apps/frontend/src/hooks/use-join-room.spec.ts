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
});
