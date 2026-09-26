"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { createSocket } from "@/lib/socket";
import type { RoomState } from "@/lib/room-types";
import {
  initialTriviaMatchView,
  subscribeToTrivia,
  triviaReducer,
  type TriviaMatchView,
} from "@/lib/trivia-match";
import {
  gestosReducer,
  initialGestosMatchView,
  subscribeToGestos,
  type GestosAction,
  type GestosMatchView,
} from "@/lib/gestos-match";

interface RoomError {
  message: string;
}

export type JoinRoomStatus = "idle" | "joining" | "joined" | "error";

export interface UseJoinRoomResult {
  status: JoinRoomStatus;
  state: RoomState | null;
  error: RoomError | null;
  /** Error de una acción posterior a unirse (ej. un `submit_trivia_answer`
   * que llegó tarde) recibido DESPUÉS de estar `joined`. A diferencia de
   * `error`, no debe sacar al jugador de la vista de juego — mismo criterio
   * que ya usa `use-room-state.ts`. */
  actionError: RoomError | null;
  /** El `Player.id` propio dentro de `state.players`, o null si no se unió
   * todavía. Se calcula emparejando `player.socketId` con el id del socket
   * propio — necesario porque el servidor no marca "vos sos este" en
   * `room_state`, solo manda la lista completa. */
  playerId: string | null;
  trivia: TriviaMatchView;
  /** Versión "jugador" — compara `gestos_turn_waiting.playerId` contra el
   * propio `playerId` para distinguir `ready_to_start` de `waiting_turn`. */
  gestos: GestosMatchView;
  join: (name: string) => void;
  submitAnswer: (opcionIndex: number) => void;
  startGestosTurn: () => void;
  markGestureWord: (resultado: "adivinada" | "paso") => void;
}

// Une al jugador a una sala (vía `join_room`) y mantiene el mismo socket
// vivo mientras espera en el lobby, reflejando `room_state` en vivo.
//
// A diferencia de `useRoomState` (espectador, se suscribe sin registrarse
// como jugador), acá el socket ES la identidad del jugador: si se
// desconecta, el backend lo remueve de la sala (`handleDisconnect` →
// `removePlayerBySocketId`) — comportamiento correcto, no se evita.
// Por eso es un hook aparte y no un modo más de `useRoomState`.
export function useJoinRoom(roomCode: string): UseJoinRoomResult {
  const [status, setStatus] = useState<JoinRoomStatus>("idle");
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<RoomError | null>(null);
  const [actionError, setActionError] = useState<RoomError | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [trivia, dispatchTrivia] = useReducer(triviaReducer, initialTriviaMatchView);
  const [gestos, dispatchGestos] = useReducer(
    (state: GestosMatchView, action: GestosAction) => gestosReducer(state, action, playerId),
    initialGestosMatchView,
  );
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const join = useCallback(
    (name: string) => {
      const trimmedName = name.trim();
      if (!trimmedName || status === "joining" || status === "joined") {
        return;
      }

      // Descarta cualquier socket de un intento anterior fallido antes de
      // abrir uno nuevo.
      socketRef.current?.disconnect();

      setStatus("joining");
      setError(null);

      const socket = createSocket();
      socketRef.current = socket;
      subscribeToTrivia(socket, dispatchTrivia);
      subscribeToGestos(socket, dispatchGestos);
      let hasJoined = false;

      socket.on("connect", () => {
        // El código de sala es solo A-Z0-9 (sin ambiguos); normalizamos acá
        // para que un celular con autocapitalize apagado no falle por esto.
        socket.emit("join_room", {
          code: roomCode.toUpperCase(),
          name: trimmedName,
        });
      });

      socket.on("room_state", (room: RoomState) => {
        hasJoined = true;
        setStatus("joined");
        setError(null);
        setState(room);
        const me = room.players.find((p) => p.socketId === socket.id);
        setPlayerId(me?.id ?? null);
        // Mismo criterio que use-room-state.ts: sin juego elegido, no debe
        // arrastrar el resultado de una partida anterior.
        if (room.currentGame === null) {
          dispatchTrivia({ type: "reset" });
          dispatchGestos({ type: "reset" });
        }
      });

      socket.on("error", (payload: RoomError) => {
        if (hasJoined) {
          setActionError(payload);
          return;
        }
        setStatus("error");
        setError(payload);
      });

      socket.on("connect_error", () => {
        setStatus("error");
        setError({
          message: "No pudimos conectar con el servidor. Probá de nuevo.",
        });
      });
    },
    [roomCode, status],
  );

  const submitAnswer = useCallback(
    (opcionIndex: number) => {
      socketRef.current?.emit("submit_trivia_answer", {
        code: roomCode.toUpperCase(),
        opcionIndex,
      });
    },
    [roomCode],
  );

  const startGestosTurn = useCallback(() => {
    socketRef.current?.emit("start_gestos_turn", { code: roomCode.toUpperCase() });
  }, [roomCode]);

  const markGestureWord = useCallback(
    (resultado: "adivinada" | "paso") => {
      socketRef.current?.emit("mark_gesture_word", {
        code: roomCode.toUpperCase(),
        resultado,
      });
    },
    [roomCode],
  );

  return {
    status,
    state,
    error,
    actionError,
    playerId,
    trivia,
    gestos,
    join,
    submitAnswer,
    startGestosTurn,
    markGestureWord,
  };
}
