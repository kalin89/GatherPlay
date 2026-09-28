import type { Socket } from "socket.io-client";
import type {
  AdivinaJugadorEstadoPayload,
  AdivinaMatchResultPayload,
  AdivinaPantallaEstadoPayload,
  AdivinaTurnResult,
  AdivinaTurnResultPayload,
  AdivinaTurnWaitingPayload,
} from "./adivina-palabra-types";
import type { TeamScore } from "./trivia-types";

interface SiguienteTurno {
  playerId: string;
  playerName: string;
  teamId: string;
  marcador: TeamScore[];
}

// `waiting_ready` es una sola fase para pantalla y jugador (a diferencia de
// Caras y Gestos, que separa `waiting_turn`/`ready_to_start`) — quien la
// consume decide qué mostrar comparando `playerId` contra su propio
// `playerId` (la pantalla no compara nunca, siempre queda igual). `lastAccion`
// es un objeto nuevo solo cuando el servidor manda `ultimaAccion` distinto de
// null (una acción real), nunca en un tick — así un `useEffect` que lo use
// como dependencia sólo suena una vez por acción, nunca por segundo.
export type AdivinaPalabraView =
  | { phase: "idle" }
  | {
      phase: "waiting_ready";
      playerId: string;
      playerName: string;
      teamId: string;
      marcador: TeamScore[];
    }
  | {
      phase: "active_screen";
      playerId: string;
      playerName: string;
      teamId: string;
      marcador: TeamScore[];
      palabra: string | null;
      remainingSeconds: number;
      pasesRestantes: number;
      lastAccion: { tipo: "adivinada" | "paso" } | null;
    }
  | { phase: "active_player"; remainingSeconds: number; pasesRestantes: number }
  | {
      phase: "turn_result";
      resultado: AdivinaTurnResult;
      // Llega casi al mismo tiempo que el turn_result el adivina_turn_waiting
      // del siguiente turno — se adosa acá en vez de saltar de fase, para
      // poder mostrar "Siguiente Jugador {Nombre}" sin tapar el resumen del
      // turno recién terminado (ver adivina-palabra-ui/analysis.md).
      siguiente?: SiguienteTurno;
    }
  | {
      phase: "match_result";
      scores: TeamScore[];
      palabrasPorEquipo: { teamId: string; palabras: string[] }[];
    };

export const initialAdivinaPalabraMatchView: AdivinaPalabraView = { phase: "idle" };

export type AdivinaPalabraAction =
  | { type: "adivina_turn_waiting"; payload: AdivinaTurnWaitingPayload }
  | { type: "adivina_pantalla_estado"; payload: AdivinaPantallaEstadoPayload }
  | { type: "adivina_jugador_estado"; payload: AdivinaJugadorEstadoPayload }
  | { type: "adivina_turn_result"; payload: AdivinaTurnResultPayload }
  | { type: "adivina_match_result"; payload: AdivinaMatchResultPayload }
  | { type: "reset" };

// Un solo reducer para ambos consumidores (pantalla y jugador), mismo
// criterio que triviaReducer/gestosReducer. `myPlayerId` no cambia qué fase
// resulta de `adivina_turn_waiting` (siempre `waiting_ready`, a diferencia de
// Gestos) — cada componente decide qué mostrar comparando el `playerId` de la
// vista contra el propio.
export function adivinaPalabraReducer(
  state: AdivinaPalabraView,
  action: AdivinaPalabraAction,
): AdivinaPalabraView {
  switch (action.type) {
    case "adivina_turn_waiting": {
      const { playerId, playerName, teamId, marcador } = action.payload;
      if (state.phase === "turn_result") {
        return { ...state, siguiente: { playerId, playerName, teamId, marcador } };
      }
      return { phase: "waiting_ready", playerId, playerName, teamId, marcador };
    }
    case "adivina_pantalla_estado": {
      const carried =
        state.phase === "waiting_ready" || state.phase === "active_screen"
          ? {
              playerId: state.playerId,
              playerName: state.playerName,
              teamId: state.teamId,
              marcador: state.marcador,
            }
          : state.phase === "turn_result" && state.siguiente
            ? {
                playerId: state.siguiente.playerId,
                playerName: state.siguiente.playerName,
                teamId: state.siguiente.teamId,
                marcador: state.siguiente.marcador,
              }
            : { playerId: "", playerName: "", teamId: "", marcador: [] };
      return {
        phase: "active_screen",
        ...carried,
        palabra: action.payload.palabra,
        remainingSeconds: action.payload.remainingSeconds,
        pasesRestantes: action.payload.pasesRestantes,
        lastAccion: action.payload.ultimaAccion ? { tipo: action.payload.ultimaAccion } : null,
      };
    }
    case "adivina_jugador_estado":
      return {
        phase: "active_player",
        remainingSeconds: action.payload.remainingSeconds,
        pasesRestantes: action.payload.pasesRestantes,
      };
    case "adivina_turn_result":
      return { phase: "turn_result", resultado: action.payload.resultado };
    case "adivina_match_result":
      return {
        phase: "match_result",
        scores: action.payload.scores,
        palabrasPorEquipo: action.payload.palabrasPorEquipo,
      };
    case "reset":
      return initialAdivinaPalabraMatchView;
  }
}

// Compartido entre use-room-state (pantalla) y use-join-room (jugador).
export function subscribeToAdivinaPalabra(
  socket: Socket,
  dispatch: (action: AdivinaPalabraAction) => void,
): () => void {
  const onTurnWaiting = (payload: AdivinaTurnWaitingPayload) =>
    dispatch({ type: "adivina_turn_waiting", payload });
  const onPantallaEstado = (payload: AdivinaPantallaEstadoPayload) =>
    dispatch({ type: "adivina_pantalla_estado", payload });
  const onJugadorEstado = (payload: AdivinaJugadorEstadoPayload) =>
    dispatch({ type: "adivina_jugador_estado", payload });
  const onTurnResult = (payload: AdivinaTurnResultPayload) =>
    dispatch({ type: "adivina_turn_result", payload });
  const onMatchResult = (payload: AdivinaMatchResultPayload) =>
    dispatch({ type: "adivina_match_result", payload });

  socket.on("adivina_turn_waiting", onTurnWaiting);
  socket.on("adivina_pantalla_estado", onPantallaEstado);
  socket.on("adivina_jugador_estado", onJugadorEstado);
  socket.on("adivina_turn_result", onTurnResult);
  socket.on("adivina_match_result", onMatchResult);

  return () => {
    socket.off("adivina_turn_waiting", onTurnWaiting);
    socket.off("adivina_pantalla_estado", onPantallaEstado);
    socket.off("adivina_jugador_estado", onJugadorEstado);
    socket.off("adivina_turn_result", onTurnResult);
    socket.off("adivina_match_result", onMatchResult);
  };
}
