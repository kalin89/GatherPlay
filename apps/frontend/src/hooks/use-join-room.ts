"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { createSocket } from "@/lib/socket";
import type { RoomState } from "@/lib/room-types";

interface RoomError {
  message: string;
}

export type JoinRoomStatus = "idle" | "joining" | "joined" | "error";

export interface UseJoinRoomResult {
  status: JoinRoomStatus;
  state: RoomState | null;
  error: RoomError | null;
  /** El `Player.id` propio dentro de `state.players`, o null si no se unió
   * todavía. Se calcula emparejando `player.socketId` con el id del socket
   * propio — necesario porque el servidor no marca "vos sos este" en
   * `room_state`, solo manda la lista completa. */
  playerId: string | null;
  join: (name: string) => void;
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
  const [playerId, setPlayerId] = useState<string | null>(null);
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

      socket.on("connect", () => {
        // El código de sala es solo A-Z0-9 (sin ambiguos); normalizamos acá
        // para que un celular con autocapitalize apagado no falle por esto.
        socket.emit("join_room", {
          code: roomCode.toUpperCase(),
          name: trimmedName,
        });
      });

      socket.on("room_state", (room: RoomState) => {
        setStatus("joined");
        setError(null);
        setState(room);
        const me = room.players.find((p) => p.socketId === socket.id);
        setPlayerId(me?.id ?? null);
      });

      socket.on("error", (payload: RoomError) => {
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

  return { status, state, error, playerId, join };
}
