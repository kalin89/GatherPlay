import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlayMemorizaObjetos } from "./play-memoriza-objetos";
import type { RoomState } from "@/lib/room-types";
import type { MemorizaObjetosView } from "@/lib/memoriza-objetos-match";

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: "ABCDE",
    status: "jugando",
    players: [
      { id: "p1", name: "Ana", socketId: "s1" },
      { id: "p2", name: "Beto", socketId: "s2" },
    ],
    teams: [
      { id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 0 },
      { id: "t2", name: "Azules", color: "#3b82f6", playerIds: ["p2"], score: 0 },
    ],
    round: null,
    currentGame: "memoriza-objetos",
    ...overrides,
  };
}

function renderPlay(
  memorizaObjetos: MemorizaObjetosView,
  playerId: string | null = "p1",
  overrides: {
    markMemorizaReady?: () => void;
    submitMemorizaGuess?: (texto: string) => void;
    passMemorizaTurn?: () => void;
    actionError?: { message: string } | null;
  } = {},
) {
  return render(
    <PlayMemorizaObjetos
      state={makeRoom()}
      playerId={playerId}
      memorizaObjetos={memorizaObjetos}
      markMemorizaReady={overrides.markMemorizaReady ?? vi.fn()}
      submitMemorizaGuess={overrides.submitMemorizaGuess ?? vi.fn()}
      passMemorizaTurn={overrides.passMemorizaTurn ?? vi.fn()}
      actionError={overrides.actionError ?? null}
    />,
  );
}

