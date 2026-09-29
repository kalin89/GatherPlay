import { describe, expect, it } from "vitest";
import {
  gridPositions,
  orbitAngleOffsetDeg,
  scatterPositions,
  segmentForRemaining,
  shufflePositions,
} from "./object-grid-positions";

describe("segmentForRemaining", () => {
  it("segundos 30 a 21 (transcurridos 0-9): grid", () => {
    expect(segmentForRemaining(30)).toBe("grid");
    expect(segmentForRemaining(21)).toBe("grid");
  });

  it("segundos 20 a 16 (transcurridos 10-14): shuffle", () => {
    expect(segmentForRemaining(20)).toBe("shuffle");
    expect(segmentForRemaining(16)).toBe("shuffle");
  });

  it("segundos 15 a 11 (transcurridos 15-19): scatter", () => {
    expect(segmentForRemaining(15)).toBe("scatter");
    expect(segmentForRemaining(11)).toBe("scatter");
  });

  it("segundos 10 a 6 (transcurridos 20-24): orbit", () => {
    expect(segmentForRemaining(10)).toBe("orbit");
    expect(segmentForRemaining(6)).toBe("orbit");
  });

  it("segundos 5 a 0 (transcurridos 25-30): fadeout", () => {
    expect(segmentForRemaining(5)).toBe("fadeout");
    expect(segmentForRemaining(0)).toBe("fadeout");
  });
});

describe("gridPositions", () => {
  it("devuelve la cantidad pedida, todas dentro de 0-100", () => {
    const positions = gridPositions(20);
    expect(positions).toHaveLength(20);
    for (const p of positions) {
      expect(p.top).toBeGreaterThanOrEqual(0);
      expect(p.top).toBeLessThanOrEqual(100);
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.left).toBeLessThanOrEqual(100);
    }
  });

  it("con 0 objetos devuelve un array vacío", () => {
    expect(gridPositions(0)).toEqual([]);
  });
});

describe("shufflePositions", () => {
  it("devuelve una permutación del mismo conjunto de celdas que gridPositions", () => {
    const grid = gridPositions(20);
    const shuffled = shufflePositions(20, () => 0);
    expect(shuffled).toHaveLength(20);
    const asSet = (arr: { top: number; left: number }[]) =>
      new Set(arr.map((p) => `${p.top}-${p.left}`));
    expect(asSet(shuffled)).toEqual(asSet(grid));
  });
});

describe("scatterPositions", () => {
  it("devuelve la cantidad pedida, todas dentro del margen 8-92", () => {
    const positions = scatterPositions(20, Math.random);
    expect(positions).toHaveLength(20);
    for (const p of positions) {
      expect(p.top).toBeGreaterThanOrEqual(8);
      expect(p.top).toBeLessThanOrEqual(92);
      expect(p.left).toBeGreaterThanOrEqual(8);
      expect(p.left).toBeLessThanOrEqual(92);
    }
  });
});

describe("orbitAngleOffsetDeg", () => {
  it("reparte 360 grados parejo entre las imágenes", () => {
    expect(orbitAngleOffsetDeg(0, 4)).toBe(0);
    expect(orbitAngleOffsetDeg(1, 4)).toBe(90);
    expect(orbitAngleOffsetDeg(2, 4)).toBe(180);
    expect(orbitAngleOffsetDeg(3, 4)).toBe(270);
  });

  it("con 0 imágenes no divide por cero", () => {
    expect(orbitAngleOffsetDeg(0, 0)).toBe(0);
  });
});
