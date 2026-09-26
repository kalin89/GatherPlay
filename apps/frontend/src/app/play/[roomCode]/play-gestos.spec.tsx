import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PlayGestos } from "./play-gestos";
import type { RoomState } from "@/lib/room-types";
import type { GestosMatchView } from "@/lib/gestos-match";

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: "ABCDE",
    status: "jugando",
    players: [
      { id: "p1", name: "Ana", socketId: "s1" },
      { id: "p2", name: "Beto", socketId: "s2" },
    ],
    teams: [
      { id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 15 },
      { id: "t2", name: "Azules", color: "#3b82f6", playerIds: ["p2"], score: 12 },
    ],
    round: null,
    currentGame: "caras-y-gestos",
    ...overrides,
  };
}

describe("PlayGestos", () => {
  it("en waiting_turn no muestra ninguna palabra ni botones", () => {
    const gestos: GestosMatchView = {
      phase: "waiting_turn",
      playerId: "p2",
      playerName: "Beto",
      teamId: "t2",
    };

    render(
      <PlayGestos
        state={makeRoom()}
        playerId="p1"
        gestos={gestos}
        startGestosTurn={vi.fn()}
        markGestureWord={vi.fn()}
        actionError={null}
      />,
    );

    expect(screen.getByText(/le toca a/i)).toBeInTheDocument();
    expect(screen.getByText("Beto")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("en ready_to_start muestra el botón Iniciar, que llama a startGestosTurn", () => {
    const startGestosTurn = vi.fn();

    render(
      <PlayGestos
        state={makeRoom()}
        playerId="p1"
        gestos={{ phase: "ready_to_start" }}
        startGestosTurn={startGestosTurn}
        markGestureWord={vi.fn()}
        actionError={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /iniciar/i }));

    expect(startGestosTurn).toHaveBeenCalledTimes(1);
  });

  it("en my_turn_active muestra Adivinada/Paso, sin ninguna palabra en pantalla", () => {
    const markGestureWord = vi.fn();

    render(
      <PlayGestos
        state={makeRoom()}
        playerId="p1"
        gestos={{ phase: "my_turn_active" }}
        startGestosTurn={vi.fn()}
        markGestureWord={markGestureWord}
        actionError={null}
      />,
    );

    expect(screen.getByRole("button", { name: /adivinada/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /paso/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /adivinada/i }));
    expect(markGestureWord).toHaveBeenCalledWith("adivinada");

    fireEvent.click(screen.getByRole("button", { name: /paso/i }));
    expect(markGestureWord).toHaveBeenCalledWith("paso");
  });

  it("turn_result propio muestra los puntos ganados y las palabras adivinadas", () => {
    const gestos: GestosMatchView = {
      phase: "turn_result",
      resultado: {
        playerId: "p1",
        playerName: "Ana",
        teamId: "t1",
        palabrasAdivinadas: ["Elefante", "Nadar"],
        puntos: 2,
        motivo: "completado",
      },
    };

    render(
      <PlayGestos
        state={makeRoom()}
        playerId="p1"
        gestos={gestos}
        startGestosTurn={vi.fn()}
        markGestureWord={vi.fn()}
        actionError={null}
      />,
    );

    expect(screen.getByText(/2 puntos/i)).toBeInTheDocument();
    expect(screen.getByText("Elefante")).toBeInTheDocument();
    expect(screen.getByText("Nadar")).toBeInTheDocument();
  });

  it("turn_result ajeno muestra un mensaje corto, sin palabras ni botones", () => {
    const gestos: GestosMatchView = {
      phase: "turn_result",
      resultado: {
        playerId: "p2",
        playerName: "Beto",
        teamId: "t2",
        palabrasAdivinadas: ["Elefante", "Nadar", "Bombero"],
        puntos: 3,
        motivo: "tiempo",
      },
    };

    render(
      <PlayGestos
        state={makeRoom()}
        playerId="p1"
        gestos={gestos}
        startGestosTurn={vi.fn()}
        markGestureWord={vi.fn()}
        actionError={null}
      />,
    );

    expect(screen.getByText(/beto/i)).toBeInTheDocument();
    expect(screen.getByText(/3 palabras/i)).toBeInTheDocument();
    expect(screen.queryByText("Elefante")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("match_result destaca el equipo propio y sus palabras adivinadas", () => {
    const gestos: GestosMatchView = {
      phase: "match_result",
      scores: [
        { teamId: "t1", score: 15 },
        { teamId: "t2", score: 12 },
      ],
      palabrasPorEquipo: { t1: ["Elefante"], t2: ["Bombero"] },
    };

    render(
      <PlayGestos
        state={makeRoom()}
        playerId="p1"
        gestos={gestos}
        startGestosTurn={vi.fn()}
        markGestureWord={vi.fn()}
        actionError={null}
      />,
    );

    const rojosRow = screen.getByText("Rojos").closest("li");
    expect(rojosRow?.className).toMatch(/myTeam/);
    expect(screen.getByText("Elefante")).toBeInTheDocument();
    expect(screen.queryByText("Bombero")).not.toBeInTheDocument();
  });

  it("muestra actionError sin reemplazar la vista", () => {
    render(
      <PlayGestos
        state={makeRoom()}
        playerId="p1"
        gestos={{ phase: "ready_to_start" }}
        startGestosTurn={vi.fn()}
        markGestureWord={vi.fn()}
        actionError={{ message: "Ya habías presionado Iniciar" }}
      />,
    );

    expect(screen.getByText("Ya habías presionado Iniciar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /iniciar/i })).toBeInTheDocument();
  });
});