describe("PlayMemorizaObjetos", () => {
  it("en idle, muestra las instrucciones sin botón Listo", () => {
    renderPlay({ phase: "idle" });

    expect(screen.getByText("Memoriza los objetos")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /listo/i })).toBeNull();
  });

  it("en waiting_ready, muestra el botón Listo y llama markMemorizaReady al presionarlo", () => {
    const markMemorizaReady = vi.fn();
    renderPlay(
      { phase: "waiting_ready", readyPlayerIds: [], eligiblePlayerIds: ["p1", "p2"], items: [] },
      "p1",
      { markMemorizaReady },
    );

    fireEvent.click(screen.getByRole("button", { name: /listo/i }));

    expect(markMemorizaReady).toHaveBeenCalledTimes(1);
  });

  it("en pon_atencion y en memorizando, solo muestra el mensaje de mirar la pantalla", () => {
    const { rerender } = renderPlay({ phase: "pon_atencion", remainingSeconds: 5 });
    expect(screen.getByText(/mira la pantalla/i)).toBeInTheDocument();

    rerender(
      <PlayMemorizaObjetos
        state={makeRoom()}
        playerId="p1"
        memorizaObjetos={{ phase: "memorizando", items: [], remainingSeconds: 30 }}
        markMemorizaReady={vi.fn()}
        submitMemorizaGuess={vi.fn()}
        passMemorizaTurn={vi.fn()}
        actionError={null}
      />,
    );
    expect(screen.getByText(/mira la pantalla/i)).toBeInTheDocument();
  });

  it("en adivinando, si es mi turno, veo el campo de texto con Enviar deshabilitado hasta escribir algo", () => {
    renderPlay(
      {
        phase: "adivinando",
        items: [],
        clocks: [],
        equipoActivoId: "t1",
        jugadorActivo: { teamId: "t1", playerId: "p1", playerName: "Ana" },
        miPuedePasar: false,
        ultimoIntento: null,
        turnNumber: 1,
      },
      "p1",
    );

    const submit = screen.getByRole("button", { name: /enviar/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/escribí la palabra/i), {
      target: { value: "manzana" },
    });
    expect(submit).toBeEnabled();
  });

  it("enviar una palabra llama submitMemorizaGuess y deshabilita el formulario", () => {
    const submitMemorizaGuess = vi.fn();
    renderPlay(
      {
        phase: "adivinando",
        items: [],
        clocks: [],
        equipoActivoId: "t1",
        jugadorActivo: { teamId: "t1", playerId: "p1", playerName: "Ana" },
        miPuedePasar: false,
        ultimoIntento: null,
        turnNumber: 1,
      },
      "p1",
      { submitMemorizaGuess },
    );

    fireEvent.change(screen.getByPlaceholderText(/escribí la palabra/i), {
      target: { value: "manzana" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));

    expect(submitMemorizaGuess).toHaveBeenCalledWith("manzana");
    expect(screen.getByRole("button", { name: /enviar/i })).toBeDisabled();
  });

  it("cuando el otro equipo se queda sin tiempo y el mismo jugador repite turno (turnNumber nuevo), el formulario se vuelve a habilitar", () => {
    // Reproduce el bug de 1 vs 1: mismo playerId y mismo teamId en dos
    // turnos seguidos porque el equipo contrario se quedó sin tiempo — la
    // única señal de que es un turno nuevo es que cambia `turnNumber`.
    const { rerender } = renderPlay(
      {
        phase: "adivinando",
        items: [],
        clocks: [],
        equipoActivoId: "t1",
        jugadorActivo: { teamId: "t1", playerId: "p1", playerName: "Ana" },
        miPuedePasar: false,
        ultimoIntento: null,
        turnNumber: 1,
      },
      "p1",
    );

    fireEvent.change(screen.getByPlaceholderText(/escribí la palabra/i), {
      target: { value: "manzana" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    expect(screen.getByRole("button", { name: /enviar/i })).toBeDisabled();

    rerender(
      <PlayMemorizaObjetos
        state={makeRoom()}
        playerId="p1"
        memorizaObjetos={{
          phase: "adivinando",
          items: [],
          clocks: [],
          equipoActivoId: "t1",
          jugadorActivo: { teamId: "t1", playerId: "p1", playerName: "Ana" },
          miPuedePasar: false,
          ultimoIntento: null,
          turnNumber: 2,
        }}
        markMemorizaReady={vi.fn()}
        submitMemorizaGuess={vi.fn()}
        passMemorizaTurn={vi.fn()}
        actionError={null}
      />,
    );

    expect(screen.getByPlaceholderText(/escribí la palabra/i)).toBeEnabled();
    expect(screen.getByRole("button", { name: /enviar/i })).toBeDisabled();
  });

  it("el botón Pasar está deshabilitado hasta que miPuedePasar sea true", () => {
    const { rerender } = renderPlay(
      {
        phase: "adivinando",
        items: [],
        clocks: [],
        equipoActivoId: "t1",
        jugadorActivo: { teamId: "t1", playerId: "p1", playerName: "Ana" },
        miPuedePasar: false,
        ultimoIntento: null,
        turnNumber: 1,
      },
      "p1",
    );
    expect(screen.getByRole("button", { name: /pasar/i })).toBeDisabled();

    rerender(
      <PlayMemorizaObjetos
        state={makeRoom()}
        playerId="p1"
        memorizaObjetos={{
          phase: "adivinando",
          items: [],
          clocks: [],
          equipoActivoId: "t1",
          jugadorActivo: { teamId: "t1", playerId: "p1", playerName: "Ana" },
          miPuedePasar: true,
          ultimoIntento: null,
          turnNumber: 1,
        }}
        markMemorizaReady={vi.fn()}
        submitMemorizaGuess={vi.fn()}
        passMemorizaTurn={vi.fn()}
        actionError={null}
      />,
    );
    expect(screen.getByRole("button", { name: /pasar/i })).toBeEnabled();
  });

  it("presionar Pasar llama passMemorizaTurn", () => {
    const passMemorizaTurn = vi.fn();
    renderPlay(
      {
        phase: "adivinando",
        items: [],
        clocks: [],
        equipoActivoId: "t1",
        jugadorActivo: { teamId: "t1", playerId: "p1", playerName: "Ana" },
        miPuedePasar: true,
        ultimoIntento: null,
        turnNumber: 1,
      },
      "p1",
      { passMemorizaTurn },
    );

    fireEvent.click(screen.getByRole("button", { name: /pasar/i }));

    expect(passMemorizaTurn).toHaveBeenCalledTimes(1);
  });

  it("en adivinando, si no es mi turno, muestra a quién le toca sin campo de texto", () => {
    renderPlay(
      {
        phase: "adivinando",
        items: [],
        clocks: [],
        equipoActivoId: "t2",
        jugadorActivo: { teamId: "t2", playerId: "p2", playerName: "Beto" },
        miPuedePasar: false,
        ultimoIntento: null,
        turnNumber: 1,
      },
      "p1",
    );

    expect(screen.getByText(/beto/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/escribí la palabra/i)).toBeNull();
  });

  it("en match_result, resalta mi propio equipo", () => {
    renderPlay(
      {
        phase: "match_result",
        scores: [
          { teamId: "t1", score: 12 },
          { teamId: "t2", score: 8 },
        ],
        palabrasPorEquipo: [],
        items: [],
      },
      "p1",
    );

    expect(screen.getByText("Rojos")).toBeInTheDocument();
    expect(screen.getByText("Azules")).toBeInTheDocument();
  });
});
