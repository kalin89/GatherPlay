"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { createSocket } from "@/lib/socket";
import type { GameId, RoomState } from "@/lib/room-types";
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
import {
  adivinaPalabraReducer,
  initialAdivinaPalabraMatchView,
  subscribeToAdivinaPalabra,
  type AdivinaPalabraView,
} from "@/lib/adivina-palabra-match";
import {
  initialLaRocolaMatchView,
  laRocolaReducer,
  subscribeToLaRocola,
  type LaRocolaView,
} from "@/lib/la-rocola-match";
import type {
  RocolaArtistsPayload,
  RocolaAudioControlPayload,
  RocolaFiltro,
} from "@/lib/la-rocola-types";

interface RoomError {
  message: string;
}

export interface RoomActions {
  createTeam: (name: string, color: string) => void;
  removeTeam: (teamId: string) => void;
  assignPlayerToTeam: (playerId: string, teamId: string) => void;
  randomizeTeams: () => void;
  selectGame: (gameId: GameId) => void;
  startTriviaGame: () => void;
  startGestosGame: () => void;
  startAdivinaPalabraGame: () => void;
  startLaRocolaGame: (filtro?: RocolaFiltro) => void;
  getRocolaArtists: () => void;
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
  trivia: TriviaMatchView;
  /** Versión "pantalla" — nunca compara contra un playerId propio (la
   * pantalla no es un jugador), así que `gestos_turn_waiting` siempre cae en
   * `waiting_turn`, nunca en `ready_to_start`. */
  gestos: GestosMatchView;
  adivinaPalabra: AdivinaPalabraView;
  laRocola: LaRocolaView;
  /** Comando de audio para el `<audio>` de la pantalla — no es "estado a
   * renderizar" (por eso no vive en `laRocola`), es imperativo: se consume
   * una vez por comando recibido, con `nonce` como dependencia de efecto
   * para no repetirlo en un re-render. Solo la pantalla lo recibe del
   * servidor; en `/play` queda siempre en `null`. */
  laRocolaAudio: (RocolaAudioControlPayload & { nonce: number }) | null;
  /** Nombres de artista del banco de La Rocola, para el selector de filtro
   * del host — `null` mientras no llegó la respuesta de `rocola_get_artists`. */
  rocolaArtists: string[] | null;
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
  const [trivia, dispatchTrivia] = useReducer(triviaReducer, initialTriviaMatchView);
  const [gestos, dispatchGestos] = useReducer(
    (state: GestosMatchView, action: GestosAction) => gestosReducer(state, action, null),
    initialGestosMatchView,
  );
  const [adivinaPalabra, dispatchAdivinaPalabra] = useReducer(
    adivinaPalabraReducer,
    initialAdivinaPalabraMatchView,
  );
  const [laRocola, dispatchLaRocola] = useReducer(laRocolaReducer, initialLaRocolaMatchView);
  const [laRocolaAudio, setLaRocolaAudio] = useState<UseRoomStateResult["laRocolaAudio"]>(null);
  const [rocolaArtists, setRocolaArtists] = useState<string[] | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let hasLoaded = false;
    const socket = createSocket();
    socketRef.current = socket;
    const unsubscribeTrivia = subscribeToTrivia(socket, dispatchTrivia);
    const unsubscribeGestos = subscribeToGestos(socket, dispatchGestos);
    const unsubscribeAdivinaPalabra = subscribeToAdivinaPalabra(socket, dispatchAdivinaPalabra);
    const unsubscribeLaRocola = subscribeToLaRocola(socket, dispatchLaRocola);
    const onRocolaAudio = (payload: RocolaAudioControlPayload) =>
      setLaRocolaAudio({ ...payload, nonce: Math.random() });
    socket.on("rocola_audio_control", onRocolaAudio);
    const onRocolaArtists = (payload: RocolaArtistsPayload) =>
      setRocolaArtists(payload.artistas);
    socket.on("rocola_artists", onRocolaArtists);

    socket.on("connect", () => {
      socket.emit("watch_room", { code: roomCode });
    });

    socket.on("room_state", (room: RoomState) => {
      hasLoaded = true;
      setConnecting(false);
      setError(null);
      setState(room);
      // Sin juego elegido, la vista de cada minijuego no debe arrastrar el
      // resultado de una partida anterior — si no, elegir el mismo juego de
      // nuevo se queda mostrando el resultado viejo en vez de arrancar.
      if (room.currentGame === null) {
        dispatchTrivia({ type: "reset" });
        dispatchGestos({ type: "reset" });
        dispatchAdivinaPalabra({ type: "reset" });
        dispatchLaRocola({ type: "reset" });
        setLaRocolaAudio(null);
      }
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
      unsubscribeTrivia();
      unsubscribeGestos();
      unsubscribeAdivinaPalabra();
      unsubscribeLaRocola();
      socket.off("rocola_audio_control", onRocolaAudio);
      socket.off("rocola_artists", onRocolaArtists);
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

  const selectGame = useCallback(
    (gameId: GameId) => {
      socketRef.current?.emit("select_game", { code: roomCode, gameId });
    },
    [roomCode],
  );

  const startTriviaGame = useCallback(() => {
    socketRef.current?.emit("start_trivia_game", { code: roomCode });
  }, [roomCode]);

  const startGestosGame = useCallback(() => {
    socketRef.current?.emit("start_gestos_game", { code: roomCode });
  }, [roomCode]);

  const startAdivinaPalabraGame = useCallback(() => {
    socketRef.current?.emit("start_adivina_palabra_game", { code: roomCode });
  }, [roomCode]);

  const startLaRocolaGame = useCallback(
    (filtro?: RocolaFiltro) => {
      socketRef.current?.emit("start_la_rocola_game", { code: roomCode, filtro });
    },
    [roomCode],
  );

  const getRocolaArtists = useCallback(() => {
    socketRef.current?.emit("rocola_get_artists", { code: roomCode });
  }, [roomCode]);

  return {
    state,
    error,
    actionError,
    connecting,
    trivia,
    gestos,
    adivinaPalabra,
    laRocola,
    laRocolaAudio,
    rocolaArtists,
    actions: {
      createTeam,
      removeTeam,
      assignPlayerToTeam,
      randomizeTeams,
      selectGame,
      startTriviaGame,
      startGestosGame,
      startAdivinaPalabraGame,
      startLaRocolaGame,
      getRocolaArtists,
    },
  };
}
