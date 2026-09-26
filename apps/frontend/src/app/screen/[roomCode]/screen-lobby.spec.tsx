import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("sin equipos, el botón de mostrar código está deshabilitado y no hay QR", async () => {
    render(<ScreenLobby roomCode="ABCDE" />);
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(makeRoom());

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /mostrar código/i }),
      ).toBeDisabled();
      expect(screen.queryByText("ABCDE")).not.toBeInTheDocument();
    });
  });

  it("con un equipo creado, se habilita mostrar código; al hacer click se revela", async () => {
    render(<ScreenLobby roomCode="ABCDE" />);
    lastSocket?.triggerConnect();
    // El primer room_state llega sin equipos (no dispara el auto-revelado);
    // el equipo se crea después, ya con la pantalla montada.
    lastSocket?.triggerRoomState(makeRoom());
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /mostrar código/i }),
      ).toBeDisabled();
    });

    lastSocket?.triggerRoomState(
      makeRoom({
        teams: [{ id: "t1", name: "Rojos", color: "#ef4444", playerIds: [], score: 0 }],
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /mostrar código/i }),
      ).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /mostrar código/i }));

    expect(screen.getByText("ABCDE")).toBeInTheDocument();
  });

  it("arranca revelado si el primer room_state ya trae equipos (sobrevive F5)", async () => {
    render(<ScreenLobby roomCode="ABCDE" />);
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(
      makeRoom({
        teams: [{ id: "t1", name: "Rojos", color: "#ef4444", playerIds: [], score: 0 }],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("ABCDE")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /mostrar código/i }),
    ).not.toBeInTheDocument();
  });

  it("un error de acción después de tener estado se muestra sin reemplazar la vista", async () => {
    render(<ScreenLobby roomCode="ABCDE" />);
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(makeRoom());
    lastSocket?.triggerError({ message: "No existe un equipo con ese id" });

    await waitFor(() => {
      expect(screen.getByText("No existe un equipo con ese id")).toBeInTheDocument();
      // La vista de lobby sigue ahí, no se reemplazó por "sala no encontrada".
      expect(screen.queryByText(/no encontramos la sala/i)).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText("Nombre del equipo")).toBeInTheDocument();
    });
  });

  it("crear un equipo desde el formulario emite create_team", async () => {
    render(<ScreenLobby roomCode="ABCDE" />);
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(makeRoom());

    await waitFor(() =>
      expect(screen.getByPlaceholderText("Nombre del equipo")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByPlaceholderText("Nombre del equipo"), {
      target: { value: "Rojos" },
    });
    fireEvent.click(screen.getByRole("button", { name: /agregar equipo/i }));

    expect(lastSocket?.emitted).toContainEqual({
      event: "create_team",
      payload: { code: "ABCDE", name: "Rojos", color: expect.any(String) },
    });
  });

  it("el botón de iniciar partida está deshabilitado si ningún equipo tiene jugadores", async () => {
    render(<ScreenLobby roomCode="ABCDE" />);
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(
      makeRoom({
        teams: [{ id: "t1", name: "Rojos", color: "#ef4444", playerIds: [], score: 0 }],
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /iniciar partida/i }),
      ).toBeDisabled();
    });
  });

  it("el botón de iniciar partida se habilita con al menos un jugador en un equipo", async () => {
    render(<ScreenLobby roomCode="ABCDE" />);
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(
      makeRoom({
        players: [{ id: "p1", name: "Ana", socketId: "s1" }],
        teams: [{ id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 0 }],
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /iniciar partida/i }),
      ).toBeEnabled();
    });
  });

  it("iniciar partida muestra el panel de selección, y elegir un juego emite select_game", async () => {
    render(<ScreenLobby roomCode="ABCDE" />);
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(
      makeRoom({
        players: [{ id: "p1", name: "Ana", socketId: "s1" }],
        teams: [{ id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 300 }],
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /iniciar partida/i })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /iniciar partida/i }));

    await waitFor(() => {
      expect(screen.getByText("Elegí un juego")).toBeInTheDocument();
      expect(screen.getByText("Rojos")).toBeInTheDocument();
      expect(screen.getByText("300")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /trivia/i }));

    expect(lastSocket?.emitted).toContainEqual({
      event: "select_game",
      payload: { code: "ABCDE", gameId: "trivia" },
    });
  });

  it("con un juego elegido, muestra la pantalla de ese juego en vez del lobby", async () => {
    render(<ScreenLobby roomCode="ABCDE" />);
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(makeRoom({ currentGame: "trivia" }));

    await waitFor(() => {
      expect(screen.getByText(/arrancando trivia/i)).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Nombre del equipo")).not.toBeInTheDocument();
    });
  });

  it("con Caras y Gestos elegido, muestra su pantalla en vez del lobby", async () => {
    render(<ScreenLobby roomCode="ABCDE" />);
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(makeRoom({ currentGame: "caras-y-gestos" }));

    await waitFor(() => {
      expect(screen.getByText(/arrancando caras y gestos/i)).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Nombre del equipo")).not.toBeInTheDocument();
    });
  });

  it("con Adivina la palabra elegido, muestra su pantalla en vez del lobby", async () => {
    render(<ScreenLobby roomCode="ABCDE" />);
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(makeRoom({ currentGame: "adivina-palabra" }));

    await waitFor(() => {
      expect(screen.getByText(/arrancando adivina la palabra/i)).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Nombre del equipo")).not.toBeInTheDocument();
    });
  });

  it("de punta a punta: terminada una partida y vuelto al panel, elegir Trivia de nuevo arranca (no muestra el resultado viejo)", async () => {
    render(<ScreenLobby roomCode="ABCDE" />);
    lastSocket?.triggerConnect();
    lastSocket?.triggerRoomState(
      makeRoom({
        teams: [{ id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 0 }],
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /iniciar partida/i })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /iniciar partida/i }));
    await waitFor(() => expect(screen.getByText("Elegí un juego")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /trivia/i }));

    lastSocket?.triggerRoomState(
      makeRoom({
        currentGame: "trivia",
        teams: [{ id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 0 }],
      }),
    );
    await waitFor(() => expect(screen.getByText(/arrancando trivia/i)).toBeInTheDocument());

    // Primera partida: llega a resultado.
    lastSocket?.trigger("trivia_match_result", {
      code: "ABCDE",
      scores: [{ teamId: "t1", score: 100 }],
    });
    await waitFor(() => expect(screen.getByText("Resultado final")).toBeInTheDocument());

    // El backend, 10s después, resetea currentGame a null (simulado acá con el
    // room_state que ese timeout dispara).
    lastSocket?.triggerRoomState(
      makeRoom({
        teams: [{ id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 100 }],
      }),
    );
    await waitFor(() => expect(screen.getByText("Elegí un juego")).toBeInTheDocument());

    // El host elige Trivia de nuevo.
    fireEvent.click(screen.getByRole("button", { name: /trivia/i }));
    lastSocket?.triggerRoomState(
      makeRoom({
        currentGame: "trivia",
        teams: [{ id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 100 }],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/arrancando trivia/i)).toBeInTheDocument();
      expect(screen.queryByText("Resultado final")).not.toBeInTheDocument();
    });
  });
});
