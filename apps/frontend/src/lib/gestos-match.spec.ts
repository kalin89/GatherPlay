import { describe, expect, it } from "vitest";
import { gestosReducer, initialGestosMatchView, type GestosMatchView } from "./gestos-match";

describe("gestosReducer — versión pantalla (myPlayerId null)", () => {
  it("arranca en idle", () => {
    expect(initialGestosMatchView).toEqual({ phase: "idle" });
  });

  it("gestos_turn_waiting siempre pasa a waiting_turn (nunca ready_to_start)", () => {
    const state = gestosReducer(initialGestosMatchView, {
      type: "gestos_turn_waiting",
      payload: { code: "ABCDE", playerId: "p1", playerName: "Ana", teamId: "t1" },
    });

    expect(state).toEqual({ phase: "waiting_turn", playerId: "p1", playerName: "Ana", teamId: "t1" });
  });

  it("gestos_turn_started pasa a acting con remainingSeconds = durationSeconds", () => {
    const state = gestosReducer(initialGestosMatchView, {
      type: "gestos_turn_started",
      payload: {
        code: "ABCDE",
        playerId: "p1",
        playerName: "Ana",
        palabra: "Elefante",
        durationSeconds: 60,
        palabrasRestantes: 5,
      },
    });

    expect(state).toMatchObject({
      phase: "acting",
      palabra: "Elefante",
      remainingSeconds: 60,
      totalPalabras: 5,
      palabrasRestantes: 5,
      lastWordEvent: null,
    });
  });

  it("gestos_turn_tick actualiza remainingSeconds solo en acting, sin tocar lastWordEvent", () => {
    const acting: GestosMatchView = {
      phase: "acting",
      palabra: "Elefante",
      durationSeconds: 60,
      remainingSeconds: 60,
      totalPalabras: 5,
      palabrasRestantes: 5,
      lastWordEvent: null,
    };

    const updated = gestosReducer(acting, {
      type: "gestos_turn_tick",
      payload: { code: "ABCDE", remainingSeconds: 55 },
    });
    expect(updated).toMatchObject({ phase: "acting", remainingSeconds: 55, lastWordEvent: null });

    const noop = gestosReducer(
      { phase: "waiting_turn", playerId: "p1", playerName: "Ana", teamId: "t1" },
      { type: "gestos_turn_tick", payload: { code: "ABCDE", remainingSeconds: 5 } },
    );
    expect(noop).toEqual({ phase: "waiting_turn", playerId: "p1", playerName: "Ana", teamId: "t1" });
  });

  it("gestos_word_update actualiza la palabra, el progreso y arma un lastWordEvent nuevo, sin tocar totalPalabras", () => {
    const acting: GestosMatchView = {
      phase: "acting",
      palabra: "Elefante",
      durationSeconds: 60,
      remainingSeconds: 50,
      totalPalabras: 5,
      palabrasRestantes: 5,
      lastWordEvent: null,
    };

    const updated = gestosReducer(acting, {
      type: "gestos_word_update",
      payload: { code: "ABCDE", palabra: "Nadar", palabrasRestantes: 4, motivo: "adivinada" },
    });

    expect(updated).toMatchObject({
      phase: "acting",
      palabra: "Nadar",
      totalPalabras: 5,
      palabrasRestantes: 4,
      remainingSeconds: 50,
      lastWordEvent: { motivo: "adivinada" },
    });
  });

  it("dos gestos_word_update seguidos con el mismo motivo producen lastWordEvent con distinta identidad", () => {
    const acting: GestosMatchView = {
      phase: "acting",
      palabra: "Elefante",
      durationSeconds: 60,
      remainingSeconds: 50,
      totalPalabras: 5,
      palabrasRestantes: 5,
      lastWordEvent: null,
    };

    const first = gestosReducer(acting, {
      type: "gestos_word_update",
      payload: { code: "ABCDE", palabra: "Nadar", palabrasRestantes: 4, motivo: "adivinada" },
    }) as Extract<GestosMatchView, { phase: "acting" }>;

    const second = gestosReducer(first, {
      type: "gestos_word_update",
      payload: { code: "ABCDE", palabra: "Bombero", palabrasRestantes: 3, motivo: "adivinada" },
    }) as Extract<GestosMatchView, { phase: "acting" }>;

    expect(first.lastWordEvent).toEqual({ motivo: "adivinada" });
    expect(second.lastWordEvent).toEqual({ motivo: "adivinada" });
    expect(second.lastWordEvent).not.toBe(first.lastWordEvent);
  });

  it("gestos_turn_result pasa a turn_result", () => {
    const state = gestosReducer(initialGestosMatchView, {
      type: "gestos_turn_result",
      payload: {
        code: "ABCDE",
        resultado: {
          playerId: "p1",
          playerName: "Ana",
          teamId: "t1",
          palabrasAdivinadas: ["Elefante", "Nadar"],
          puntos: 2,
          motivo: "completado",
        },
      },
    });

    expect(state).toMatchObject({
      phase: "turn_result",
      resultado: { puntos: 2, motivo: "completado" },
    });
  });

  it("gestos_match_result pasa a match_result", () => {
    const state = gestosReducer(initialGestosMatchView, {
      type: "gestos_match_result",
      payload: {
        code: "ABCDE",
        scores: [{ teamId: "t1", score: 15 }, { teamId: "t2", score: 12 }],
        palabrasPorEquipo: { t1: ["Elefante"], t2: ["Nadar"] },
      },
    });

    expect(state).toEqual({
      phase: "match_result",
      scores: [{ teamId: "t1", score: 15 }, { teamId: "t2", score: 12 }],
      palabrasPorEquipo: { t1: ["Elefante"], t2: ["Nadar"] },
    });
  });

  it("reset vuelve a idle desde cualquier fase", () => {
    const matchResult: GestosMatchView = {
      phase: "match_result",
      scores: [{ teamId: "t1", score: 15 }],
      palabrasPorEquipo: { t1: ["Elefante"] },
    };

    const state = gestosReducer(matchResult, { type: "reset" });

    expect(state).toEqual({ phase: "idle" });
  });
});

