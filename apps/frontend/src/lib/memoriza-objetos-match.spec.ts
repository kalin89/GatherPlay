import { describe, expect, it } from "vitest";
import {
  initialMemorizaObjetosMatchView,
  memorizaObjetosReducer,
  type MemorizaObjetosView,
} from "./memoriza-objetos-match";
import type { MemorizaBoardItemPublic } from "./memoriza-objetos-types";

const ITEM: MemorizaBoardItemPublic = {
  id: "obj-1",
  imagenUrl: "https://example.com/1.svg",
  pista: "M _ _ _ _ _ _",
  estado: "oculta",
  equipoQueAcerto: null,
  palabra: null,
};

const ADIVINANDO: Extract<MemorizaObjetosView, { phase: "adivinando" }> = {
  phase: "adivinando",
  items: [ITEM],
  clocks: [
    { teamId: "t1", remainingSeconds: 90 },
    { teamId: "t2", remainingSeconds: 90 },
  ],
  equipoActivoId: "t1",
  jugadorActivo: { teamId: "t1", playerId: "p1", playerName: "Ana" },
  miPuedePasar: false,
  ultimoIntento: null,
  turnNumber: 1,
};

describe("memorizaObjetosReducer", () => {
  it("arranca en idle", () => {
    expect(initialMemorizaObjetosMatchView).toEqual({ phase: "idle" });
  });

  it("memoriza_waiting_ready pasa a waiting_ready con los pendientes, elegibles y las imágenes", () => {
    const state = memorizaObjetosReducer(initialMemorizaObjetosMatchView, {
      type: "memoriza_waiting_ready",
      payload: {
        code: "ABCDE",
        readyPlayerIds: ["p1"],
        eligiblePlayerIds: ["p1", "p2"],
        items: [{ id: "obj-1", imagenUrl: "https://example.com/1.svg" }],
      },
    });

    expect(state).toEqual({
      phase: "waiting_ready",
      readyPlayerIds: ["p1"],
      eligiblePlayerIds: ["p1", "p2"],
      items: [{ id: "obj-1", imagenUrl: "https://example.com/1.svg" }],
    });
  });

  it("memoriza_pon_atencion pasa a pon_atencion con el remainingSeconds recibido", () => {
    const state = memorizaObjetosReducer(initialMemorizaObjetosMatchView, {
      type: "memoriza_pon_atencion",
      payload: { code: "ABCDE", remainingSeconds: 5 },
    });

    expect(state).toEqual({ phase: "pon_atencion", remainingSeconds: 5 });
  });

  it("memoriza_memorizando pasa a memorizando con las imágenes (sin palabra) y el tiempo", () => {
    const state = memorizaObjetosReducer(initialMemorizaObjetosMatchView, {
      type: "memoriza_memorizando",
      payload: {
        code: "ABCDE",
        items: [{ id: "obj-1", imagenUrl: "https://example.com/1.svg" }],
        remainingSeconds: 30,
      },
    });

    expect(state).toEqual({
      phase: "memorizando",
      items: [{ id: "obj-1", imagenUrl: "https://example.com/1.svg" }],
      remainingSeconds: 30,
    });
  });

  it("memoriza_tablero pasa a adivinando, sin miPuedePasar/ultimoIntento previos si viene de otra fase", () => {
    const state = memorizaObjetosReducer(
      { phase: "memorizando", items: [], remainingSeconds: 0 },
      {
        type: "memoriza_tablero",
        payload: {
          code: "ABCDE",
          items: [ITEM],
          clocks: [{ teamId: "t1", remainingSeconds: 90 }],
          equipoActivoId: "t1",
          jugadorActivo: { teamId: "t1", playerId: "p1", playerName: "Ana" },
          turnNumber: 1,
        },
      },
    );

    expect(state).toEqual({
      phase: "adivinando",
      items: [ITEM],
      clocks: [{ teamId: "t1", remainingSeconds: 90 }],
      equipoActivoId: "t1",
      jugadorActivo: { teamId: "t1", playerId: "p1", playerName: "Ana" },
      miPuedePasar: false,
      ultimoIntento: null,
      turnNumber: 1,
    });
  });

  it("memoriza_tablero, ya en adivinando, conserva miPuedePasar/ultimoIntento al actualizar el resto y guarda el turnNumber nuevo", () => {
    const conPasar: MemorizaObjetosView = { ...ADIVINANDO, miPuedePasar: true };
    const state = memorizaObjetosReducer(conPasar, {
      type: "memoriza_tablero",
      payload: {
        code: "ABCDE",
        items: [{ ...ITEM, estado: "revelada", palabra: "manzana", equipoQueAcerto: "t1" }],
        clocks: [{ teamId: "t1", remainingSeconds: 80 }],
        equipoActivoId: "t2",
        jugadorActivo: { teamId: "t2", playerId: "p2", playerName: "Beto" },
        turnNumber: 2,
      },
    });

    expect(state).toMatchObject({
      phase: "adivinando",
      equipoActivoId: "t2",
      miPuedePasar: true,
      turnNumber: 2,
    });
  });

  it("memoriza_turno_jugador solo actualiza miPuedePasar dentro de la fase adivinando", () => {
    const state = memorizaObjetosReducer(ADIVINANDO, {
      type: "memoriza_turno_jugador",
      payload: { code: "ABCDE", remainingSeconds: 80, puedePasar: true },
    });

    expect(state).toEqual({ ...ADIVINANDO, miPuedePasar: true });
  });

  it("memoriza_turno_jugador no hace nada fuera de la fase adivinando", () => {
    const state = memorizaObjetosReducer(initialMemorizaObjetosMatchView, {
      type: "memoriza_turno_jugador",
      payload: { code: "ABCDE", remainingSeconds: 80, puedePasar: true },
    });

    expect(state).toEqual(initialMemorizaObjetosMatchView);
  });

  it("memoriza_intento_resultado guarda el último intento dentro de la fase adivinando", () => {
    const state = memorizaObjetosReducer(ADIVINANDO, {
      type: "memoriza_intento_resultado",
      payload: { code: "ABCDE", teamId: "t1", acierto: true, palabra: "manzana" },
    });

    expect(state).toEqual({
      ...ADIVINANDO,
      ultimoIntento: { teamId: "t1", acierto: true, palabra: "manzana" },
    });
  });

  it("memoriza_match_result pasa a match_result con el puntaje, las palabras por equipo y el tablero final", () => {
    const state = memorizaObjetosReducer(ADIVINANDO, {
      type: "memoriza_match_result",
      payload: {
        code: "ABCDE",
        scores: [{ teamId: "t1", score: 5 }],
        palabrasPorEquipo: [{ teamId: "t1", palabras: ["manzana"] }],
        items: [{ ...ITEM, estado: "revelada", palabra: "manzana", equipoQueAcerto: "t1" }],
      },
    });

    expect(state).toEqual({
      phase: "match_result",
      scores: [{ teamId: "t1", score: 5 }],
      palabrasPorEquipo: [{ teamId: "t1", palabras: ["manzana"] }],
      items: [{ ...ITEM, estado: "revelada", palabra: "manzana", equipoQueAcerto: "t1" }],
    });
  });

  it("reset vuelve a idle desde cualquier fase", () => {
    const state = memorizaObjetosReducer(ADIVINANDO, { type: "reset" });
    expect(state).toEqual({ phase: "idle" });
  });
});
