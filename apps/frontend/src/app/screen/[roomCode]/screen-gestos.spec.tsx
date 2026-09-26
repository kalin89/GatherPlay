import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScreenGestos } from "./screen-gestos";
import type { RoomState } from "@/lib/room-types";
import type { RoomActions } from "@/hooks/use-room-state";
import type { GestosMatchView } from "@/lib/gestos-match";

const { playCorrectSound, playPassSound, playVictorySound } = vi.hoisted(() => ({
  playCorrectSound: vi.fn(),
  playPassSound: vi.fn(),
  playVictorySound: vi.fn(),
}));

vi.mock("@/lib/game-sounds", () => ({ playCorrectSound, playPassSound, playVictorySound }));

afterEach(() => {
  vi.clearAllMocks();
});

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: "ABCDE",
    status: "jugando",
    players: [],
    teams: [
      { id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 15 },
      { id: "t2", name: "Azules", color: "#3b82f6", playerIds: ["p2"], score: 12 },
    ],
    round: null,
    currentGame: "caras-y-gestos",
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
    startGestosGame: vi.fn(),
    ...overrides,
  };
}

describe("ScreenGestos", () => {
  it("en idle, arranca la partida una sola vez", () => {
    const startGestosGame = vi.fn();
    const { rerender } = render(
      <ScreenGestos
        state={makeRoom()}
        actions={makeActions({ startGestosGame })}
        gestos={{ phase: "idle" }}
      />,
    );

    rerender(
      <ScreenGestos
        state={makeRoom()}
        actions={makeActions({ startGestosGame })}
        gestos={{ phase: "idle" }}
      />,
    );

    expect(startGestosGame).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/arrancando caras y gestos/i)).toBeInTheDocument();
  });

  it("en waiting_turn, muestra a quién le toca sin ninguna palabra", () => {
    const gestos: GestosMatchView = {
      phase: "waiting_turn",
      playerId: "p1",
      playerName: "Ana",
      teamId: "t1",
    };

    render(<ScreenGestos state={makeRoom()} actions={makeActions()} gestos={gestos} />);

    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  it("en acting, muestra la palabra, el tiempo restante y el progreso", () => {
    const gestos: GestosMatchView = {
      phase: "acting",
      palabra: "Elefante",
      durationSeconds: 60,
      remainingSeconds: 45,
      totalPalabras: 5,
      palabrasRestantes: 3,
      lastWordEvent: null,
    };

    render(<ScreenGestos state={makeRoom()} actions={makeActions()} gestos={gestos} />);

    expect(screen.getByText("Elefante")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("2/5 adivinadas")).toBeInTheDocument();
  });

  it("gestos_word_update con motivo adivinada llama playCorrectSound, no playPassSound", () => {
    const acting: GestosMatchView = {
      phase: "acting",
      palabra: "Elefante",
      durationSeconds: 60,
      remainingSeconds: 45,
      totalPalabras: 5,
      palabrasRestantes: 4,
      lastWordEvent: null,
    };
    const { rerender } = render(
      <ScreenGestos state={makeRoom()} actions={makeActions()} gestos={acting} />,
    );

    rerender(
      <ScreenGestos
        state={makeRoom()}
        actions={makeActions()}
        gestos={{ ...acting, palabra: "Nadar", palabrasRestantes: 3, lastWordEvent: { motivo: "adivinada" } }}
      />,
    );

    expect(playCorrectSound).toHaveBeenCalledTimes(1);
    expect(playPassSound).not.toHaveBeenCalled();
  });

  it("gestos_word_update con motivo paso llama playPassSound, no playCorrectSound", () => {
    const acting: GestosMatchView = {
      phase: "acting",
      palabra: "Elefante",
      durationSeconds: 60,
      remainingSeconds: 45,
      totalPalabras: 5,
      palabrasRestantes: 5,
      lastWordEvent: null,
    };
    const { rerender } = render(
      <ScreenGestos state={makeRoom()} actions={makeActions()} gestos={acting} />,
    );

    rerender(
      <ScreenGestos
        state={makeRoom()}
        actions={makeActions()}
        gestos={{ ...acting, palabra: "Nadar", lastWordEvent: { motivo: "paso" } }}
      />,
    );

    expect(playPassSound).toHaveBeenCalledTimes(1);
    expect(playCorrectSound).not.toHaveBeenCalled();
  });

  it("un tick del temporizador (sin lastWordEvent nuevo) no dispara ningún sonido", () => {
    const acting: GestosMatchView = {
      phase: "acting",
      palabra: "Elefante",
      durationSeconds: 60,
      remainingSeconds: 45,
      totalPalabras: 5,
      palabrasRestantes: 5,
      lastWordEvent: null,
    };
    const { rerender } = render(
      <ScreenGestos state={makeRoom()} actions={makeActions()} gestos={acting} />,
    );

    rerender(
      <ScreenGestos
        state={makeRoom()}
        actions={makeActions()}
        gestos={{ ...acting, remainingSeconds: 44 }}
      />,
    );

    expect(playCorrectSound).not.toHaveBeenCalled();
    expect(playPassSound).not.toHaveBeenCalled();
  });

  it("en turn_result, muestra el jugador, los puntos y las palabras adivinadas", () => {
    const gestos: GestosMatchView = {
      phase: "turn_result",
      resultado: {
        playerId: "p1",
        playerName: "Ana",
        teamId: "t1",
        palabrasAdivinadas: ["Elefante", "Nadar"],
        puntos: 2,
        motivo: "tiempo",
      },
    };

    render(<ScreenGestos state={makeRoom()} actions={makeActions()} gestos={gestos} />);

    expect(screen.getByText("Ana", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/2 puntos/i)).toBeInTheDocument();
    expect(screen.getByText("Elefante")).toBeInTheDocument();
    expect(screen.getByText("Nadar")).toBeInTheDocument();
  });

  it("en match_result, muestra el puntaje final, las palabras por equipo y llama playVictorySound una sola vez", () => {
    const gestos: GestosMatchView = {
      phase: "match_result",
      scores: [
        { teamId: "t1", score: 15 },
        { teamId: "t2", score: 12 },
      ],
      palabrasPorEquipo: { t1: ["Elefante", "Nadar"], t2: ["Bombero"] },
    };

    const { rerender } = render(
      <ScreenGestos state={makeRoom()} actions={makeActions()} gestos={gestos} />,
    );
    rerender(<ScreenGestos state={makeRoom()} actions={makeActions()} gestos={gestos} />);

    expect(screen.getByText("Rojos")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("Azules")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Elefante")).toBeInTheDocument();
    expect(screen.getByText("Bombero")).toBeInTheDocument();
    expect(playVictorySound).toHaveBeenCalledTimes(1);
  });
});
