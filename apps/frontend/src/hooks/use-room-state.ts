"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { createSocket } from "@/lib/socket";
import type { RoomState } from "@/lib/room-types";

interface RoomError {
  message: string;
}

export interface RoomActions {
  createTeam: (name: string, color: string) => void;
  removeTeam: (teamId: string) => void;
  assignPlayerToTeam: (playerId: string, teamId: string) => void;
  randomizeTeams: () => void;
}

export interface UseRoomStateResult {
  state: RoomState | null;
  error: RoomError | null;
  /** Error de una acción de host (ej. `removeTeam` con un id que ya no
   * existe por una raza) recibido DESPUÉS de tener `state` cargado. A
   * diferencia de `error`, no debe reemplazar toda la vista — es
   * informativo, no fatal. */
  actionError: RoomError | null;
  connecting: boolean;
  /** Comandos de host — el mismo socket que se suscribió con `watch_room`
   * se reutiliza para emitirlos, así no hace falta abrir una segunda
   * conexión solo para mandar acciones. */
  actions: RoomActions;
}

// Se suscribe a una sala como espectador (vía `watch_room`, sin registrarse
// como jugador) y refleja `room_state`/`error` tal cual llegan del servidor
// — el cliente no reconstruye ninguna regla de juego (`plan.md`). El mismo
// socket también sirve para que un host mande comandos (`actions`), que no
// lo registran como jugador tampoco.
//
// Nota: si `roomCode` cambia, este hook no reinicia su estado por sí solo
// (evita el anti-patrón de llamar `setState` al inicio del efecto). Quien lo
// use debe montar un componente nuevo por sala, por ejemplo con `key={roomCode}`.
export function useRoomState(roomCode: string): UseRoomStateResult {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<RoomError | null>(null);
  const [actionError, setActionError] = useState<RoomError | null>(null);
  const [connecting, setConnecting] = useState(true);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let hasLoaded = false;
    const socket = createSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("watch_room", { code: roomCode });
    });

    socket.on("room_state", (room: RoomState) => {
      hasLoaded = true;
      setConnecting(false);
      setError(null);
      setState(room);
    });

    socket.on("error", (payload: RoomError) => {
      setConnecting(false);
      if (hasLoaded) {
        setActionError(payload);
      } else {
        setError(payload);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode]);

  const createTeam = useCallback(
    (name: string, color: string) => {
      socketRef.current?.emit("create_team", { code: roomCode, name, color });
    },
    [roomCode],
  );

  const removeTeam = useCallback(
    (teamId: string) => {
      socketRef.current?.emit("remove_team", { code: roomCode, teamId });
    },
    [roomCode],
  );

  const assignPlayerToTeam = useCallback(
    (playerId: string, teamId: string) => {
      socketRef.current?.emit("assign_team", { code: roomCode, playerId, teamId });
    },
    [roomCode],
  );

  const randomizeTeams = useCallback(() => {
    socketRef.current?.emit("randomize_teams", { code: roomCode });
  }, [roomCode]);

  return {
    state,
    error,
    actionError,
    connecting,
    actions: { createTeam, removeTeam, assignPlayerToTeam, randomizeTeams },
  };
}
