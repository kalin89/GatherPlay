import type { GestureWord } from './gestos.types.js';

// Abstracción de la que depende AiContentService (D de SOLID, mismo criterio
// que TriviaGenerator) — nunca del cliente de Anthropic directamente, así se
// puede probar sin red.
export interface GestureGenerator {
  generate(cantidad: number, excluir: string[]): Promise<GestureWord[]>;
}

export const GESTURE_GENERATOR = Symbol('GESTURE_GENERATOR');
