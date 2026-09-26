import { describe, expect, it } from "vitest";
import { initialTriviaMatchView, triviaReducer, type TriviaMatchView } from "./trivia-match";

describe("triviaReducer", () => {
  it("arranca en idle", () => {
    expect(initialTriviaMatchView).toEqual({ phase: "idle" });
  });

  it("trivia_turn_waiting pasa a waiting_turn", () => {
    const state = triviaReducer(initialTriviaMatchView, {
      type: "trivia_turn_waiting",
      payload: { code: "ABCDE", playerId: "p1", playerName: "Ana", teamId: "t1" },
    });

    expect(state).toEqual({ phase: "waiting_turn", playerId: "p1", playerName: "Ana", teamId: "t1" });
  });

  it("trivia_turn_started pasa a my_turn con remainingSeconds = durationSeconds", () => {
    const state = triviaReducer(initialTriviaMatchView, {
      type: "trivia_turn_started",
      payload: {
        code: "ABCDE",
        playerId: "p1",
        playerName: "Ana",
        pregunta: "¿2+2?",
        opciones: ["3", "4", "5", "6"],
        durationSeconds: 15,
      },
    });

    expect(state).toMatchObject({
      phase: "my_turn",
      pregunta: "¿2+2?",
      remainingSeconds: 15,
    });
  });

  it("trivia_turn_update actualiza remainingSeconds solo en my_turn", () => {
    const myTurn: TriviaMatchView = {
      phase: "my_turn",
      playerId: "p1",
      playerName: "Ana",
      pregunta: "¿2+2?",
      opciones: ["3", "4", "5", "6"],
      durationSeconds: 15,
      remainingSeconds: 15,
    };

    const updated = triviaReducer(myTurn, {
      type: "trivia_turn_update",
      payload: { code: "ABCDE", remainingSeconds: 10 },
    });
    expect(updated).toMatchObject({ phase: "my_turn", remainingSeconds: 10 });

    const noop = triviaReducer(
      { phase: "waiting_turn", playerId: "p1", playerName: "Ana", teamId: "t1" },
      { type: "trivia_turn_update", payload: { code: "ABCDE", remainingSeconds: 5 } },
    );
    expect(noop).toEqual({ phase: "waiting_turn", playerId: "p1", playerName: "Ana", teamId: "t1" });
  });

  it("trivia_turn_result pasa a turn_result", () => {
    const state = triviaReducer(initialTriviaMatchView, {
      type: "trivia_turn_result",
      payload: {
        code: "ABCDE",
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
      },
    });

    expect(state).toMatchObject({
      phase: "turn_result",
      indiceCorrecto: 1,
      resultado: { correcta: true, puntos: 100 },
    });
  });

  it("trivia_match_result pasa a match_result", () => {
    const state = triviaReducer(initialTriviaMatchView, {
      type: "trivia_match_result",
      payload: { code: "ABCDE", scores: [{ teamId: "t1", score: 300 }, { teamId: "t2", score: 200 }] },
    });

    expect(state).toEqual({
      phase: "match_result",
      scores: [{ teamId: "t1", score: 300 }, { teamId: "t2", score: 200 }],
    });
  });

  it("encadena una partida corta completa: waiting → my_turn → turn_result → waiting → match_result", () => {
    let state = initialTriviaMatchView;
    state = triviaReducer(state, {
      type: "trivia_turn_waiting",
      payload: { code: "ABCDE", playerId: "p1", playerName: "Ana", teamId: "t1" },
    });
    state = triviaReducer(state, {
      type: "trivia_turn_started",
      payload: {
        code: "ABCDE",
        playerId: "p1",
        playerName: "Ana",
        pregunta: "¿2+2?",
        opciones: ["3", "4", "5", "6"],
        durationSeconds: 15,
      },
    });
    state = triviaReducer(state, {
      type: "trivia_turn_result",
      payload: {
        code: "ABCDE",
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
      },
    });
    expect(state.phase).toBe("turn_result");

    state = triviaReducer(state, {
      type: "trivia_turn_waiting",
      payload: { code: "ABCDE", playerId: "p2", playerName: "Beto", teamId: "t2" },
    });
    expect(state).toEqual({ phase: "waiting_turn", playerId: "p2", playerName: "Beto", teamId: "t2" });

    state = triviaReducer(state, {
      type: "trivia_match_result",
      payload: { code: "ABCDE", scores: [{ teamId: "t1", score: 100 }, { teamId: "t2", score: 0 }] },
    });
    expect(state.phase).toBe("match_result");
  });

  it("reset vuelve a idle desde cualquier fase", () => {
    const matchResult: TriviaMatchView = {
      phase: "match_result",
      scores: [{ teamId: "t1", score: 100 }],
    };

    const state = triviaReducer(matchResult, { type: "reset" });

    expect(state).toEqual({ phase: "idle" });
  });
});
