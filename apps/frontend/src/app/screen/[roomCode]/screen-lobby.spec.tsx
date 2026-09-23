import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ScreenLobby } from "./screen-lobby";
import type { RoomState } from "@/lib/room-types";

// Doble mínimo de un socket de Socket.io: guarda los handlers registrados
// con `.on(...)` y expone `emitEvent` para simular mensajes del servidor
// en las pruebas.
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

describe("ScreenLobby", () => {
  afterEach(() => {
    lastSocket = null;
    vi.restoreAllMocks();
  });

  it("emite watch_room con el código de sala al conectar", () => {
    render(<ScreenLobby roomCode="ABCDE" />);

    lastSocket?.triggerConnect();

    expect(lastSocket?.emitted).toContainEqual({
      event: "watch_room",
      payload: { code: "ABCDE" },
    });
  });

  it("muestra el estado de conexión mientras no llega room_state", () => {
    render(<ScreenLobby roomCode="ABCDE" />);

    expect(screen.getByText("Conectando con la sala…")).toBeInTheDocument();
  });

  it("pinta el código y los jugadores al recibir room_state", async () => {
    render(<ScreenLobby roomCode="ABCDE" />);
    lastSocket?.triggerConnect();

    lastSocket?.triggerRoomState(
      makeRoom({
        players: [{ id: "p1", name: "Ana", socketId: "s1" }],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("ABCDE")).toBeInTheDocument();
      expect(screen.getByText("Ana")).toBeInTheDocument();
    });
  });

  it("muestra sala no encontrada al recibir error", async () => {
    render(<ScreenLobby roomCode="ZZZZZ" />);
    lastSocket?.triggerConnect();

    lastSocket?.triggerError({ message: "La sala no existe" });

    await waitFor(() => {
      expect(screen.getByText(/no encontramos la sala/i)).toBeInTheDocument();
    });
  });

  it("desconecta el socket al desmontar", () => {
    const { unmount } = render(<ScreenLobby roomCode="ABCDE" />);
    const socket = lastSocket;

    unmount();

    expect(socket?.disconnected).toBe(true);
  });
});
