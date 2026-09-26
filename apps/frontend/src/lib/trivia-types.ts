// Espejo de los payloads que emite apps/backend/src/trivia/trivia.gateway.ts
// (sin `targetSocketIds`, que es un detalle interno del backend — nunca viaja
// por la red).

export interface TriviaTurnResult {
  playerId: string;
  playerName: string;
  teamId: string;
  opcionElegida: number | null;
  correcta: boolean;
  puntos: number;
}

export interface TeamScore {
  teamId: string;
  score: number;
}

export interface TriviaTurnWaitingPayload {
  code: string;
  playerId: string;
  playerName: string;
  teamId: string;
}

export interface TriviaTurnStartedPayload {
  code: string;
  playerId: string;
  playerName: string;
  pregunta: string;
  opciones: string[];
  durationSeconds: number;
}

export interface TriviaTurnUpdatePayload {
  code: string;
  remainingSeconds: number;
}

export interface TriviaTurnResultPayload {
  code: string;
  pregunta: string;
  opciones: string[];
  indiceCorrecto: number;
  resultado: TriviaTurnResult;
}

export interface TriviaMatchResultPayload {
  code: string;
  scores: TeamScore[];
}
