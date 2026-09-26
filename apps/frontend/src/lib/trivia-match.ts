import type { Socket } from "socket.io-client";
import type {
  TeamScore,
  TriviaMatchResultPayload,
  TriviaTurnResult,
  TriviaTurnResultPayload,
  TriviaTurnStartedPayload,
  TriviaTurnUpdatePayload,
  TriviaTurnWaitingPayload,
} from "./trivia-types";

export type TriviaMatchView =
  | { phase: "idle" }
  | { phase: "waiting_turn"; playerId: string; playerName: string; teamId: string }
  | {
      phase: "my_turn";
      playerId: string;
      playerName: string;
      pregunta: string;
      opciones: string[];
      durationSeconds: number;
      remainingSeconds: number;
    }
  | {
      phase: "turn_result";
      pregunta: string;
      opciones: string[];
      indiceCorrecto: number;
      resultado: TriviaTurnResult;
    }
  | { phase: "match_result"; scores: TeamScore[] };

export const initialTriviaMatchView: TriviaMatchView = { phase: "idle" };

export type TriviaAction =
  | { type: "trivia_turn_waiting"; payload: TriviaTurnWaitingPayload }
  | { type: "trivia_turn_started"; payload: TriviaTurnStartedPayload }
  | { type: "trivia_turn_update"; payload: TriviaTurnUpdatePayload }
  | { type: "trivia_turn_result"; payload: TriviaTurnResultPayload }
  | { type: "trivia_match_result"; payload: TriviaMatchResultPayload }
  | { type: "reset" };

// Refleja tal cual lo que manda el servidor — no arma el orden de turnos ni
// decide correcta/incorrecta (eso es responsabilidad exclusiva del backend,
// ver plan.md).
export function triviaReducer(state: TriviaMatchView, action: TriviaAction): TriviaMatchView {
  switch (action.type) {
    case "trivia_turn_waiting":
      return {
        phase: "waiting_turn",
        playerId: action.payload.playerId,
        playerName: action.payload.playerName,
        teamId: action.payload.teamId,
      };
    case "trivia_turn_started":
      return {
        phase: "my_turn",
        playerId: action.payload.playerId,
        playerName: action.payload.playerName,
        pregunta: action.payload.pregunta,
        opciones: action.payload.opciones,
        durationSeconds: action.payload.durationSeconds,
        remainingSeconds: action.payload.durationSeconds,
      };
    case "trivia_turn_update":
      return state.phase === "my_turn"
        ? { ...state, remainingSeconds: action.payload.remainingSeconds }
        : state;
    case "trivia_turn_result":
      return {
        phase: "turn_result",
        pregunta: action.payload.pregunta,
        opciones: action.payload.opciones,
        indiceCorrecto: action.payload.indiceCorrecto,
        resultado: action.payload.resultado,
      };
    case "trivia_match_result":
      return { phase: "match_result", scores: action.payload.scores };
    case "reset":
      return initialTriviaMatchView;
  }
}

// Compartido entre use-room-state (pantalla) y use-join-room (jugador): ambos
// reflejan la misma vista, la diferencia está en qué hace cada componente con
// ella, no en cómo se arma.
export function subscribeToTrivia(socket: Socket, dispatch: (action: TriviaAction) => void): () => void {
  const onTurnWaiting = (payload: TriviaTurnWaitingPayload) =>
    dispatch({ type: "trivia_turn_waiting", payload });
  const onTurnStarted = (payload: TriviaTurnStartedPayload) =>
    dispatch({ type: "trivia_turn_started", payload });
  const onTurnUpdate = (payload: TriviaTurnUpdatePayload) =>
    dispatch({ type: "trivia_turn_update", payload });
  const onTurnResult = (payload: TriviaTurnResultPayload) =>
    dispatch({ type: "trivia_turn_result", payload });
  const onMatchResult = (payload: TriviaMatchResultPayload) =>
    dispatch({ type: "trivia_match_result", payload });

  socket.on("trivia_turn_waiting", onTurnWaiting);
  socket.on("trivia_turn_started", onTurnStarted);
  socket.on("trivia_turn_update", onTurnUpdate);
  socket.on("trivia_turn_result", onTurnResult);
  socket.on("trivia_match_result", onMatchResult);

  return () => {
    socket.off("trivia_turn_waiting", onTurnWaiting);
    socket.off("trivia_turn_started", onTurnStarted);
    socket.off("trivia_turn_update", onTurnUpdate);
    socket.off("trivia_turn_result", onTurnResult);
    socket.off("trivia_match_result", onMatchResult);
  };
}
