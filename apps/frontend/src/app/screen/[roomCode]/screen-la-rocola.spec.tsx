import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScreenLaRocola } from "./screen-la-rocola";
import type { RoomState } from "@/lib/room-types";
import type { RoomActions, UseRoomStateResult } from "@/hooks/use-room-state";
import type { LaRocolaView } from "@/lib/la-rocola-match";

const { playCorrectSound, playIncorrectSound, playTickSound, playVictorySound } = vi.hoisted(() => ({
  playCorrectSound: vi.fn(),
  playIncorrectSound: vi.fn(),
  playTickSound: vi.fn(),
  playVictorySound: vi.fn(),
}));

vi.mock("@/lib/game-sounds", () => ({
  playCorrectSound,
  playIncorrectSound,
  playTickSound,
  playVictorySound,
}));

afterEach(() => {
  vi.clearAllMocks();
});

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: "ABCDE",
    status: "jugando",
    players: [],
    teams: [
      { id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 2 },
      { id: "t2", name: "Azules", color: "#3b82f6", playerIds: ["p2"], score: 1 },
    ],
    round: null,
    currentGame: "la-rocola",
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
    startLaRocolaGame: vi.fn(),
    getRocolaArtists: vi.fn(),
    ...overrides,
  };
}

function renderScreen(
  laRocola: LaRocolaView,
  overrides: {
    actions?: RoomActions;
    laRocolaAudio?: UseRoomStateResult["laRocolaAudio"];
    rocolaArtists?: string[] | null;
    actionError?: { message: string } | null;
  } = {},
) {
  return render(
    <ScreenLaRocola
      state={makeRoom()}
      actions={overrides.actions ?? makeActions()}
      laRocola={laRocola}
      laRocolaAudio={overrides.laRocolaAudio ?? null}
      rocolaArtists={overrides.rocolaArtists ?? null}
      actionError={overrides.actionError ?? null}
    />,
  );
}

