import type { Socket } from "socket.io-client";
import type {
  RocolaAnswerTickPayload,
  RocolaBuzzerLockedPayload,
  RocolaBuzzerOpenPayload,
  RocolaCountdownTickPayload,
  RocolaMatchResultPayload,
  RocolaReadyStatePayload,
  RocolaRoboStartedPayload,
  RocolaRoundResult,
  RocolaRoundResultPayload,
  RocolaRoundStartedPayload,
} from "./la-rocola-types";
import type { TeamScore } from "./trivia-types";

export const ROCOLA_COUNTDOWN_SECONDS = 5;
export const ROCOLA_ANSWER_SECONDS = 30;

// Un solo reducer para pantalla y jugador, mismo criterio que
// adivinaPalabraReducer: la distinción está en qué eventos le llegan a cada
// socket (ej. `rocola_audio_control` nunca llega a un celular), no en dos
// variantes de estado. `rocola_audio_control` NO pasa por este reducer — es
// un comando imperativo para el <audio> de la pantalla, manejado aparte en
// use-room-state.ts (ver la-rocola-ui/analysis.md).
export type LaRocolaView =
  | { phase: "idle" }
  | { phase: "waiting_ready"; readyPlayerIds: string[]; eligiblePlayerIds: string[] }
  | {
      phase: "countdown";
      remainingSeconds: number;
      roundNumber: number;
      totalRounds: number;
      marcador: TeamScore[];
    }
  | { phase: "sonando"; roundNumber: number; totalRounds: number; marcador: TeamScore[] }
  | {
      phase: "respondiendo";
      roundNumber: number;
      buzzedPlayerId: string;
      buzzedPlayerName: string;
      buzzedTeamId: string;
      remainingSeconds: number;
      marcador: TeamScore[];
    }
  | {
      phase: "robo_respondiendo";
      roundNumber: number;
      buzzedPlayerId: string;
      buzzedPlayerName: string;
      buzzedTeamId: string;
      remainingSeconds: number;
      marcador: TeamScore[];
    }
  | {
      phase: "robo";
      roundNumber: number;
      eligibleTeamIds: string[];
      eligibleTeamNames: string[];
      remainingSeconds: number;
      marcador: TeamScore[];
    }
  | { phase: "revelacion"; resultado: RocolaRoundResult; marcador: TeamScore[] }
  | {
      phase: "match_result";
      scores: TeamScore[];
      canciones: { titulo: string; artista: string; teamId: string | null }[];
    };

export const initialLaRocolaMatchView: LaRocolaView = { phase: "idle" };

export type LaRocolaAction =
  | { type: "rocola_ready_state"; payload: RocolaReadyStatePayload }
  | { type: "rocola_round_started"; payload: RocolaRoundStartedPayload }
  | { type: "rocola_countdown_tick"; payload: RocolaCountdownTickPayload }
  | { type: "rocola_buzzer_open"; payload: RocolaBuzzerOpenPayload }
  | { type: "rocola_buzzer_locked"; payload: RocolaBuzzerLockedPayload }
  | { type: "rocola_answer_tick"; payload: RocolaAnswerTickPayload }
  | { type: "rocola_robo_started"; payload: RocolaRoboStartedPayload }
  | { type: "rocola_round_result"; payload: RocolaRoundResultPayload }
  | { type: "rocola_match_result"; payload: RocolaMatchResultPayload }
  | { type: "reset" };

function carryMarcador(state: LaRocolaView): TeamScore[] {
  return "marcador" in state ? state.marcador : [];
}

// Se usa como parte de la `key` de React del botón de buzzer (ver
// play-la-rocola.tsx) para que el guard local de "ya presioné" se resetee
// entre una ronda y la siguiente, y entre la fase `sonando` y un eventual
// `robo` — sin depender de un efecto que llame `setState`.
function carryRoundNumber(state: LaRocolaView): number {
  return "roundNumber" in state ? state.roundNumber : 0;
}

function applyResultToMarcador(marcador: TeamScore[], resultado: RocolaRoundResult): TeamScore[] {
  if (resultado.teamId === null) return marcador;
  return marcador.map((entry) =>
    entry.teamId === resultado.teamId ? { ...entry, score: entry.score + resultado.puntos } : entry,
  );
}

