import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScreenAdivinaPalabra } from "./screen-adivina-palabra";
import type { RoomState } from "@/lib/room-types";
import type { RoomActions } from "@/hooks/use-room-state";
import type { AdivinaPalabraView } from "@/lib/adivina-palabra-match";

const { playCorrectSound, playIncorrectSound, playVictorySound } = vi.hoisted(() => ({
  playCorrectSound: vi.fn(),
  playIncorrectSound: vi.fn(),
  playVictorySound: vi.fn(),
}));

vi.mock("@/lib/game-sounds", () => ({ playCorrectSound, playIncorrectSound, playVictorySound }));

afterEach(() => {
  vi.clearAllMocks();
});

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: "ABCDE",
    status: "jugando",
    players: [],
    teams: [
      { id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 5 },
      { id: "t2", name: "Azules", color: "#3b82f6", playerIds: ["p2"], score: 3 },
    ],
    round: null,
    currentGame: "adivina-palabra",
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
    startAdivinaPalabraGame: vi.fn(),
    ...overrides,
  };
}

describe("ScreenAdivinaPalabra", () => {
  it("en idle, arranca la partida una sola vez", () => {
    const startAdivinaPalabraGame = vi.fn();
    const { rerender } = render(
      <ScreenAdivinaPalabra
        state={makeRoom()}
        actions={makeActions({ startAdivinaPalabraGame })}
        adivinaPalabra={{ phase: "idle" }}
      />,
    );

    rerender(
      <ScreenAdivinaPalabra
        state={makeRoom()}
        actions={makeActions({ startAdivinaPalabraGame })}
        adivinaPalabra={{ phase: "idle" }}
      />,
    );

    expect(startAdivinaPalabraGame).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/arrancando adivina la palabra/i)).toBeInTheDocument();
  });

  it("en waiting_ready, muestra a quién le toca, el equipo y el marcador", () => {
    const adivinaPalabra: AdivinaPalabraView = {
      phase: "waiting_ready",
      playerId: "p1",
      playerName: "Ana",
      teamId: "t1",
      marcador: [{ teamId: "t1", score: 5 }, { teamId: "t2", score: 3 }],
    };

    render(<ScreenAdivinaPalabra state={makeRoom()} actions={makeActions()} adivinaPalabra={adivinaPalabra} />);

    expect(screen.getByText("Ana", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText(/rojos/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/rojos: 5/i)).toBeInTheDocument();
  });

  it("en active_screen, muestra la palabra y el tiempo restante", () => {
    const adivinaPalabra: AdivinaPalabraView = {
      phase: "active_screen",
      playerId: "p1",
      playerName: "Ana",
      teamId: "t1",
      marcador: [{ teamId: "t1", score: 5 }],
      palabra: "Elefante",
      remainingSeconds: 20,
      pasesRestantes: 2,
      lastAccion: null,
    };

    render(<ScreenAdivinaPalabra state={makeRoom()} actions={makeActions()} adivinaPalabra={adivinaPalabra} />);

    expect(screen.getByText("Elefante")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("con palabra null, muestra el mensaje de pool agotado en vez de romper", () => {
    const adivinaPalabra: AdivinaPalabraView = {
      phase: "active_screen",
      playerId: "p1",
      playerName: "Ana",
      teamId: "t1",
      marcador: [],
      palabra: null,
      remainingSeconds: 5,
      pasesRestantes: 0,
      lastAccion: null,
    };

    render(<ScreenAdivinaPalabra state={makeRoom()} actions={makeActions()} adivinaPalabra={adivinaPalabra} />);

    expect(screen.getByText("Sin más palabras…")).toBeInTheDocument();
  });

  it("lastAccion adivinada llama playCorrectSound, no playIncorrectSound", () => {
    const active: AdivinaPalabraView = {
      phase: "active_screen",
      playerId: "p1",
      playerName: "Ana",
      teamId: "t1",
      marcador: [],
      palabra: "Elefante",
      remainingSeconds: 20,
      pasesRestantes: 2,
      lastAccion: null,
    };
    const { rerender } = render(
      <ScreenAdivinaPalabra state={makeRoom()} actions={makeActions()} adivinaPalabra={active} />,
    );

    rerender(
      <ScreenAdivinaPalabra
        state={makeRoom()}
        actions={makeActions()}
        adivinaPalabra={{ ...active, palabra: "Médico", lastAccion: { tipo: "adivinada" } }}
      />,
    );

    expect(playCorrectSound).toHaveBeenCalledTimes(1);
    expect(playIncorrectSound).not.toHaveBeenCalled();
  });

  it("lastAccion paso llama playIncorrectSound, no playCorrectSound", () => {
    const active: AdivinaPalabraView = {
      phase: "active_screen",
      playerId: "p1",
      playerName: "Ana",
      teamId: "t1",
      marcador: [],
      palabra: "Elefante",
      remainingSeconds: 20,
      pasesRestantes: 3,
      lastAccion: null,
    };
    const { rerender } = render(
      <ScreenAdivinaPalabra state={makeRoom()} actions={makeActions()} adivinaPalabra={active} />,
    );

    rerender(
      <ScreenAdivinaPalabra
        state={makeRoom()}
        actions={makeActions()}
        adivinaPalabra={{ ...active, palabra: "Médico", pasesRestantes: 2, lastAccion: { tipo: "paso" } }}
      />,
    );

    expect(playIncorrectSound).toHaveBeenCalledTimes(1);
    expect(playCorrectSound).not.toHaveBeenCalled();
  });

  it("un tick del temporizador (lastAccion null) no dispara ningún sonido", () => {
    const active: AdivinaPalabraView = {
      phase: "active_screen",
      playerId: "p1",
      playerName: "Ana",
      teamId: "t1",
      marcador: [],
      palabra: "Elefante",
      remainingSeconds: 20,
      pasesRestantes: 3,
      lastAccion: null,
    };
    const { rerender } = render(
      <ScreenAdivinaPalabra state={makeRoom()} actions={makeActions()} adivinaPalabra={active} />,
    );

    rerender(
      <ScreenAdivinaPalabra
        state={makeRoom()}
        actions={makeActions()}
        adivinaPalabra={{ ...active, remainingSeconds: 19 }}
      />,
    );

    expect(playCorrectSound).not.toHaveBeenCalled();
    expect(playIncorrectSound).not.toHaveBeenCalled();
  });

  it("en turn_result, muestra el jugador, los puntos, el resumen verde/rojo y el siguiente si ya llegó", () => {
    const adivinaPalabra: AdivinaPalabraView = {
      phase: "turn_result",
      resultado: {
        playerId: "p1",
        playerName: "Ana",
        teamId: "t1",
        adivinadas: ["Elefante"],
        pasadas: ["Médico"],
        puntos: 1,
      },
      siguiente: { playerId: "p2", playerName: "Beto", teamId: "t2", marcador: [] },
    };

    render(<ScreenAdivinaPalabra state={makeRoom()} actions={makeActions()} adivinaPalabra={adivinaPalabra} />);

    expect(screen.getByText("Ana", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/1 punto/i)).toBeInTheDocument();
    expect(screen.getByText("Elefante")).toBeInTheDocument();
    expect(screen.getByText("Médico")).toBeInTheDocument();
    expect(screen.getByText("Beto", { exact: false })).toBeInTheDocument();
  });

  it("en match_result, muestra el puntaje final, las palabras por equipo y llama playVictorySound una sola vez", () => {
    const adivinaPalabra: AdivinaPalabraView = {
      phase: "match_result",
      scores: [
        { teamId: "t1", score: 5 },
        { teamId: "t2", score: 3 },
      ],
      palabrasPorEquipo: [
        { teamId: "t1", palabras: ["Elefante"] },
        { teamId: "t2", palabras: ["Médico"] },
      ],
    };

    const { rerender } = render(
      <ScreenAdivinaPalabra state={makeRoom()} actions={makeActions()} adivinaPalabra={adivinaPalabra} />,
    );
    rerender(
      <ScreenAdivinaPalabra state={makeRoom()} actions={makeActions()} adivinaPalabra={adivinaPalabra} />,
    );

    expect(screen.getByText("Rojos")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Azules")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Elefante")).toBeInTheDocument();
    expect(screen.getByText("Médico")).toBeInTheDocument();
    expect(playVictorySound).toHaveBeenCalledTimes(1);
  });
});
