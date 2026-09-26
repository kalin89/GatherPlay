import { describe, expect, it } from "vitest";
import {
  adivinaPalabraReducer,
  initialAdivinaPalabraMatchView,
  type AdivinaPalabraView,
} from "./adivina-palabra-match";

describe("adivinaPalabraReducer", () => {
  it("arranca en idle", () => {
    expect(initialAdivinaPalabraMatchView).toEqual({ phase: "idle" });
  });

  it("adivina_turn_waiting pasa a waiting_ready con el marcador", () => {
    const state = adivinaPalabraReducer(initialAdivinaPalabraMatchView, {
      type: "adivina_turn_waiting",
      payload: {
        code: "ABCDE",
        playerId: "p1",
        playerName: "Ana",
        teamId: "t1",
        marcador: [{ teamId: "t1", score: 0 }, { teamId: "t2", score: 0 }],
      },
    });

    expect(state).toEqual({
      phase: "waiting_ready",
      playerId: "p1",
      playerName: "Ana",
      teamId: "t1",
      marcador: [{ teamId: "t1", score: 0 }, { teamId: "t2", score: 0 }],
    });
  });

  it("adivina_pantalla_estado pasa a active_screen y arrastra playerId/playerName/teamId de waiting_ready", () => {
    const waiting: AdivinaPalabraView = {
      phase: "waiting_ready",
      playerId: "p1",
      playerName: "Ana",
      teamId: "t1",
      marcador: [{ teamId: "t1", score: 0 }],
    };

    const state = adivinaPalabraReducer(waiting, {
      type: "adivina_pantalla_estado",
      payload: {
        code: "ABCDE",
        palabra: "Mesa",
        remainingSeconds: 30,
        pasesRestantes: 3,
        ultimaAccion: null,
      },
    });

    expect(state).toEqual({
      phase: "active_screen",
      playerId: "p1",
      playerName: "Ana",
      teamId: "t1",
      marcador: [{ teamId: "t1", score: 0 }],
      palabra: "Mesa",
      remainingSeconds: 30,
      pasesRestantes: 3,
      lastAccion: null,
    });
  });

  it("adivina_pantalla_estado en un tick posterior mantiene playerId/playerName/teamId/marcador (no vienen en el payload)", () => {
    const active: AdivinaPalabraView = {
      phase: "active_screen",
      playerId: "p1",
      playerName: "Ana",
      teamId: "t1",
      marcador: [{ teamId: "t1", score: 0 }],
      palabra: "Mesa",
      remainingSeconds: 30,
      pasesRestantes: 3,
      lastAccion: null,
    };

    const state = adivinaPalabraReducer(active, {
      type: "adivina_pantalla_estado",
      payload: {
        code: "ABCDE",
        palabra: "Mesa",
        remainingSeconds: 25,
        pasesRestantes: 3,
        ultimaAccion: null,
      },
    });

    expect(state).toMatchObject({ phase: "active_screen", playerId: "p1", playerName: "Ana", remainingSeconds: 25 });
  });

  it("adivina_pantalla_estado con ultimaAccion arma un lastAccion nuevo (para sonar una vez por acción)", () => {
    const active: AdivinaPalabraView = {
      phase: "active_screen",
      playerId: "p1",
      playerName: "Ana",
      teamId: "t1",
      marcador: [{ teamId: "t1", score: 0 }],
      palabra: "Mesa",
      remainingSeconds: 30,
      pasesRestantes: 3,
      lastAccion: null,
    };

    const first = adivinaPalabraReducer(active, {
      type: "adivina_pantalla_estado",
      payload: { code: "ABCDE", palabra: "Elefante", remainingSeconds: 29, pasesRestantes: 3, ultimaAccion: "adivinada" },
    }) as Extract<AdivinaPalabraView, { phase: "active_screen" }>;

    const second = adivinaPalabraReducer(first, {
      type: "adivina_pantalla_estado",
      payload: { code: "ABCDE", palabra: "Médico", remainingSeconds: 28, pasesRestantes: 3, ultimaAccion: "adivinada" },
    }) as Extract<AdivinaPalabraView, { phase: "active_screen" }>;

    expect(first.lastAccion).toEqual({ tipo: "adivinada" });
    expect(second.lastAccion).toEqual({ tipo: "adivinada" });
    expect(second.lastAccion).not.toBe(first.lastAccion);
  });

  it("adivina_pantalla_estado con palabra null (pool agotado) se refleja tal cual, sin romper", () => {
    const waiting: AdivinaPalabraView = {
      phase: "waiting_ready",
      playerId: "p1",
      playerName: "Ana",
      teamId: "t1",
      marcador: [],
    };

    const state = adivinaPalabraReducer(waiting, {
      type: "adivina_pantalla_estado",
      payload: { code: "ABCDE", palabra: null, remainingSeconds: 5, pasesRestantes: 0, ultimaAccion: null },
    });

    expect(state).toMatchObject({ phase: "active_screen", palabra: null });
  });

  it("adivina_pantalla_estado tras turn_result con siguiente arrastra playerId/playerName/teamId/marcador del siguiente turno", () => {
    const turnResultConSiguiente: AdivinaPalabraView = {
      phase: "turn_result",
      resultado: { playerId: "p1", playerName: "Ana", teamId: "t1", adivinadas: ["Mesa"], pasadas: [], puntos: 1 },
      siguiente: {
        playerId: "p2",
        playerName: "Beto",
        teamId: "t2",
        marcador: [{ teamId: "t1", score: 1 }, { teamId: "t2", score: 0 }],
      },
    };

    const state = adivinaPalabraReducer(turnResultConSiguiente, {
      type: "adivina_pantalla_estado",
      payload: { code: "ABCDE", palabra: "Elefante", remainingSeconds: 30, pasesRestantes: 3, ultimaAccion: null },
    });

    expect(state).toEqual({
      phase: "active_screen",
      playerId: "p2",
      playerName: "Beto",
      teamId: "t2",
      marcador: [{ teamId: "t1", score: 1 }, { teamId: "t2", score: 0 }],
      palabra: "Elefante",
      remainingSeconds: 30,
      pasesRestantes: 3,
      lastAccion: null,
    });
  });

  it("adivina_jugador_estado pasa a active_player, sin ninguna palabra en el estado", () => {
    const state = adivinaPalabraReducer(initialAdivinaPalabraMatchView, {
      type: "adivina_jugador_estado",
      payload: { code: "ABCDE", remainingSeconds: 30, pasesRestantes: 3 },
    });

    expect(state).toEqual({ phase: "active_player", remainingSeconds: 30, pasesRestantes: 3 });
    expect(state).not.toHaveProperty("palabra");
  });

  it("adivina_turn_result pasa a turn_result", () => {
    const state = adivinaPalabraReducer(initialAdivinaPalabraMatchView, {
      type: "adivina_turn_result",
      payload: {
        code: "ABCDE",
        resultado: {
          playerId: "p1",
          playerName: "Ana",
          teamId: "t1",
          adivinadas: ["Mesa", "Elefante"],
          pasadas: ["Médico"],
          puntos: 2,
        },
      },
    });

    expect(state).toMatchObject({ phase: "turn_result", resultado: { puntos: 2 } });
  });

  it("adivina_turn_waiting que llega justo después de turn_result se adosa como 'siguiente', sin tapar el resumen", () => {
    const turnResult = adivinaPalabraReducer(initialAdivinaPalabraMatchView, {
      type: "adivina_turn_result",
      payload: {
        code: "ABCDE",
        resultado: { playerId: "p1", playerName: "Ana", teamId: "t1", adivinadas: ["Mesa"], pasadas: [], puntos: 1 },
      },
    });

    const state = adivinaPalabraReducer(turnResult, {
      type: "adivina_turn_waiting",
      payload: {
        code: "ABCDE",
        playerId: "p2",
        playerName: "Beto",
        teamId: "t2",
        marcador: [{ teamId: "t1", score: 1 }, { teamId: "t2", score: 0 }],
      },
    });

    expect(state).toMatchObject({
      phase: "turn_result",
      resultado: { puntos: 1 },
      siguiente: { playerId: "p2", playerName: "Beto", teamId: "t2" },
    });
  });

  it("adivina_match_result pasa a match_result", () => {
    const state = adivinaPalabraReducer(initialAdivinaPalabraMatchView, {
      type: "adivina_match_result",
      payload: {
        code: "ABCDE",
        scores: [{ teamId: "t1", score: 5 }, { teamId: "t2", score: 3 }],
        palabrasPorEquipo: [
          { teamId: "t1", palabras: ["Mesa"] },
          { teamId: "t2", palabras: ["Elefante"] },
        ],
      },
    });

    expect(state).toEqual({
      phase: "match_result",
      scores: [{ teamId: "t1", score: 5 }, { teamId: "t2", score: 3 }],
      palabrasPorEquipo: [
        { teamId: "t1", palabras: ["Mesa"] },
        { teamId: "t2", palabras: ["Elefante"] },
      ],
    });
  });

  it("reset vuelve a idle desde cualquier fase", () => {
    const matchResult: AdivinaPalabraView = {
      phase: "match_result",
      scores: [{ teamId: "t1", score: 5 }],
      palabrasPorEquipo: [{ teamId: "t1", palabras: ["Mesa"] }],
    };

    const state = adivinaPalabraReducer(matchResult, { type: "reset" });

    expect(state).toEqual({ phase: "idle" });
  });
});
