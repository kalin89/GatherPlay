import type { AdivinaWord } from './adivina-palabra.types.js';

// Abstracción de la que depende AiContentService (D de SOLID, mismo criterio
// que TriviaGenerator/GestureGenerator) — nunca del cliente de Anthropic
// directamente, así se puede probar sin red.
export interface WordGenerator {
  generate(cantidad: number, excluir: string[]): Promise<AdivinaWord[]>;
}

export const WORD_GENERATOR = Symbol('WORD_GENERATOR');
