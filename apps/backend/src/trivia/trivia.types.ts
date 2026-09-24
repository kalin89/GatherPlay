export interface TriviaAnswerResult {
  playerId: string;
  opcionIndex: number | null;
  correcta: boolean;
  puntos: number;
}

export type TriviaEvent =
  | {
      type: 'trivia_question';
      code: string;
      categoria: string;
      pregunta: string;
      opciones: string[];
    }
  | {
      type: 'trivia_result';
      code: string;
      pregunta: string;
      opciones: string[];
      indiceCorrecto: number;
      resultados: TriviaAnswerResult[];
    };
