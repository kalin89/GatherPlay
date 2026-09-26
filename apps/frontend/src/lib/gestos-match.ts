import type { Socket } from "socket.io-client";
import type {
  GestoTurnResult,
  GestosActorReadyPayload,
  GestosMatchResultPayload,
  GestosTurnResultPayload,
  GestosTurnStartedPayload,
  GestosTurnTickPayload,
  GestosTurnWaitingPayload,
  GestosWordUpdatePayload,
} from "./gestos-types";
import type { TeamScore } from "./trivia-types";

// `lastWordEvent` es un objeto nuevo en cada `gestos_word_update` (aunque el
// `motivo` se repita, ej. dos "adivinada" seguidas) para que un `useEffect`
// que lo use como dependencia dispare una vez por evento — a diferencia de
// `remainingSeconds`, que sí muta sin crear un evento nuevo en cada tick.
export type GestosMatchView =
  | { phase: "idle" }
  | { phase: "waiting_turn"; playerId: string; playerName: string; teamId: string }
  | { phase: "ready_to_start" }
  | {
      phase: "acting";
      palabra: string;
      durationSeconds: number;
      remainingSeconds: number;
      // `totalPalabras` se fija al arrancar el turno (siempre 5, ver
      // caras-y-gestos-module/analysis.md) y no cambia — `palabrasRestantes`
      // sí, en cada gestos_word_update. Juntos arman el "2/5 adivinadas".
      totalPalabras: number;
      palabrasRestantes: number;
      lastWordEvent: { motivo: "adivinada" | "paso" } | null;
    }
  | { phase: "my_turn_active" }
  | { phase: "turn_result"; resultado: GestoTurnResult }
  | { phase: "match_result"; scores: TeamScore[]; palabrasPorEquipo: Record<string, string[]> };

export const initialGestosMatchView: GestosMatchView = { phase: "idle" };

export type GestosAction =
  | { type: "gestos_turn_waiting"; payload: GestosTurnWaitingPayload }
  | { type: "gestos_turn_started"; payload: GestosTurnStartedPayload }
  | { type: "gestos_actor_ready"; payload: GestosActorReadyPayload }
  | { type: "gestos_word_update"; payload: GestosWordUpdatePayload }
  | { type: "gestos_turn_tick"; payload: GestosTurnTickPayload }
  | { type: "gestos_turn_result"; payload: GestosTurnResultPayload }
  | { type: "gestos_match_result"; payload: GestosMatchResultPayload }
  | { type: "reset" };

// Un solo reducer para ambos consumidores (pantalla y jugador), igual que
// Trivia. La diferencia es de forma, no de doble reducer: `acting` (con
// palabra) solo puede darse en quien recibió `gestos_turn_started` (siempre
// la pantalla — ver caras-y-gestos-module/analysis.md, "Privacidad"), y
// `my_turn_active` solo en quien recibió `gestos_actor_ready` (siempre el
// actor). `myPlayerId` distingue, en `gestos_turn_waiting` (que va a toda la
// sala), si le toca al propio jugador o a otro — la pantalla lo llama con
// `null` y siempre cae en `waiting_turn`, que es lo único que muestra.
export function gestosReducer(
  state: GestosMatchView,
  action: GestosAction,
  myPlayerId: string | null = null,
): GestosMatchView {
  switch (action.type) {
    case "gestos_turn_waiting":
      if (action.payload.playerId === myPlayerId) {
        return { phase: "ready_to_start" };
      }
      return {
        phase: "waiting_turn",
        playerId: action.payload.playerId,
        playerName: action.payload.playerName,
        teamId: action.payload.teamId,
      };
    case "gestos_turn_started":
      return {
        phase: "acting",
        palabra: action.payload.palabra,
        durationSeconds: action.payload.durationSeconds,
        remainingSeconds: action.payload.durationSeconds,
        totalPalabras: action.payload.palabrasRestantes,
        palabrasRestantes: action.payload.palabrasRestantes,
        lastWordEvent: null,
      };
    case "gestos_actor_ready":
      return { phase: "my_turn_active" };
    case "gestos_word_update":
      return state.phase === "acting"
        ? {
            ...state,
            palabra: action.payload.palabra,
            palabrasRestantes: action.payload.palabrasRestantes,
            lastWordEvent: { motivo: action.payload.motivo },
          }
        : state;
    case "gestos_turn_tick":
      return state.phase === "acting"
        ? { ...state, remainingSeconds: action.payload.remainingSeconds }
        : state;
    case "gestos_turn_result":
      return { phase: "turn_result", resultado: action.payload.resultado };
    case "gestos_match_result":
      return {
        phase: "match_result",
        scores: action.payload.scores,
        palabrasPorEquipo: action.payload.palabrasPorEquipo,
      };
    case "reset":
      return initialGestosMatchView;
  }
}

// Compartido entre use-room-state (pantalla) y use-join-room (jugador): ambos
// reflejan la misma vista, la diferencia está en qué hace cada componente con
// ella, no en cómo se arma.
export function subscribeToGestos(socket: Socket, dispatch: (action: GestosAction) => void): () => void {
  const onTurnWaiting = (payload: GestosTurnWaitingPayload) =>
    dispatch({ type: "gestos_turn_waiting", payload });
  const onTurnStarted = (payload: GestosTurnStartedPayload) =>
    dispatch({ type: "gestos_turn_started", payload });
  const onActorReady = (payload: GestosActorReadyPayload) =>
    dispatch({ type: "gestos_actor_ready", payload });
  const onWordUpdate = (payload: GestosWordUpdatePayload) =>
    dispatch({ type: "gestos_word_update", payload });
  const onTurnTick = (payload: GestosTurnTickPayload) =>
    dispatch({ type: "gestos_turn_tick", payload });
  const onTurnResult = (payload: GestosTurnResultPayload) =>
    dispatch({ type: "gestos_turn_result", payload });
  const onMatchResult = (payload: GestosMatchResultPayload) =>
    dispatch({ type: "gestos_match_result", payload });

  socket.on("gestos_turn_waiting", onTurnWaiting);
  socket.on("gestos_turn_started", onTurnStarted);
  socket.on("gestos_actor_ready", onActorReady);
  socket.on("gestos_word_update", onWordUpdate);
  socket.on("gestos_turn_tick", onTurnTick);
  socket.on("gestos_turn_result", onTurnResult);
  socket.on("gestos_match_result", onMatchResult);

  return () => {
    socket.off("gestos_turn_waiting", onTurnWaiting);
    socket.off("gestos_turn_started", onTurnStarted);
    socket.off("gestos_actor_ready", onActorReady);
    socket.off("gestos_word_update", onWordUpdate);
    socket.off("gestos_turn_tick", onTurnTick);
    socket.off("gestos_turn_result", onTurnResult);
    socket.off("gestos_match_result", onMatchResult);
  };
}