describe("gestosReducer — versión jugador (myPlayerId propio)", () => {
  it("gestos_turn_waiting con mi playerId pasa a ready_to_start", () => {
    const state = gestosReducer(
      initialGestosMatchView,
      { type: "gestos_turn_waiting", payload: { code: "ABCDE", playerId: "p1", playerName: "Ana", teamId: "t1" } },
      "p1",
    );

    expect(state).toEqual({ phase: "ready_to_start" });
  });

  it("gestos_turn_waiting con el playerId de otro jugador pasa a waiting_turn", () => {
    const state = gestosReducer(
      initialGestosMatchView,
      { type: "gestos_turn_waiting", payload: { code: "ABCDE", playerId: "p2", playerName: "Beto", teamId: "t2" } },
      "p1",
    );

    expect(state).toEqual({ phase: "waiting_turn", playerId: "p2", playerName: "Beto", teamId: "t2" });
  });

  it("gestos_actor_ready pasa a my_turn_active, sin ninguna palabra", () => {
    const state = gestosReducer(
      { phase: "ready_to_start" },
      { type: "gestos_actor_ready", payload: { code: "ABCDE" } },
      "p1",
    );

    expect(state).toEqual({ phase: "my_turn_active" });
  });

  it("encadena un turno completo del propio jugador: waiting → ready_to_start → my_turn_active → turn_result", () => {
    let state: GestosMatchView = initialGestosMatchView;
    state = gestosReducer(
      state,
      { type: "gestos_turn_waiting", payload: { code: "ABCDE", playerId: "p2", playerName: "Beto", teamId: "t2" } },
      "p1",
    );
    expect(state).toMatchObject({ phase: "waiting_turn", playerId: "p2" });

    state = gestosReducer(
      state,
      { type: "gestos_turn_waiting", payload: { code: "ABCDE", playerId: "p1", playerName: "Ana", teamId: "t1" } },
      "p1",
    );
    expect(state).toEqual({ phase: "ready_to_start" });

    state = gestosReducer(state, { type: "gestos_actor_ready", payload: { code: "ABCDE" } }, "p1");
    expect(state).toEqual({ phase: "my_turn_active" });

    state = gestosReducer(
      state,
      {
        type: "gestos_turn_result",
        payload: {
          code: "ABCDE",
          resultado: {
            playerId: "p1",
            playerName: "Ana",
            teamId: "t1",
            palabrasAdivinadas: ["Elefante"],
            puntos: 1,
            motivo: "tiempo",
          },
        },
      },
      "p1",
    );
    expect(state).toMatchObject({ phase: "turn_result", resultado: { puntos: 1, motivo: "tiempo" } });
  });
});
