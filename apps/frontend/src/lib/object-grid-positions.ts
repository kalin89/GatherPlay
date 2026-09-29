// Funciones puras para la secuencia animada de 5 tramos de la fase
// "memorizando" (spec.md → "10. Memoriza los objetos en la imagen"). Los
// tramos se definen directamente en términos de `remainingSeconds` (que ya
// manda el servidor, de 30 a 0) para no duplicar la duración total en el
// frontend.
export type GridSegment = "grid" | "shuffle" | "scatter" | "orbit" | "fadeout";

export function segmentForRemaining(remainingSeconds: number): GridSegment {
  if (remainingSeconds > 20) return "grid"; // segundos 0-9 transcurridos
  if (remainingSeconds > 15) return "shuffle"; // segundos 10-14
  if (remainingSeconds > 10) return "scatter"; // segundos 15-19
  if (remainingSeconds > 5) return "orbit"; // segundos 20-24
  return "fadeout"; // segundos 25-30
}

export interface GridPosition {
  top: number; // porcentaje (0-100) dentro del contenedor
  left: number;
}

function shuffleArray<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

// Filas y columnas, lo más parejo posible, centrado en cada celda.
export function gridPositions(count: number): GridPosition[] {
  if (count <= 0) return [];
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    return {
      left: ((col + 0.5) / columns) * 100,
      top: ((row + 0.5) / rows) * 100,
    };
  });
}

// Mismas celdas que gridPositions, pero el orden en que se asignan a los
// items se permuta una vez — visualmente, cada objeto "salta" a otra celda
// de la misma grilla.
export function shufflePositions(count: number, random: () => number = Math.random): GridPosition[] {
  return shuffleArray(gridPositions(count), random);
}

// Posición libre dentro del contenedor, con margen para que ninguna imagen
// quede cortada por el borde.
const SCATTER_MARGIN = 8;
const SCATTER_RANGE = 100 - SCATTER_MARGIN * 2;

export function scatterPositions(count: number, random: () => number = Math.random): GridPosition[] {
  return Array.from({ length: count }, () => ({
    top: SCATTER_MARGIN + random() * SCATTER_RANGE,
    left: SCATTER_MARGIN + random() * SCATTER_RANGE,
  }));
}

// Ángulo inicial de cada imagen en el tramo "orbit" — igualmente espaciadas
// alrededor de un círculo (0-360°), para el efecto de movimiento tipo
// serpiente (spec.md).
export function orbitAngleOffsetDeg(index: number, count: number): number {
  if (count <= 0) return 0;
  return (index / count) * 360;
}
