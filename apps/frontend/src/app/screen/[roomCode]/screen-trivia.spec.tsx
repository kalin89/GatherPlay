import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScreenTrivia } from "./screen-trivia";
import type { RoomState } from "@/lib/room-types";
import type { RoomActions } from "@/hooks/use-room-state";
import type { TriviaMatchView } from "@/lib/trivia-match";

const { playCorrectSound, playIncorrectSound } = vi.hoisted(() => ({
  playCorrectSound: vi.fn(),
  playIncorrectSound: vi.fn(),
}));

vi.mock("@/lib/trivia-sounds", () => ({ playCorrectSound, playIncorrectSound }));

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: "ABCDE",
    status: "jugando",
    players: [],
    teams: [
      { id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 100 },
      { id: "t2", name: "Azules", color: "#3b82f6", playerIds: ["p2"], score: 0 },
    ],
    round: null,
    currentGame: "trivia",
    ...overrides,
  };
}

function makeActions(overrides: Partial<RoomActions> = {}): RoomActions {
  return {
    createTeam: vi.fn(),
    removeTeam: vi.fn(),
    assignPlayerToTeam: vi.fn(),
    randomizeTeams: vi.fn(),
    selectGame: vi.fn(),
    startTriviaGame: vi.fn(),
    ...overrides,
  };
}

describe("ScreenTrivia", () => {
  it("en idle, arranca la partida una sola vez", () => {
    const startTriviaGame = vi.fn();
    const { rerender } = render(
      <ScreenTrivia
        state={makeRoom()}
        actions={makeActions({ startTriviaGame })}
        trivia={{ phase: "idle" }}
      />,
    );

    rerender(
      <ScreenTrivia
        state={makeRoom()}
        actions={makeActions({ startTriviaGame })}
        trivia={{ phase: "idle" }}
      />,
    );

    expect(startTriviaGame).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/arrancando trivia/i)).toBeInTheDocument();
  });

  it("en my_turn, muestra la pregunta y las opciones de solo lectura", () => {
    const trivia: TriviaMatchView = {
      phase: "my_turn",
      playerId: "p1",
      playerName: "Ana",
      pregunta: "¿2+2?",
      opciones: ["3", "4", "5", "6"],
      durationSeconds: 15,
      remainingSeconds: 10,
    };

    render(<ScreenTrivia state={makeRoom()} actions={makeActions()} trivia={trivia} />);

    expect(screen.getByText("¿2+2?")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /4/ })).toBeDisabled();
  });

  it("en turn_result correcto, llama playCorrectSound una sola vez", () => {
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

    const { rerender } = render(
      <ScreenTrivia state={makeRoom()} actions={makeActions()} trivia={trivia} />,
    );
    rerender(<ScreenTrivia state={makeRoom()} actions={makeActions()} trivia={trivia} />);

    expect(playCorrectSound).toHaveBeenCalledTimes(1);
    expect(playIncorrectSound).not.toHaveBeenCalled();
  });

  it("en turn_result incorrecto, llama playIncorrectSound", () => {
    const trivia: TriviaMatchView = {
      phase: "turn_result",
      pregunta: "¿2+2?",
      opciones: ["3", "4", "5", "6"],
      indiceCorrecto: 1,
      resultado: {
        playerId: "p1",
        playerName: "Ana",
        teamId: "t1",
        opcionElegida: 0,
        correcta: false,
        puntos: 0,
      },
    };

    render(<ScreenTrivia state={makeRoom()} actions={makeActions()} trivia={trivia} />);

    expect(playIncorrectSound).toHaveBeenCalledTimes(1);
  });

  it("en match_result, muestra el puntaje final de cada equipo", () => {
    const trivia: TriviaMatchView = {
      phase: "match_result",
      scores: [
        { teamId: "t1", score: 300 },
        { teamId: "t2", score: 100 },
      ],
    };

    render(<ScreenTrivia state={makeRoom()} actions={makeActions()} trivia={trivia} />);

    expect(screen.getByText("Rojos")).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
    expect(screen.getByText("Azules")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });
});
