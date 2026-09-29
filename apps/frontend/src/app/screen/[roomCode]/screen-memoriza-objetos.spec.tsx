import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScreenMemorizaObjetos } from "./screen-memoriza-objetos";
import type { RoomState } from "@/lib/room-types";
import type { RoomActions } from "@/hooks/use-room-state";
import type { MemorizaObjetosView } from "@/lib/memoriza-objetos-match";

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
      { id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 0 },
      { id: "t2", name: "Azules", color: "#3b82f6", playerIds: ["p2"], score: 0 },
    ],
    round: null,
    currentGame: "memoriza-objetos",
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
    startMemorizaObjetosGame: vi.fn(),
    ...overrides,
  };
}

function renderScreen(memorizaObjetos: MemorizaObjetosView, overrides: { actions?: RoomActions } = {}) {
  return render(
    <ScreenMemorizaObjetos
      state={makeRoom()}
      actions={overrides.actions ?? makeActions()}
      memorizaObjetos={memorizaObjetos}
    />,
  );
}

describe("ScreenMemorizaObjetos", () => {
  it("en idle, arranca la partida automáticamente al montar", () => {
    const startMemorizaObjetosGame = vi.fn();
    renderScreen({ phase: "idle" }, { actions: makeActions({ startMemorizaObjetosGame }) });

    expect(startMemorizaObjetosGame).toHaveBeenCalledTimes(1);
  });

  it("en waiting_ready, muestra las instrucciones y el conteo de listos", () => {
    renderScreen({
      phase: "waiting_ready",
      readyPlayerIds: ["p1"],
      eligiblePlayerIds: ["p1", "p2"],
      items: [],
    });

    expect(screen.getByText("Memoriza los objetos")).toBeInTheDocument();
    expect(screen.getByText(/1\/2 listos/)).toBeInTheDocument();
  });

  it("en pon_atencion, muestra la cuenta regresiva y suena playTickSound por cada tick", () => {
    const { rerender } = renderScreen({ phase: "pon_atencion", remainingSeconds: 5 });
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(playTickSound).toHaveBeenCalledTimes(1);

    rerender(
      <ScreenMemorizaObjetos
        state={makeRoom()}
        actions={makeActions()}
        memorizaObjetos={{ phase: "pon_atencion", remainingSeconds: 4 }}
      />,
    );
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(playTickSound).toHaveBeenCalledTimes(2);
  });

  it("en memorizando, muestra la cuenta regresiva y la grilla de imágenes, sin ninguna palabra", () => {
    const { container } = renderScreen({
      phase: "memorizando",
      items: [{ id: "obj-1", imagenUrl: "https://example.com/1.svg" }],
      remainingSeconds: 30,
    });

    expect(screen.getByText("30")).toBeInTheDocument();
    // Íconos decorativos (alt="") no entran al árbol de accesibilidad como
    // role="img" — se cuentan directo en el DOM.
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.queryByText(/manzana/i)).toBeNull();
  });

  it("en adivinando, muestra los relojes de equipo y el tablero de pistas", () => {
    renderScreen({
      phase: "adivinando",
      items: [
        {
          id: "obj-1",
          imagenUrl: "https://example.com/1.svg",
          pista: "M _ _ _ _ _ _",
          estado: "oculta",
          equipoQueAcerto: null,
          palabra: null,
        },
      ],
      clocks: [
        { teamId: "t1", remainingSeconds: 90 },
        { teamId: "t2", remainingSeconds: 90 },
      ],
      equipoActivoId: "t1",
      jugadorActivo: { teamId: "t1", playerId: "p1", playerName: "Ana" },
      miPuedePasar: false,
      ultimoIntento: null,
      turnNumber: 1,
    });

    expect(screen.getAllByText("1:30")).toHaveLength(2);
    expect(screen.getByText("M _ _ _ _ _ _")).toBeInTheDocument();
    const nombre = screen.getByText("Ana");
    expect(nombre).toBeInTheDocument();
    expect(nombre).toHaveStyle({ background: "#ef4444" });
  });

  it("en adivinando con un acierto, suena playCorrectSound", () => {
    renderScreen({
      phase: "adivinando",
      items: [],
      clocks: [],
      equipoActivoId: "t1",
      jugadorActivo: null,
      miPuedePasar: false,
      ultimoIntento: { teamId: "t1", acierto: true, palabra: "manzana" },
      turnNumber: 1,
    });

    expect(playCorrectSound).toHaveBeenCalledTimes(1);
    expect(playIncorrectSound).not.toHaveBeenCalled();
  });

  it("en adivinando con un error, suena playIncorrectSound", () => {
    renderScreen({
      phase: "adivinando",
      items: [],
      clocks: [],
      equipoActivoId: "t1",
      jugadorActivo: null,
      miPuedePasar: false,
      ultimoIntento: { teamId: "t1", acierto: false, palabra: null },
      turnNumber: 1,
    });

    expect(playIncorrectSound).toHaveBeenCalledTimes(1);
    expect(playCorrectSound).not.toHaveBeenCalled();
  });

  it("en adivinando, cuando al reloj del equipo activo le quedan 10 segundos o menos, suena playTickSound por cada tick", () => {
    const { rerender } = renderScreen({
      phase: "adivinando",
      items: [],
      clocks: [
        { teamId: "t1", remainingSeconds: 11 },
        { teamId: "t2", remainingSeconds: 90 },
      ],
      equipoActivoId: "t1",
      jugadorActivo: null,
      miPuedePasar: false,
      ultimoIntento: null,
      turnNumber: 1,
    });
    expect(playTickSound).not.toHaveBeenCalled();

    rerender(
      <ScreenMemorizaObjetos
        state={makeRoom()}
        actions={makeActions()}
        memorizaObjetos={{
          phase: "adivinando",
          items: [],
          clocks: [
            { teamId: "t1", remainingSeconds: 10 },
            { teamId: "t2", remainingSeconds: 90 },
          ],
          equipoActivoId: "t1",
          jugadorActivo: null,
          miPuedePasar: false,
          ultimoIntento: null,
          turnNumber: 1,
        }}
      />,
    );
    expect(playTickSound).toHaveBeenCalledTimes(1);

    rerender(
      <ScreenMemorizaObjetos
        state={makeRoom()}
        actions={makeActions()}
        memorizaObjetos={{
          phase: "adivinando",
          items: [],
          clocks: [
            { teamId: "t1", remainingSeconds: 9 },
            { teamId: "t2", remainingSeconds: 90 },
          ],
          equipoActivoId: "t1",
          jugadorActivo: null,
          miPuedePasar: false,
          ultimoIntento: null,
          turnNumber: 1,
        }}
      />,
    );
    expect(playTickSound).toHaveBeenCalledTimes(2);
  });

  it("en adivinando, el reloj congelado del equipo que no está jugando (≤10s de un turno anterior) no suena", () => {
    renderScreen({
      phase: "adivinando",
      items: [],
      clocks: [
        { teamId: "t1", remainingSeconds: 45 },
        { teamId: "t2", remainingSeconds: 8 },
      ],
      equipoActivoId: "t1",
      jugadorActivo: null,
      miPuedePasar: false,
      ultimoIntento: null,
      turnNumber: 1,
    });

    expect(playTickSound).not.toHaveBeenCalled();
  });

  it("en match_result, muestra el ganador, el tablero final y suena playVictorySound una sola vez", () => {
    renderScreen({
      phase: "match_result",
      scores: [
        { teamId: "t1", score: 12 },
        { teamId: "t2", score: 8 },
      ],
      palabrasPorEquipo: [
        { teamId: "t1", palabras: ["manzana"] },
        { teamId: "t2", palabras: [] },
      ],
      items: [
        {
          id: "obj-1",
          imagenUrl: "https://example.com/1.svg",
          pista: "M _ _ _ _ _ _",
          estado: "revelada",
          equipoQueAcerto: "t1",
          palabra: "manzana",
        },
        {
          id: "obj-2",
          imagenUrl: "https://example.com/2.svg",
          pista: "_ A _ _",
          estado: "revelada",
          equipoQueAcerto: null,
          palabra: "gato",
        },
      ],
    });

    expect(screen.getAllByText(/rojos/i).length).toBeGreaterThan(0);
    expect(screen.getByText("manzana")).toBeInTheDocument();
    expect(screen.getByText("gato")).toBeInTheDocument();
    expect(playVictorySound).toHaveBeenCalledTimes(1);
    // No se cambia de vista a una pantalla de resultado aparte — el tablero
    // queda visible en el mismo lugar que durante "adivinando".
    expect(screen.queryByText("Resultado final")).toBeNull();
  });
});
