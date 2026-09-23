"use client";

import { useEffect, useState } from "react";
import { createSocket } from "@/lib/socket";
import type { RoomState } from "@/lib/room-types";

interface RoomError {
  message: string;
}

export interface UseRoomStateResult {
  state: RoomState | null;
  error: RoomError | null;
  connecting: boolean;
}

// Se suscribe a una sala como espectador (vía `watch_room`, sin registrarse
// como jugador) y refleja `room_state`/`error` tal cual llegan del servidor
// — el cliente no reconstruye ninguna regla de juego (`plan.md`).
//
// Nota: si `roomCode` cambia, este hook no reinicia su estado por sí solo
// (evita el anti-patrón de llamar `setState` al inicio del efecto). Quien lo
// use debe montar un componente nuevo por sala, por ejemplo con `key={roomCode}`.
export function useRoomState(roomCode: string): UseRoomStateResult {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<RoomError | null>(null);
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    const socket = createSocket();

    socket.on("connect", () => {
      socket.emit("watch_room", { code: roomCode });
    });

    socket.on("room_state", (room: RoomState) => {
      setConnecting(false);
      setError(null);
      setState(room);
    });

    socket.on("error", (payload: RoomError) => {
      setConnecting(false);
      setError(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomCode]);

  return { state, error, connecting };
}
