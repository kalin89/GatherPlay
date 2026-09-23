import type { RawTriviaQuestion, TriviaCategory } from './trivia.types.js';

// Abstracción de la que depende AiContentService (D de SOLID, ver plan.md) —
// nunca del cliente de Anthropic directamente, así se puede probar sin red.
export interface TriviaGenerator {
  generate(categoria: TriviaCategory, cantidad: number): Promise<RawTriviaQuestion[]>;
}

export const TRIVIA_GENERATOR = Symbol('TRIVIA_GENERATOR');
