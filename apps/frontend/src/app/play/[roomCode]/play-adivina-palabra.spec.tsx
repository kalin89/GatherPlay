import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PlayAdivinaPalabra } from "./play-adivina-palabra";
import type { RoomState } from "@/lib/room-types";
import type { AdivinaPalabraView } from "@/lib/adivina-palabra-match";

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: "ABCDE",
    status: "jugando",
    players: [
      { id: "p1", name: "Ana", socketId: "s1" },
      { id: "p2", name: "Beto", socketId: "s2" },
    ],
    teams: [
      { id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 5 },
      { id: "t2", name: "Azules", color: "#3b82f6", playerIds: ["p2"], score: 3 },
    ],
    round: null,
    currentGame: "adivina-palabra",
    ...overrides,
  };
}

describe("PlayAdivinaPalabra", () => {
  it("waiting_ready ajeno muestra el equipo y el nombre del Adivinador, sin ningún botón", () => {
    const adivinaPalabra: AdivinaPalabraView = {
      phase: "waiting_ready",
      playerId: "p2",
      playerName: "Beto",
      teamId: "t2",
      marcador: [],
    };

    render(
      <PlayAdivinaPalabra
        state={makeRoom()}
        playerId="p1"
        adivinaPalabra={adivinaPalabra}
        markAdivinaReady={vi.fn()}
        markAdivinaGuess={vi.fn()}
        markAdivinaPass={vi.fn()}
        actionError={null}
      />,
    );

    expect(screen.getByText(/azules/i)).toBeInTheDocument();
    expect(screen.getByText("Beto")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("waiting_ready propio muestra el botón Listo, que llama a markAdivinaReady", () => {
    const markAdivinaReady = vi.fn();
    const adivinaPalabra: AdivinaPalabraView = {
      phase: "waiting_ready",
      playerId: "p1",
      playerName: "Ana",
      teamId: "t1",
      marcador: [],
    };

    render(
      <PlayAdivinaPalabra
        state={makeRoom()}
        playerId="p1"
        adivinaPalabra={adivinaPalabra}
        markAdivinaReady={markAdivinaReady}
        markAdivinaGuess={vi.fn()}
        markAdivinaPass={vi.fn()}
        actionError={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /listo/i }));

    expect(markAdivinaReady).toHaveBeenCalledTimes(1);
  });

  it("active_player muestra Adivinada/Paso, nunca la palabra actual en ningún elemento del DOM", () => {
    const markAdivinaGuess = vi.fn();
    const markAdivinaPass = vi.fn();
    const adivinaPalabra: AdivinaPalabraView = {
      phase: "active_player",
      remainingSeconds: 20,
      pasesRestantes: 3,
    };

    const { container } = render(
      <PlayAdivinaPalabra
        state={makeRoom()}
        playerId="p1"
        adivinaPalabra={adivinaPalabra}
        markAdivinaReady={vi.fn()}
        markAdivinaGuess={markAdivinaGuess}
        markAdivinaPass={markAdivinaPass}
        actionError={null}
      />,
    );

    expect(screen.getByRole("button", { name: /adivinada/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /paso/i })).toBeInTheDocument();
    expect((adivinaPalabra as { palabra?: string }).palabra).toBeUndefined();
    expect(container.textContent).not.toMatch(/elefante|mesa|médico/i);

    fireEvent.click(screen.getByRole("button", { name: /adivinada/i }));
    expect(markAdivinaGuess).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /paso/i }));
    expect(markAdivinaPass).toHaveBeenCalledTimes(1);
  });

  it("active_player con pasesRestantes en 0 deshabilita el botón Paso", () => {
    const adivinaPalabra: AdivinaPalabraView = {
      phase: "active_player",
      remainingSeconds: 10,
      pasesRestantes: 0,
    };

    render(
      <PlayAdivinaPalabra
        state={makeRoom()}
        playerId="p1"
        adivinaPalabra={adivinaPalabra}
        markAdivinaReady={vi.fn()}
        markAdivinaGuess={vi.fn()}
        markAdivinaPass={vi.fn()}
        actionError={null}
      />,
    );

    expect(screen.getByRole("button", { name: /paso/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /adivinada/i })).not.toBeDisabled();
  });

  it("turn_result propio muestra los puntos ganados", () => {
    const adivinaPalabra: AdivinaPalabraView = {
      phase: "turn_result",
      resultado: {
        playerId: "p1",
        playerName: "Ana",
        teamId: "t1",
        adivinadas: ["Mesa", "Elefante"],
        pasadas: ["Médico"],
        puntos: 2,
      },
    };

    render(
      <PlayAdivinaPalabra
        state={makeRoom()}
        playerId="p1"
        adivinaPalabra={adivinaPalabra}
        markAdivinaReady={vi.fn()}
        markAdivinaGuess={vi.fn()}
        markAdivinaPass={vi.fn()}
        actionError={null}
      />,
    );

    expect(screen.getByText(/2 puntos/i)).toBeInTheDocument();
  });

  it("turn_result ajeno muestra un mensaje corto, sin botones", () => {
    const adivinaPalabra: AdivinaPalabraView = {
      phase: "turn_result",
      resultado: {
        playerId: "p2",
        playerName: "Beto",
        teamId: "t2",
        adivinadas: ["Mesa", "Elefante", "Médico"],
        pasadas: [],
        puntos: 3,
      },
    };

    render(
      <PlayAdivinaPalabra
        state={makeRoom()}
        playerId="p1"
        adivinaPalabra={adivinaPalabra}
        markAdivinaReady={vi.fn()}
        markAdivinaGuess={vi.fn()}
        markAdivinaPass={vi.fn()}
        actionError={null}
      />,
    );

    expect(screen.getByText(/beto/i)).toBeInTheDocument();
    expect(screen.getByText(/3 palabras/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("turn_result con siguiente propio muestra el botón Listo, que llama a markAdivinaReady", () => {
    const markAdivinaReady = vi.fn();
    const adivinaPalabra: AdivinaPalabraView = {
      phase: "turn_result",
      resultado: {
        playerId: "p2",
        playerName: "Beto",
        teamId: "t2",
        adivinadas: ["Mesa"],
        pasadas: [],
        puntos: 1,
      },
      siguiente: { playerId: "p1", playerName: "Ana", teamId: "t1", marcador: [] },
    };

    render(
      <PlayAdivinaPalabra
        state={makeRoom()}
        playerId="p1"
        adivinaPalabra={adivinaPalabra}
        markAdivinaReady={markAdivinaReady}
        markAdivinaGuess={vi.fn()}
        markAdivinaPass={vi.fn()}
        actionError={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /listo/i }));

    expect(markAdivinaReady).toHaveBeenCalledTimes(1);
  });

  it("turn_result con siguiente ajeno muestra a quién le toca, sin botón Listo", () => {
    const adivinaPalabra: AdivinaPalabraView = {
      phase: "turn_result",
      resultado: {
        playerId: "p1",
        playerName: "Ana",
        teamId: "t1",
        adivinadas: ["Mesa", "Elefante"],
        pasadas: [],
        puntos: 2,
      },
      siguiente: { playerId: "p2", playerName: "Beto", teamId: "t2", marcador: [] },
    };

    render(
      <PlayAdivinaPalabra
        state={makeRoom()}
        playerId="p1"
        adivinaPalabra={adivinaPalabra}
        markAdivinaReady={vi.fn()}
        markAdivinaGuess={vi.fn()}
        markAdivinaPass={vi.fn()}
        actionError={null}
      />,
    );

    expect(screen.getByText(/2 puntos/i)).toBeInTheDocument();
    expect(screen.getByText(/azules/i)).toBeInTheDocument();
    expect(screen.getByText("Beto")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("match_result destaca el equipo propio", () => {
    const adivinaPalabra: AdivinaPalabraView = {
      phase: "match_result",
      scores: [
        { teamId: "t1", score: 5 },
        { teamId: "t2", score: 3 },
      ],
      palabrasPorEquipo: [
        { teamId: "t1", palabras: ["Mesa"] },
        { teamId: "t2", palabras: ["Elefante"] },
      ],
    };

    render(
      <PlayAdivinaPalabra
        state={makeRoom()}
        playerId="p1"
        adivinaPalabra={adivinaPalabra}
        markAdivinaReady={vi.fn()}
        markAdivinaGuess={vi.fn()}
        markAdivinaPass={vi.fn()}
        actionError={null}
      />,
    );

    const rojosRow = screen.getByText("Rojos").closest("li");
    expect(rojosRow?.className).toMatch(/myTeam/);
  });

  it("muestra actionError sin reemplazar la vista", () => {
    const adivinaPalabra: AdivinaPalabraView = {
      phase: "waiting_ready",
      playerId: "p1",
      playerName: "Ana",
      teamId: "t1",
      marcador: [],
    };

    render(
      <PlayAdivinaPalabra
        state={makeRoom()}
        playerId="p1"
        adivinaPalabra={adivinaPalabra}
        markAdivinaReady={vi.fn()}
        markAdivinaGuess={vi.fn()}
        markAdivinaPass={vi.fn()}
        actionError={{ message: "Ya alcanzaste el límite de pases" }}
      />,
    );

    expect(screen.getByText("Ya alcanzaste el límite de pases")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /listo/i })).toBeInTheDocument();
  });
});
