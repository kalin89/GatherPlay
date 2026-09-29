import type { Socket } from "socket.io-client";
import type {
  MemorizaIntentoResultadoPayload,
  MemorizaJugadorActivo,
  MemorizaMatchResultPayload,
  MemorizaMemorizandoPayload,
  MemorizaObjetosItem,
  MemorizaPonAtencionPayload,
  MemorizaTableroPayload,
  MemorizaTeamClock,
  MemorizaBoardItemPublic,
  MemorizaTurnoJugadorPayload,
  MemorizaWaitingReadyPayload,
} from "./memoriza-objetos-types";
import type { TeamScore } from "./trivia-types";

// Un solo reducer para pantalla y jugador, mismo criterio que
// laRocolaReducer/adivinaPalabraReducer: la distinción está en qué eventos le
// llegan a cada socket (`memoriza_turno_jugador` solo llega al jugador en
// turno), no en dos variantes de estado. A diferencia de
// `rocola_audio_control` (comando imperativo para un <audio>),
// `memoriza_turno_jugador` sí encaja dentro de este reducer — solo agrega un
// campo (`miPuedePasar`) al mismo estado de la fase `adivinando`.
export type MemorizaObjetosView =
  | { phase: "idle" }
  | {
      phase: "waiting_ready";
      readyPlayerIds: string[];
      eligiblePlayerIds: string[];
      items: MemorizaObjetosItem[];
    }
  | { phase: "pon_atencion"; remainingSeconds: number }
  | { phase: "memorizando"; items: MemorizaObjetosItem[]; remainingSeconds: number }
  | {
      phase: "adivinando";
      items: MemorizaBoardItemPublic[];
      clocks: MemorizaTeamClock[];
      equipoActivoId: string | null;
      jugadorActivo: MemorizaJugadorActivo | null;
      miPuedePasar: boolean;
      ultimoIntento: { teamId: string; acierto: boolean; palabra: string | null } | null;
      turnNumber: number;
    }
  | {
      phase: "match_result";
      scores: TeamScore[];
      palabrasPorEquipo: { teamId: string; palabras: string[] }[];
      items: MemorizaBoardItemPublic[];
    };

export const initialMemorizaObjetosMatchView: MemorizaObjetosView = { phase: "idle" };

export type MemorizaObjetosAction =
  | { type: "memoriza_waiting_ready"; payload: MemorizaWaitingReadyPayload }
  | { type: "memoriza_pon_atencion"; payload: MemorizaPonAtencionPayload }
  | { type: "memoriza_memorizando"; payload: MemorizaMemorizandoPayload }
  | { type: "memoriza_tablero"; payload: MemorizaTableroPayload }
  | { type: "memoriza_turno_jugador"; payload: MemorizaTurnoJugadorPayload }
  | { type: "memoriza_intento_resultado"; payload: MemorizaIntentoResultadoPayload }
  | { type: "memoriza_match_result"; payload: MemorizaMatchResultPayload }
  | { type: "reset" };

export function memorizaObjetosReducer(
  state: MemorizaObjetosView,
  action: MemorizaObjetosAction,
): MemorizaObjetosView {
  switch (action.type) {
    case "memoriza_waiting_ready":
      return {
        phase: "waiting_ready",
        readyPlayerIds: action.payload.readyPlayerIds,
        eligiblePlayerIds: action.payload.eligiblePlayerIds,
        items: action.payload.items,
      };
    case "memoriza_pon_atencion":
      return { phase: "pon_atencion", remainingSeconds: action.payload.remainingSeconds };
    case "memoriza_memorizando":
      return {
        phase: "memorizando",
        items: action.payload.items,
        remainingSeconds: action.payload.remainingSeconds,
      };
    case "memoriza_tablero": {
      const previous = state.phase === "adivinando" ? state : null;
      return {
        phase: "adivinando",
        items: action.payload.items,
        clocks: action.payload.clocks,
        equipoActivoId: action.payload.equipoActivoId,
        jugadorActivo: action.payload.jugadorActivo,
        miPuedePasar: previous?.miPuedePasar ?? false,
        ultimoIntento: previous?.ultimoIntento ?? null,
        turnNumber: action.payload.turnNumber,
      };
    }
    case "memoriza_turno_jugador":
      if (state.phase !== "adivinando") return state;
      return { ...state, miPuedePasar: action.payload.puedePasar };
    case "memoriza_intento_resultado":
      if (state.phase !== "adivinando") return state;
      return {
        ...state,
        ultimoIntento: {
          teamId: action.payload.teamId,
          acierto: action.payload.acierto,
          palabra: action.payload.palabra,
        },
      };
    case "memoriza_match_result":
      return {
        phase: "match_result",
        scores: action.payload.scores,
        palabrasPorEquipo: action.payload.palabrasPorEquipo,
        items: action.payload.items,
      };
    case "reset":
      return initialMemorizaObjetosMatchView;
  }
}

// Compartido entre use-room-state (pantalla) y use-join-room (jugador).
export function subscribeToMemorizaObjetos(
  socket: Socket,
  dispatch: (action: MemorizaObjetosAction) => void,
): () => void {
  const onWaitingReady = (payload: MemorizaWaitingReadyPayload) =>
    dispatch({ type: "memoriza_waiting_ready", payload });
  const onPonAtencion = (payload: MemorizaPonAtencionPayload) =>
    dispatch({ type: "memoriza_pon_atencion", payload });
  const onMemorizando = (payload: MemorizaMemorizandoPayload) =>
    dispatch({ type: "memoriza_memorizando", payload });
  const onTablero = (payload: MemorizaTableroPayload) =>
    dispatch({ type: "memoriza_tablero", payload });
  const onTurnoJugador = (payload: MemorizaTurnoJugadorPayload) =>
    dispatch({ type: "memoriza_turno_jugador", payload });
  const onIntentoResultado = (payload: MemorizaIntentoResultadoPayload) =>
    dispatch({ type: "memoriza_intento_resultado", payload });
  const onMatchResult = (payload: MemorizaMatchResultPayload) =>
    dispatch({ type: "memoriza_match_result", payload });

  socket.on("memoriza_waiting_ready", onWaitingReady);
  socket.on("memoriza_pon_atencion", onPonAtencion);
  socket.on("memoriza_memorizando", onMemorizando);
  socket.on("memoriza_tablero", onTablero);
  socket.on("memoriza_turno_jugador", onTurnoJugador);
  socket.on("memoriza_intento_resultado", onIntentoResultado);
  socket.on("memoriza_match_result", onMatchResult);

  return () => {
    socket.off("memoriza_waiting_ready", onWaitingReady);
    socket.off("memoriza_pon_atencion", onPonAtencion);
    socket.off("memoriza_memorizando", onMemorizando);
    socket.off("memoriza_tablero", onTablero);
    socket.off("memoriza_turno_jugador", onTurnoJugador);
    socket.off("memoriza_intento_resultado", onIntentoResultado);
    socket.off("memoriza_match_result", onMatchResult);
  };
}
