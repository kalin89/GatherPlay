import { describe, expect, it } from "vitest";
import {
  initialLaRocolaMatchView,
  laRocolaReducer,
  ROCOLA_ANSWER_SECONDS,
  type LaRocolaView,
} from "./la-rocola-match";

describe("laRocolaReducer", () => {
  it("arranca en idle", () => {
    expect(initialLaRocolaMatchView).toEqual({ phase: "idle" });
  });

  it("rocola_ready_state pasa a waiting_ready con los pendientes y elegibles", () => {
    const state = laRocolaReducer(initialLaRocolaMatchView, {
      type: "rocola_ready_state",
      payload: { code: "ABCDE", readyPlayerIds: ["p1"], eligiblePlayerIds: ["p1", "p2"] },
    });

    expect(state).toEqual({
      phase: "waiting_ready",
      readyPlayerIds: ["p1"],
      eligiblePlayerIds: ["p1", "p2"],
    });
  });

  it("rocola_round_started pasa a countdown con 5 segundos y el marcador", () => {
    const state = laRocolaReducer(initialLaRocolaMatchView, {
      type: "rocola_round_started",
      payload: {
        code: "ABCDE",
        roundNumber: 1,
        totalRounds: 10,
        marcador: [{ teamId: "t1", score: 0 }],
      },
    });

    expect(state).toEqual({
      phase: "countdown",
      remainingSeconds: 5,
      roundNumber: 1,
      totalRounds: 10,
      marcador: [{ teamId: "t1", score: 0 }],
    });
  });

  it("rocola_countdown_tick actualiza remainingSeconds solo en fase countdown", () => {
    const countdown: LaRocolaView = {
      phase: "countdown",
      remainingSeconds: 5,
      roundNumber: 1,
      totalRounds: 10,
      marcador: [],
    };

    const ticked = laRocolaReducer(countdown, {
      type: "rocola_countdown_tick",
      payload: { code: "ABCDE", remainingSeconds: 4 },
    });
    expect(ticked).toMatchObject({ phase: "countdown", remainingSeconds: 4 });

    const ignored = laRocolaReducer(initialLaRocolaMatchView, {
      type: "rocola_countdown_tick",
      payload: { code: "ABCDE", remainingSeconds: 4 },
    });
    expect(ignored).toEqual(initialLaRocolaMatchView);
  });

  it("rocola_buzzer_open pasa a sonando llevando el número de ronda y el marcador", () => {
    const countdown: LaRocolaView = {
      phase: "countdown",
      remainingSeconds: 1,
      roundNumber: 3,
      totalRounds: 10,
      marcador: [{ teamId: "t1", score: 2 }],
    };

    const state = laRocolaReducer(countdown, {
      type: "rocola_buzzer_open",
      payload: { code: "ABCDE", eligibleTeamIds: null },
    });

    expect(state).toEqual({
      phase: "sonando",
      roundNumber: 3,
      totalRounds: 10,
      marcador: [{ teamId: "t1", score: 2 }],
    });
  });

  it("rocola_buzzer_locked desde sonando pasa a respondiendo", () => {
    const sonando: LaRocolaView = {
      phase: "sonando",
      roundNumber: 1,
      totalRounds: 10,
      marcador: [],
    };

    const state = laRocolaReducer(sonando, {
      type: "rocola_buzzer_locked",
      payload: { code: "ABCDE", playerId: "p1", playerName: "Ana", teamId: "t1" },
    });

    expect(state).toEqual({
      phase: "respondiendo",
      roundNumber: 1,
      buzzedPlayerId: "p1",
      buzzedPlayerName: "Ana",
      buzzedTeamId: "t1",
      remainingSeconds: ROCOLA_ANSWER_SECONDS,
      marcador: [],
    });
  });

  it("rocola_answer_tick actualiza remainingSeconds en respondiendo y en robo_respondiendo", () => {
    const respondiendo: LaRocolaView = {
      phase: "respondiendo",
      roundNumber: 1,
      buzzedPlayerId: "p1",
      buzzedPlayerName: "Ana",
      buzzedTeamId: "t1",
      remainingSeconds: 30,
      marcador: [],
    };

    const ticked = laRocolaReducer(respondiendo, {
      type: "rocola_answer_tick",
      payload: { code: "ABCDE", remainingSeconds: 29 },
    });
    expect(ticked).toMatchObject({ phase: "respondiendo", remainingSeconds: 29 });

    const ignored = laRocolaReducer(initialLaRocolaMatchView, {
      type: "rocola_answer_tick",
      payload: { code: "ABCDE", remainingSeconds: 29 },
    });
    expect(ignored).toEqual(initialLaRocolaMatchView);
  });

  it("rocola_buzzer_locked desde robo pasa a robo_respondiendo", () => {
    const robo: LaRocolaView = {
      phase: "robo",
      roundNumber: 2,
      eligibleTeamIds: ["t2"],
      eligibleTeamNames: ["Azules"],
      remainingSeconds: 5,
      marcador: [],
    };

    const state = laRocolaReducer(robo, {
      type: "rocola_buzzer_locked",
      payload: { code: "ABCDE", playerId: "p2", playerName: "Beto", teamId: "t2" },
    });

    expect(state).toMatchObject({ phase: "robo_respondiendo", roundNumber: 2 });
  });

  it("rocola_robo_started pasa a robo con los equipos elegibles", () => {
    const respondiendo: LaRocolaView = {
      phase: "respondiendo",
      roundNumber: 3,
      buzzedPlayerId: "p1",
      buzzedPlayerName: "Ana",
      buzzedTeamId: "t1",
      remainingSeconds: 12,
      marcador: [{ teamId: "t1", score: 0 }],
    };

    const state = laRocolaReducer(respondiendo, {
      type: "rocola_robo_started",
      payload: {
        code: "ABCDE",
        eligibleTeamIds: ["t2"],
        eligibleTeamNames: ["Azules"],
        remainingSeconds: 5,
      },
    });

    expect(state).toEqual({
      phase: "robo",
      roundNumber: 3,
      eligibleTeamIds: ["t2"],
      eligibleTeamNames: ["Azules"],
      remainingSeconds: 5,
      marcador: [{ teamId: "t1", score: 0 }],
    });
  });

  it("rocola_round_result pasa a revelacion y suma el punto al equipo ganador", () => {
    const respondiendo: LaRocolaView = {
      phase: "respondiendo",
      roundNumber: 1,
      buzzedPlayerId: "p1",
      buzzedPlayerName: "Ana",
      buzzedTeamId: "t1",
      remainingSeconds: 20,
      marcador: [
        { teamId: "t1", score: 2 },
        { teamId: "t2", score: 1 },
      ],
    };

    const state = laRocolaReducer(respondiendo, {
      type: "rocola_round_result",
      payload: {
        code: "ABCDE",
        resultado: {
          songId: "s1",
          titulo: "Mil Horas",
          artista: "La Sonora Dinamita",
          portadaUrl: "https://art",
          teamId: "t1",
          playerId: "p1",
          playerName: "Ana",
          puntos: 1,
          respuesta: "Mil Horas",
        },
      },
    });

    expect(state).toMatchObject({
      phase: "revelacion",
      marcador: [
        { teamId: "t1", score: 3 },
        { teamId: "t2", score: 1 },
      ],
    });
  });

  it("rocola_round_result sin ganador (teamId null) no altera el marcador", () => {
    const sonando: LaRocolaView = {
      phase: "sonando",
      roundNumber: 1,
      totalRounds: 10,
      marcador: [{ teamId: "t1", score: 2 }],
    };

    const state = laRocolaReducer(sonando, {
      type: "rocola_round_result",
      payload: {
        code: "ABCDE",
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
      },
    });

    expect(state).toMatchObject({ marcador: [{ teamId: "t1", score: 2 }] });
  });

  it("rocola_match_result pasa a match_result con el puntaje y las canciones", () => {
    const state = laRocolaReducer(initialLaRocolaMatchView, {
      type: "rocola_match_result",
      payload: {
        code: "ABCDE",
        scores: [{ teamId: "t1", score: 6 }],
        canciones: [{ titulo: "Mil Horas", artista: "La Sonora Dinamita", teamId: "t1" }],
      },
    });

    expect(state).toEqual({
      phase: "match_result",
      scores: [{ teamId: "t1", score: 6 }],
      canciones: [{ titulo: "Mil Horas", artista: "La Sonora Dinamita", teamId: "t1" }],
    });
  });

  it("reset vuelve a idle", () => {
    const state = laRocolaReducer(
      { phase: "match_result", scores: [], canciones: [] },
      { type: "reset" },
    );
    expect(state).toEqual(initialLaRocolaMatchView);
  });
});
