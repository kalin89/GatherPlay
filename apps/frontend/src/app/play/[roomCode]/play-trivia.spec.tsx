import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PlayTrivia } from "./play-trivia";
import type { RoomState } from "@/lib/room-types";
import type { TriviaMatchView } from "@/lib/trivia-match";

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: "ABCDE",
    status: "jugando",
    players: [
      { id: "p1", name: "Ana", socketId: "s1" },
      { id: "p2", name: "Beto", socketId: "s2" },
    ],
    teams: [
      { id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 100 },
      { id: "t2", name: "Azules", color: "#3b82f6", playerIds: ["p2"], score: 0 },
    ],
    round: null,
    currentGame: "trivia",
    ...overrides,
  };
}

describe("PlayTrivia", () => {
  it("en waiting_turn no muestra ninguna pregunta", () => {
    const trivia: TriviaMatchView = {
      phase: "waiting_turn",
      playerId: "p2",
      playerName: "Beto",
      teamId: "t2",
    };

    render(
      <PlayTrivia
        state={makeRoom()}
        playerId="p1"
        trivia={trivia}
        submitAnswer={vi.fn()}
        actionError={null}
      />,
    );

    expect(screen.getByText(/le toca a/i)).toBeInTheDocument();
    expect(screen.getByText("Beto")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("en my_turn permite tocar una opción y deshabilita las demás", () => {
    const submitAnswer = vi.fn();
    const trivia: TriviaMatchView = {
      phase: "my_turn",
      playerId: "p1",
      playerName: "Ana",
      pregunta: "¿2+2?",
      opciones: ["3", "4", "5", "6"],
      durationSeconds: 15,
      remainingSeconds: 12,
    };

    render(
      <PlayTrivia
        state={makeRoom()}
        playerId="p1"
        trivia={trivia}
        submitAnswer={submitAnswer}
        actionError={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /4/ }));

    expect(submitAnswer).toHaveBeenCalledWith(1);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });

  it("turn_result propio muestra el mensaje de acierto y revela la respuesta correcta", () => {
    const trivia: TriviaMatchView = {
      phase: "turn_result",
      pregunta: "¿2+2?",
      opciones: ["3", "4", "5", "6"],
      indiceCorrecto: 1,
      resultado: {
        playerId: "p1",
        playerName: "Ana",
        teamId: "t1",
        opcionElegida: 1,
        correcta: true,
        puntos: 100,
      },
    };

    render(
      <PlayTrivia
        state={makeRoom()}
        playerId="p1"
        trivia={trivia}
        submitAnswer={vi.fn()}
        actionError={null}
      />,
    );

    expect(screen.getByText(/¡correcto! \+100/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /4/ }).className).toMatch(/correct/);
  });

  it("turn_result ajeno muestra un mensaje corto, sin grilla de opciones", () => {
    const trivia: TriviaMatchView = {
      phase: "turn_result",
      pregunta: "¿2+2?",
      opciones: ["3", "4", "5", "6"],
      indiceCorrecto: 1,
      resultado: {
        playerId: "p2",
        playerName: "Beto",
        teamId: "t2",
        opcionElegida: 0,
        correcta: false,
        puntos: 0,
      },
    };

    render(
      <PlayTrivia
        state={makeRoom()}
        playerId="p1"
        trivia={trivia}
        submitAnswer={vi.fn()}
        actionError={null}
      />,
    );

    expect(screen.getByText(/beto/i)).toBeInTheDocument();
    expect(screen.getByText(/falló/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("match_result destaca el equipo propio", () => {
    const trivia: TriviaMatchView = {
      phase: "match_result",
      scores: [
        { teamId: "t1", score: 300 },
        { teamId: "t2", score: 100 },
      ],
    };

    render(
      <PlayTrivia
        state={makeRoom()}
        playerId="p1"
        trivia={trivia}
        submitAnswer={vi.fn()}
        actionError={null}
      />,
    );

    const rojosRow = screen.getByText("Rojos").closest("li");
    expect(rojosRow?.className).toMatch(/myTeam/);
  });

  it("muestra actionError sin reemplazar la vista", () => {
    const trivia: TriviaMatchView = {
      phase: "my_turn",
      playerId: "p1",
      playerName: "Ana",
      pregunta: "¿2+2?",
      opciones: ["3", "4", "5", "6"],
      durationSeconds: 15,
      remainingSeconds: 12,
    };

    render(
      <PlayTrivia
        state={makeRoom()}
        playerId="p1"
        trivia={trivia}
        submitAnswer={vi.fn()}
        actionError={{ message: "Ya habías respondido" }}
      />,
    );

    expect(screen.getByText("Ya habías respondido")).toBeInTheDocument();
    expect(screen.getByText("¿2+2?")).toBeInTheDocument();
  });
});
