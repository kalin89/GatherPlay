import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlayLobby } from "./play-lobby";
import type { RoomState } from "@/lib/room-types";

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

describe("PlayLobby", () => {
  afterEach(() => {
    lastSocket = null;
    vi.restoreAllMocks();
  });

  it("el botón de unirme está deshabilitado sin nombre", () => {
    render(<PlayLobby roomCode="ABCDE" />);

    expect(screen.getByRole("button", { name: /unirme/i })).toBeDisabled();
  });

  it("se une al escribir un nombre y enviar el formulario", () => {
    render(<PlayLobby roomCode="ABCDE" />);

    fireEvent.change(screen.getByPlaceholderText("Tu nombre"), {
      target: { value: "Ana" },
    });
    fireEvent.click(screen.getByRole("button", { name: /unirme/i }));
    lastSocket?.triggerConnect();

    expect(lastSocket?.emitted).toContainEqual({
      event: "join_room",
      payload: { code: "ABCDE", name: "Ana" },
    });
  });

  it("muestra la espera de equipos al unirse sin equipo asignado todavía", async () => {
    render(<PlayLobby roomCode="ABCDE" />);

    fireEvent.change(screen.getByPlaceholderText("Tu nombre"), {
      target: { value: "Ana" },
    });
    fireEvent.click(screen.getByRole("button", { name: /unirme/i }));
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(
      makeRoom({ players: [{ id: "p1", name: "Ana", socketId: "socket-1" }] }),
    );

    await waitFor(() => {
      expect(screen.getByText(/esperando a que el anfitrión/i)).toBeInTheDocument();
    });
  });

  it("muestra el equipo propio y espera la elección del juego", async () => {
    render(<PlayLobby roomCode="ABCDE" />);

    fireEvent.change(screen.getByPlaceholderText("Tu nombre"), {
      target: { value: "Ana" },
    });
    fireEvent.click(screen.getByRole("button", { name: /unirme/i }));
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(
      makeRoom({
        players: [{ id: "p1", name: "Ana", socketId: "socket-1" }],
        teams: [
          { id: "t1", name: "Rojos", color: "#ff0000", playerIds: ["p1"], score: 0 },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Rojos")).toBeInTheDocument();
      expect(screen.getByText(/esperando a que el anfitrión elija el juego/i)).toBeInTheDocument();
    });
  });

  it("con un juego elegido, muestra el control de ese juego en vez del equipo", async () => {
    render(<PlayLobby roomCode="ABCDE" />);

    fireEvent.change(screen.getByPlaceholderText("Tu nombre"), {
      target: { value: "Ana" },
    });
    fireEvent.click(screen.getByRole("button", { name: /unirme/i }));
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(
      makeRoom({
        currentGame: "trivia",
        players: [{ id: "p1", name: "Ana", socketId: "socket-1" }],
        teams: [
          { id: "t1", name: "Rojos", color: "#ff0000", playerIds: ["p1"], score: 0 },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/esperando a que arranque la partida/i)).toBeInTheDocument();
      expect(screen.queryByText("Rojos")).not.toBeInTheDocument();
    });
  });

  it("con Caras y Gestos elegido, muestra su control en vez del equipo", async () => {
    render(<PlayLobby roomCode="ABCDE" />);

    fireEvent.change(screen.getByPlaceholderText("Tu nombre"), {
      target: { value: "Ana" },
    });
    fireEvent.click(screen.getByRole("button", { name: /unirme/i }));
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(
      makeRoom({
        currentGame: "caras-y-gestos",
        players: [{ id: "p1", name: "Ana", socketId: "socket-1" }],
        teams: [
          { id: "t1", name: "Rojos", color: "#ff0000", playerIds: ["p1"], score: 0 },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/esperando a que arranque la partida/i)).toBeInTheDocument();
      expect(screen.queryByText("Rojos")).not.toBeInTheDocument();
    });
  });

  it("con Adivina la palabra elegido, muestra su control en vez del equipo", async () => {
    render(<PlayLobby roomCode="ABCDE" />);

    fireEvent.change(screen.getByPlaceholderText("Tu nombre"), {
      target: { value: "Ana" },
    });
    fireEvent.click(screen.getByRole("button", { name: /unirme/i }));
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(
      makeRoom({
        currentGame: "adivina-palabra",
        players: [{ id: "p1", name: "Ana", socketId: "socket-1" }],
        teams: [
          { id: "t1", name: "Rojos", color: "#ff0000", playerIds: ["p1"], score: 0 },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/esperando a que arranque la partida/i)).toBeInTheDocument();
      expect(screen.queryByText("Rojos")).not.toBeInTheDocument();
    });
  });

  it("con La Rocola elegido, muestra sus instrucciones en vez del equipo (sin botón Listo mientras el host configura)", async () => {
    render(<PlayLobby roomCode="ABCDE" />);

    fireEvent.change(screen.getByPlaceholderText("Tu nombre"), {
      target: { value: "Ana" },
    });
    fireEvent.click(screen.getByRole("button", { name: /unirme/i }));
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(
      makeRoom({
        currentGame: "la-rocola",
        players: [{ id: "p1", name: "Ana", socketId: "socket-1" }],
        teams: [
          { id: "t1", name: "Rojos", color: "#ff0000", playerIds: ["p1"], score: 0 },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("La Rocola")).toBeInTheDocument();
      expect(screen.getByText(/esperando a que el anfitrión configure/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /listo/i })).not.toBeInTheDocument();
      expect(screen.queryByText("Rojos")).not.toBeInTheDocument();
    });
  });

  it("muestra el mensaje de sala no encontrada al recibir error", async () => {
    render(<PlayLobby roomCode="ZZZZZ" />);

    fireEvent.change(screen.getByPlaceholderText("Tu nombre"), {
      target: { value: "Ana" },
    });
    fireEvent.click(screen.getByRole("button", { name: /unirme/i }));
    lastSocket?.triggerConnect();
    lastSocket?.triggerError({ message: "No existe una sala con el código ZZZZZ" });

    await waitFor(() => {
      expect(
        screen.getByText("No existe una sala con el código ZZZZZ"),
      ).toBeInTheDocument();
    });
  });

  describe("ciclo de vida de la sala", () => {
    function joinLobby(overrides: Partial<RoomState> = {}) {
      render(<PlayLobby roomCode="ABCDE" />);
      fireEvent.change(screen.getByPlaceholderText("Tu nombre"), {
        target: { value: "Ana" },
      });
      fireEvent.click(screen.getByRole("button", { name: /unirme/i }));
      lastSocket?.triggerConnect();
      lastSocket?.triggerRoomState(
        makeRoom({
          players: [{ id: "p1", name: "Ana", socketId: "socket-1" }],
          teams: [
            { id: "t1", name: "Rojos", color: "#ff0000", playerIds: ["p1"], score: 0 },
          ],
          ...overrides,
        }),
      );
    }

    it("no muestra el aviso de anfitrión desconectado mientras todo va bien", async () => {
      joinLobby();

      await waitFor(() => expect(screen.getByText("Rojos")).toBeInTheDocument());
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("muestra el aviso sobre el lobby con host_disconnected y lo quita con host_reconnected", async () => {
      joinLobby();
      await waitFor(() => expect(screen.getByText("Rojos")).toBeInTheDocument());

      act(() => lastSocket?.trigger("host_disconnected"));
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(/anfitrión perdió la conexión/i),
      );
      expect(screen.getByText("Rojos")).toBeInTheDocument();

      act(() => lastSocket?.trigger("host_reconnected"));
      await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    });

    it("muestra el aviso también sobre la vista de un juego en curso", async () => {
      joinLobby({ currentGame: "trivia" });
      await waitFor(() =>
        expect(screen.getByText(/esperando a que arranque la partida/i)).toBeInTheDocument(),
      );

      act(() => lastSocket?.trigger("host_disconnected"));

      await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
      expect(screen.getByText(/esperando a que arranque la partida/i)).toBeInTheDocument();
    });

    it("room_closed reemplaza la vista por el aviso de sala cerrada con enlace al inicio", async () => {
      joinLobby();
      await waitFor(() => expect(screen.getByText("Rojos")).toBeInTheDocument());

      act(() => lastSocket?.trigger("room_closed", { reason: "host_left" }));

      await waitFor(() =>
        expect(screen.getByText(/el anfitrión se desconectó y la sala se cerró/i)).toBeInTheDocument(),
      );
      expect(screen.queryByText("Rojos")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /volver al inicio/i })).toHaveAttribute("href", "/");
      expect(lastSocket?.disconnected).toBe(true);
    });
  });
});
