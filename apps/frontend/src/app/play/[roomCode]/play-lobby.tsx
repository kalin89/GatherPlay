"use client";

import { useState, type FormEvent } from "react";
import { useJoinRoom } from "@/hooks/use-join-room";
import { splitPlayersByTeam } from "@/lib/room-selectors";
import { TeamBoard } from "@/components/team-board";
import styles from "./play-lobby.module.css";

const MAX_NAME_LENGTH = 20;

export function PlayLobby({ roomCode }: { roomCode: string }) {
  const { status, state, error, playerId, join } = useJoinRoom(roomCode);
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
    const { teams } = splitPlayersByTeam(state);
    const myTeam = teams.find((t) => t.players.some((p) => p.id === playerId));

    return (
      <main className={styles.page}>
        <p className={styles.greeting}>
          ¡Listo, <strong>{trimmedName}</strong>!
        </p>
        {myTeam ? (
          <TeamBoard team={myTeam.team} players={myTeam.players} />
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
