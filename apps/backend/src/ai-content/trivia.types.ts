export const TRIVIA_CATEGORIES = [
  'general',
  'historia',
  'geografia',
  'ciencia',
  'deportes',
  'entretenimiento',
] as const;

export type TriviaCategory = (typeof TRIVIA_CATEGORIES)[number];

// Forma cruda que produce tanto la IA como el banco de respaldo, antes de
// barajar las opciones — la posición de la correcta la decide el servidor,
// nunca la IA (ver spec.md → "Contenido de IA — Trivia").
export interface RawTriviaQuestion {
  pregunta: string;
  correcta: string;
  incorrectas: string[];
}

// Lo que consume TriviaModule: opciones ya barajadas + el índice de la correcta.
export interface TriviaQuestion {
  categoria: TriviaCategory;
  pregunta: string;
  opciones: string[];
  indiceCorrecto: number;
}
