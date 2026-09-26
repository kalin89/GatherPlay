"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useJoinRoom } from "@/hooks/use-join-room";
import { splitPlayersByTeam } from "@/lib/room-selectors";
import { getGameLabel } from "@/lib/game-catalog";
import type { GameId, RoomState } from "@/lib/room-types";
import type { TriviaMatchView } from "@/lib/trivia-match";
import { TeamBoard } from "@/components/team-board";
import { PlayTrivia } from "./play-trivia";
import styles from "./play-lobby.module.css";

const MAX_NAME_LENGTH = 20;

// Mismo criterio que `renderGameScreen` en screen-lobby.tsx: único lugar que
// sabe qué juegos tienen de verdad un control propio implementado.
function renderGameControl(
  gameId: GameId,
  state: RoomState,
  playerId: string | null,
  trivia: TriviaMatchView,
  submitAnswer: (opcionIndex: number) => void,
  actionError: { message: string } | null,
): ReactNode {
  switch (gameId) {
    case "trivia":
      return (
        <PlayTrivia
          state={state}
          playerId={playerId}
          trivia={trivia}
          submitAnswer={submitAnswer}
          actionError={actionError}
        />
      );
    default:
      return (
        <main className={styles.page}>
          <p className={styles.message}>Preparando {getGameLabel(gameId)}…</p>
        </main>
      );
  }
}

export function PlayLobby({ roomCode }: { roomCode: string }) {
  const { status, state, error, actionError, playerId, trivia, join, submitAnswer } =
    useJoinRoom(roomCode);
  const [name, setName] = useState("");

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && status !== "joining";

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    join(name);
  }

  if (status === "error" && error) {
    return (
      <main className={styles.page}>
        <p className={styles.message}>{error.message}</p>
      </main>
    );
  }

  if (status === "joined" && state) {
    if (state.currentGame !== null) {
      return renderGameControl(
        state.currentGame,
        state,
        playerId,
        trivia,
        submitAnswer,
        actionError,
      );
    }

    const { teams } = splitPlayersByTeam(state);
    const myTeam = teams.find((t) => t.players.some((p) => p.id === playerId));

    return (
      <main className={styles.page}>
        <p className={styles.greeting}>
          ¡Listo, <strong>{trimmedName}</strong>!
        </p>
        {myTeam ? (
          <>
            <TeamBoard team={myTeam.team} players={myTeam.players} />
            <p className={styles.message}>
              Esperando a que el anfitrión elija el juego…
            </p>
          </>
        ) : (
          <p className={styles.message}>
            Esperando a que el anfitrión arme los equipos…
          </p>
        )}
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Unirme a la sala {roomCode}</h1>
      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          type="text"
          className={styles.input}
          placeholder="Tu nombre"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(event) => setName(event.target.value)}
          disabled={status === "joining"}
          autoFocus
        />
        <button type="submit" className={styles.submit} disabled={!canSubmit}>
          {status === "joining" ? "Uniéndome…" : "Unirme"}
        </button>
      </form>
    </main>
  );
}