describe("ScreenLaRocola", () => {
  it("en idle, pide la lista de artistas una sola vez y muestra el selector de filtro", () => {
    const getRocolaArtists = vi.fn();
    const { rerender } = renderScreen(
      { phase: "idle" },
      { actions: makeActions({ getRocolaArtists }) },
    );

    rerender(
      <ScreenLaRocola
        state={makeRoom()}
        actions={makeActions({ getRocolaArtists })}
        laRocola={{ phase: "idle" }}
        laRocolaAudio={null}
        rocolaArtists={null}
        actionError={null}
      />,
    );

    expect(getRocolaArtists).toHaveBeenCalledTimes(1);
    expect(screen.getByText("La Rocola")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /empezar/i })).toBeInTheDocument();
  });

  it('en idle, "Aleatorio" está seleccionado por default y "Empezar" llama startLaRocolaGame sin filtro', () => {
    const startLaRocolaGame = vi.fn();
    renderScreen({ phase: "idle" }, { actions: makeActions({ startLaRocolaGame }) });

    fireEvent.click(screen.getByRole("button", { name: /empezar/i }));

    expect(startLaRocolaGame).toHaveBeenCalledWith(undefined);
  });

  it('en idle, elegir "Por género" y un valor llama startLaRocolaGame con el filtro de género', () => {
    const startLaRocolaGame = vi.fn();
    renderScreen({ phase: "idle" }, { actions: makeActions({ startLaRocolaGame }) });

    fireEvent.click(screen.getByRole("button", { name: /por género/i }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "salsa" } });
    fireEvent.click(screen.getByRole("button", { name: /empezar/i }));

    expect(startLaRocolaGame).toHaveBeenCalledWith({ tipo: "genero", genero: "salsa" });
  });

  it('en idle, "Empezar" está deshabilitado hasta elegir un género concreto', () => {
    renderScreen({ phase: "idle" });

    fireEvent.click(screen.getByRole("button", { name: /por género/i }));

    expect(screen.getByRole("button", { name: /empezar/i })).toBeDisabled();
  });

  it('en idle, "Por artista" está deshabilitado mientras rocolaArtists es null, habilitado cuando llega la lista', () => {
    const { rerender } = renderScreen(
      { phase: "idle" },
      { rocolaArtists: null },
    );
    fireEvent.click(screen.getByRole("button", { name: /por artista/i }));
    expect(screen.getByRole("combobox")).toBeDisabled();

    rerender(
      <ScreenLaRocola
        state={makeRoom()}
        actions={makeActions()}
        laRocola={{ phase: "idle" }}
        laRocolaAudio={null}
        rocolaArtists={["José José", "Selena"]}
        actionError={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /por artista/i }));

    expect(screen.getByRole("combobox")).toBeEnabled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Selena" } });
    expect(screen.getByRole("option", { name: "Selena" })).toBeInTheDocument();
  });

  it("en idle, muestra el actionError inline sin perder la selección ya hecha", () => {
    renderScreen(
      { phase: "idle" },
      { actionError: { message: 'El filtro "salsa" tiene solo 3 canciones disponibles (hacen falta 10)' } },
    );

    fireEvent.click(screen.getByRole("button", { name: /por género/i }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "salsa" } });

    expect(screen.getByText(/tiene solo 3 canciones disponibles/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("salsa");
  });

  it("en waiting_ready, muestra las instrucciones y el progreso de listos", () => {
    const laRocola: LaRocolaView = {
      phase: "waiting_ready",
      readyPlayerIds: ["p1"],
      eligiblePlayerIds: ["p1", "p2"],
    };

    renderScreen(laRocola);

    expect(screen.getByText("La Rocola")).toBeInTheDocument();
    expect(screen.getByText(/1\/2 listos/i)).toBeInTheDocument();
  });

  it("en countdown, muestra el número de ronda y suena un tick por cada segundo distinto", () => {
    const laRocola: LaRocolaView = {
      phase: "countdown",
      remainingSeconds: 5,
      roundNumber: 1,
      totalRounds: 10,
      marcador: [{ teamId: "t1", score: 2 }],
    };
    const { rerender } = renderScreen(laRocola);
    expect(screen.getByText("Ronda 1 de 10")).toBeInTheDocument();
    expect(playTickSound).toHaveBeenCalledTimes(1);

    rerender(
      <ScreenLaRocola
        state={makeRoom()}
        actions={makeActions()}
        laRocola={{ ...laRocola, remainingSeconds: 4 }}
        laRocolaAudio={null}
        rocolaArtists={null}
        actionError={null}
      />,
    );
    expect(playTickSound).toHaveBeenCalledTimes(2);
  });

  it("en sonando, muestra el texto de la convención con emoji de música", () => {
    const laRocola: LaRocolaView = {
      phase: "sonando",
      roundNumber: 2,
      totalRounds: 10,
      marcador: [],
    };

    renderScreen(laRocola);

    expect(screen.getByText(/adivina la canción/i)).toBeInTheDocument();
  });

  it("laRocolaAudio con action play asigna el src del <audio> y reproduce", () => {
    const laRocola: LaRocolaView = { phase: "sonando", roundNumber: 1, totalRounds: 10, marcador: [] };
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(() => Promise.resolve());

    const { container } = renderScreen(laRocola, {
      laRocolaAudio: { code: "ABCDE", action: "play", previewUrl: "https://preview/1", nonce: 1 },
    });

    const audio = container.querySelector("audio")!;
    expect(audio.src).toBe("https://preview/1");
    expect(playSpy).toHaveBeenCalled();
    playSpy.mockRestore();
  });

  it("en respondiendo, muestra quién está escribiendo y la cuenta regresiva de 30s", () => {
    const laRocola: LaRocolaView = {
      phase: "respondiendo",
      roundNumber: 1,
      buzzedPlayerId: "p1",
      buzzedPlayerName: "Ana",
      buzzedTeamId: "t1",
      remainingSeconds: 25,
      marcador: [],
    };

    renderScreen(laRocola);

    expect(screen.getByText("Ana", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/está escribiendo/i)).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("en robo, muestra el texto de robo de punto con los equipos elegibles", () => {
    const laRocola: LaRocolaView = {
      phase: "robo",
      roundNumber: 1,
      eligibleTeamIds: ["t2"],
      eligibleTeamNames: ["Azules"],
      remainingSeconds: 5,
      marcador: [],
    };

    renderScreen(laRocola);

    expect(screen.getByText(/robo de punto del equipo azules/i)).toBeInTheDocument();
  });

  it("en revelacion con acierto, suena playCorrectSound y muestra título/artista", () => {
    const laRocola: LaRocolaView = {
      phase: "revelacion",
      resultado: {
        songId: "s1",
        titulo: "Mil Horas",
        artista: "La Sonora Dinamita",
        portadaUrl: "https://art",
        teamId: "t1",
        playerId: "p1",
        playerName: "Ana",
        puntos: 1,
        respuesta: "Mil Oras",
      },
      marcador: [{ teamId: "t1", score: 3 }],
    };

    renderScreen(laRocola);

    expect(screen.getByText("Mil Horas")).toBeInTheDocument();
    expect(screen.getByText("La Sonora Dinamita")).toBeInTheDocument();
    expect(screen.getByText(/mil oras/i)).toBeInTheDocument();
    expect(playCorrectSound).toHaveBeenCalledTimes(1);
    expect(playIncorrectSound).not.toHaveBeenCalled();
  });

  it("en revelacion sin ganador, suena playIncorrectSound y dice Nadie acertó", () => {
    const laRocola: LaRocolaView = {
      phase: "revelacion",
      resultado: {
        songId: "s1",
        titulo: "Mil Horas",
        artista: "La Sonora Dinamita",
        portadaUrl: "https://art",
        teamId: null,
        playerId: null,
        playerName: null,
        puntos: 0,
        respuesta: "",
      },
      marcador: [],
    };

    renderScreen(laRocola);

    expect(screen.getByText(/nadie acertó/i)).toBeInTheDocument();
    expect(playIncorrectSound).toHaveBeenCalledTimes(1);
    expect(playCorrectSound).not.toHaveBeenCalled();
  });

  it("en match_result, muestra el marcador top-right, el ganador y llama playVictorySound una sola vez", () => {
    const laRocola: LaRocolaView = {
      phase: "match_result",
      scores: [
        { teamId: "t1", score: 6 },
        { teamId: "t2", score: 4 },
      ],
      canciones: [{ titulo: "Mil Horas", artista: "La Sonora Dinamita", teamId: "t1" }],
    };

    const { rerender } = renderScreen(laRocola);
    rerender(
      <ScreenLaRocola
        state={makeRoom()}
        actions={makeActions()}
        laRocola={laRocola}
        laRocolaAudio={null}
        rocolaArtists={null}
        actionError={null}
      />,
    );

    expect(screen.getByText(/el ganador de este juego es el equipo/i)).toBeInTheDocument();
    expect(screen.getAllByText("Rojos").length).toBeGreaterThan(0);
    expect(screen.getByText("Mil Horas — La Sonora Dinamita")).toBeInTheDocument();
    expect(playVictorySound).toHaveBeenCalledTimes(1);
  });
});