export function laRocolaReducer(state: LaRocolaView, action: LaRocolaAction): LaRocolaView {
  switch (action.type) {
    case "rocola_ready_state":
      return {
        phase: "waiting_ready",
        readyPlayerIds: action.payload.readyPlayerIds,
        eligiblePlayerIds: action.payload.eligiblePlayerIds,
      };
    case "rocola_round_started":
      return {
        phase: "countdown",
        remainingSeconds: ROCOLA_COUNTDOWN_SECONDS,
        roundNumber: action.payload.roundNumber,
        totalRounds: action.payload.totalRounds,
        marcador: action.payload.marcador,
      };
    case "rocola_countdown_tick":
      if (state.phase !== "countdown") return state;
      return { ...state, remainingSeconds: action.payload.remainingSeconds };
    case "rocola_buzzer_open": {
      const { roundNumber, totalRounds } =
        state.phase === "countdown" ? state : { roundNumber: 0, totalRounds: 0 };
      return { phase: "sonando", roundNumber, totalRounds, marcador: carryMarcador(state) };
    }
    case "rocola_buzzer_locked":
      return {
        phase: state.phase === "robo" ? "robo_respondiendo" : "respondiendo",
        roundNumber: carryRoundNumber(state),
        buzzedPlayerId: action.payload.playerId,
        buzzedPlayerName: action.payload.playerName,
        buzzedTeamId: action.payload.teamId,
        remainingSeconds: ROCOLA_ANSWER_SECONDS,
        marcador: carryMarcador(state),
      };
    case "rocola_answer_tick":
      if (state.phase !== "respondiendo" && state.phase !== "robo_respondiendo") return state;
      return { ...state, remainingSeconds: action.payload.remainingSeconds };
    case "rocola_robo_started":
      return {
        phase: "robo",
        roundNumber: carryRoundNumber(state),
        eligibleTeamIds: action.payload.eligibleTeamIds,
        eligibleTeamNames: action.payload.eligibleTeamNames,
        remainingSeconds: action.payload.remainingSeconds,
        marcador: carryMarcador(state),
      };
    case "rocola_round_result":
      return {
        phase: "revelacion",
        resultado: action.payload.resultado,
        marcador: applyResultToMarcador(carryMarcador(state), action.payload.resultado),
      };
    case "rocola_match_result":
      return {
        phase: "match_result",
        scores: action.payload.scores,
        canciones: action.payload.canciones,
      };
    case "reset":
      return initialLaRocolaMatchView;
  }
}

// Compartido entre use-room-state (pantalla) y use-join-room (jugador). No
// incluye `rocola_audio_control` — se maneja aparte, imperativamente, en
// quien lo necesite (solo la pantalla).
export function subscribeToLaRocola(
  socket: Socket,
  dispatch: (action: LaRocolaAction) => void,
): () => void {
  const onReadyState = (payload: RocolaReadyStatePayload) =>
    dispatch({ type: "rocola_ready_state", payload });
  const onRoundStarted = (payload: RocolaRoundStartedPayload) =>
    dispatch({ type: "rocola_round_started", payload });
  const onCountdownTick = (payload: RocolaCountdownTickPayload) =>
    dispatch({ type: "rocola_countdown_tick", payload });
  const onBuzzerOpen = (payload: RocolaBuzzerOpenPayload) =>
    dispatch({ type: "rocola_buzzer_open", payload });
  const onBuzzerLocked = (payload: RocolaBuzzerLockedPayload) =>
    dispatch({ type: "rocola_buzzer_locked", payload });
  const onAnswerTick = (payload: RocolaAnswerTickPayload) =>
    dispatch({ type: "rocola_answer_tick", payload });
  const onRoboStarted = (payload: RocolaRoboStartedPayload) =>
    dispatch({ type: "rocola_robo_started", payload });
  const onRoundResult = (payload: RocolaRoundResultPayload) =>
    dispatch({ type: "rocola_round_result", payload });
  const onMatchResult = (payload: RocolaMatchResultPayload) =>
    dispatch({ type: "rocola_match_result", payload });

  socket.on("rocola_ready_state", onReadyState);
  socket.on("rocola_round_started", onRoundStarted);
  socket.on("rocola_countdown_tick", onCountdownTick);
  socket.on("rocola_buzzer_open", onBuzzerOpen);
  socket.on("rocola_buzzer_locked", onBuzzerLocked);
  socket.on("rocola_answer_tick", onAnswerTick);
  socket.on("rocola_robo_started", onRoboStarted);
  socket.on("rocola_round_result", onRoundResult);
  socket.on("rocola_match_result", onMatchResult);

  return () => {
    socket.off("rocola_ready_state", onReadyState);
    socket.off("rocola_round_started", onRoundStarted);
    socket.off("rocola_countdown_tick", onCountdownTick);
    socket.off("rocola_buzzer_open", onBuzzerOpen);
    socket.off("rocola_buzzer_locked", onBuzzerLocked);
    socket.off("rocola_answer_tick", onAnswerTick);
    socket.off("rocola_robo_started", onRoboStarted);
    socket.off("rocola_round_result", onRoundResult);
    socket.off("rocola_match_result", onMatchResult);
  };
}
