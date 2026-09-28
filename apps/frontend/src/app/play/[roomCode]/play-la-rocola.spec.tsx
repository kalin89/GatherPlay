import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PlayLaRocola } from "./play-la-rocola";
import type { RoomState } from "@/lib/room-types";
import type { LaRocolaView } from "@/lib/la-rocola-match";

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
    currentGame: "la-rocola",
    ...overrides,
  };
}

function renderPlay(
  laRocola: LaRocolaView,
  playerId: string | null = "p1",
  overrides: {
    markRocolaReady?: () => void;
    rocolaBuzz?: () => void;
    submitRocolaAnswer?: (texto: string) => void;
    actionError?: { message: string } | null;
  } = {},
) {
  return render(
    <PlayLaRocola
      state={makeRoom()}
      playerId={playerId}
      laRocola={laRocola}
      markRocolaReady={overrides.markRocolaReady ?? vi.fn()}
      rocolaBuzz={overrides.rocolaBuzz ?? vi.fn()}
      submitRocolaAnswer={overrides.submitRocolaAnswer ?? vi.fn()}
      actionError={overrides.actionError ?? null}
    />,
  );
}

describe("PlayLaRocola", () => {
  it("en waiting_ready, muestra las instrucciones y el botón Listo", () => {
    renderPlay({ phase: "waiting_ready", readyPlayerIds: [], eligiblePlayerIds: ["p1", "p2"] });

    expect(screen.getByText("La Rocola")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /listo/i })).toBeInTheDocument();
  });

  it("presionar Listo llama markRocolaReady", () => {
    const markRocolaReady = vi.fn();
    renderPlay(
      { phase: "waiting_ready", readyPlayerIds: [], eligiblePlayerIds: ["p1", "p2"] },
      "p1",
      { markRocolaReady },
    );

    fireEvent.click(screen.getByRole("button", { name: /listo/i }));

    expect(markRocolaReady).toHaveBeenCalledTimes(1);
  });

  it("en sonando, muestra el botón ¡Me la sé! habilitado y nunca el nombre de ninguna canción", () => {
    renderPlay({ phase: "sonando", roundNumber: 1, totalRounds: 10, marcador: [] });

    const button = screen.getByRole("button", { name: /me la sé/i });
    expect(button).toBeEnabled();
    expect(document.body.textContent).not.toMatch(/mil horas/i);
  });

  it("presionar ¡Me la sé! llama rocolaBuzz y deshabilita el botón", () => {
    const rocolaBuzz = vi.fn();
    renderPlay({ phase: "sonando", roundNumber: 1, totalRounds: 10, marcador: [] }, "p1", {
      rocolaBuzz,
    });

    const button = screen.getByRole("button", { name: /me la sé/i });
    fireEvent.click(button);

    expect(rocolaBuzz).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });

  it("en respondiendo, si soy quien buzzeó, veo el campo de texto y el botón Enviar", () => {
    renderPlay(
      {
        phase: "respondiendo",
        roundNumber: 1,
        buzzedPlayerId: "p1",
        buzzedPlayerName: "Ana",
        buzzedTeamId: "t1",
        remainingSeconds: 30,
        marcador: [],
      },
      "p1",
    );

    expect(screen.getByPlaceholderText(/escribí el nombre/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enviar/i })).toBeInTheDocument();
    expect(screen.getByText("30s")).toBeInTheDocument();
  });

  it("en respondiendo, si buzzeó otro jugador, veo un mensaje de espera sin campo de texto", () => {
    renderPlay(
      {
        phase: "respondiendo",
        roundNumber: 1,
        buzzedPlayerId: "p2",
        buzzedPlayerName: "Beto",
        buzzedTeamId: "t2",
        remainingSeconds: 30,
        marcador: [],
      },
      "p1",
    );

    expect(screen.getByText("Beto", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/está escribiendo/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/escribí el nombre/i)).not.toBeInTheDocument();
  });

  it("escribir y enviar llama submitRocolaAnswer con el texto tipeado, y deshabilita el formulario", () => {
    const submitRocolaAnswer = vi.fn();
    renderPlay(
      {
        phase: "respondiendo",
        roundNumber: 1,
        buzzedPlayerId: "p1",
        buzzedPlayerName: "Ana",
        buzzedTeamId: "t1",
        remainingSeconds: 30,
        marcador: [],
      },
      "p1",
      { submitRocolaAnswer },
    );

    fireEvent.change(screen.getByPlaceholderText(/escribí el nombre/i), {
      target: { value: "Rayando el Sol" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));

    expect(submitRocolaAnswer).toHaveBeenCalledWith("Rayando el Sol");
    expect(screen.getByRole("button", { name: /enviar/i })).toBeDisabled();
  });

  it("al llegar a 0 segundos sin enviar, se envía automáticamente lo que haya tecleado", () => {
    const submitRocolaAnswer = vi.fn();
    const { rerender } = render(
      <PlayLaRocola
        state={makeRoom()}
        playerId="p1"
        laRocola={{
          phase: "respondiendo",
          roundNumber: 1,
          buzzedPlayerId: "p1",
          buzzedPlayerName: "Ana",
          buzzedTeamId: "t1",
          remainingSeconds: 1,
          marcador: [],
        }}
        markRocolaReady={vi.fn()}
        rocolaBuzz={vi.fn()}
        submitRocolaAnswer={submitRocolaAnswer}
        actionError={null}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/escribí el nombre/i), {
      target: { value: "Rayndo el sol" },
    });

    act(() => {
      rerender(
        <PlayLaRocola
          state={makeRoom()}
          playerId="p1"
          laRocola={{
            phase: "respondiendo",
            roundNumber: 1,
            buzzedPlayerId: "p1",
            buzzedPlayerName: "Ana",
            buzzedTeamId: "t1",
            remainingSeconds: 0,
            marcador: [],
          }}
          markRocolaReady={vi.fn()}
          rocolaBuzz={vi.fn()}
          submitRocolaAnswer={submitRocolaAnswer}
          actionError={null}
        />,
      );
    });

    expect(submitRocolaAnswer).toHaveBeenCalledWith("Rayndo el sol");
  });

  it("en robo, el botón está deshabilitado si mi equipo no es elegible", () => {
    renderPlay(
      {
        phase: "robo",
        roundNumber: 1,
        eligibleTeamIds: ["t2"],
        eligibleTeamNames: ["Azules"],
        remainingSeconds: 5,
        marcador: [],
      },
      "p1", // p1 es del equipo t1, no elegible
    );

    expect(screen.getByRole("button", { name: /me la sé/i })).toBeDisabled();
    expect(screen.getByText(/tu equipo no puede robar/i)).toBeInTheDocument();
  });

  it("en robo, el botón está habilitado si mi equipo sí es elegible", () => {
    renderPlay(
      {
        phase: "robo",
        roundNumber: 1,
        eligibleTeamIds: ["t1"],
        eligibleTeamNames: ["Rojos"],
        remainingSeconds: 5,
        marcador: [],
      },
      "p1",
    );

    expect(screen.getByRole("button", { name: /me la sé/i })).toBeEnabled();
  });

  it("en revelacion con mi equipo ganador, muestra el resumen de puntos propios", () => {
    renderPlay(
      {
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
          respuesta: "Rayando el Sol",
        },
        marcador: [],
      },
      "p1",
    );

    expect(screen.getByText(/acertaste/i)).toBeInTheDocument();
  });

  it("en revelacion con otro equipo ganador, muestra quién acertó sin sonido propio", () => {
    renderPlay(
      {
        phase: "revelacion",
        resultado: {
          songId: "s1",
          titulo: "Mil Horas",
          artista: "La Sonora Dinamita",
          portadaUrl: "https://art",
          teamId: "t2",
          playerId: "p2",
          playerName: "Beto",
          puntos: 1,
          respuesta: "Mil Horas",
        },
        marcador: [],
      },
      "p1",
    );

    expect(screen.getByText("Beto", { exact: false })).toBeInTheDocument();
  });

  it("en match_result, muestra el resultado final con mi equipo destacado", () => {
    renderPlay(
      {
        phase: "match_result",
        scores: [
          { teamId: "t1", score: 6 },
          { teamId: "t2", score: 4 },
        ],
        canciones: [],
      },
      "p1",
    );

    expect(screen.getByText("Resultado final")).toBeInTheDocument();
    expect(screen.getByText("Rojos")).toBeInTheDocument();
    expect(screen.getByText("Azules")).toBeInTheDocument();
  });

  it("muestra actionError si el servidor rechaza una acción", () => {
    renderPlay({ phase: "sonando", roundNumber: 1, totalRounds: 10, marcador: [] }, "p1", {
      actionError: { message: "Ya presionaste el botón" },
    });

    expect(screen.getByText("Ya presionaste el botón")).toBeInTheDocument();
  });
});
