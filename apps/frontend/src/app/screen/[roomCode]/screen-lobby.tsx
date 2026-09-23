"use client";

import { useState } from "react";
import { useRoomState } from "@/hooks/use-room-state";
import { buildJoinUrl } from "@/lib/join-url";
import { RoomCode } from "@/components/room-code";
import { JoinQr } from "@/components/join-qr";
import { TeamManager } from "./team-manager";
import styles from "./screen-lobby.module.css";

export function ScreenLobby({ roomCode }: { roomCode: string }) {
  const { state, error, actionError, connecting, actions } = useRoomState(roomCode);
  const [hasCheckedInitialReveal, setHasCheckedInitialReveal] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Si la pantalla se recarga (F5) y la sala ya tenía equipos, se asume que
  // ya se había revelado antes — no tiene sentido pedirle al host que
  // vuelva a hacer click a mitad de la partida. Se ajusta durante el
  // render (patrón recomendado por React para esto, no en un efecto) y
  // solo una vez, apenas llega el primer `state`.
  if (state && !hasCheckedInitialReveal) {
    setHasCheckedInitialReveal(true);
    if (state.teams.length > 0) {
      setRevealed(true);
    }
  }

  if (error) {
    return (
      <main className={styles.page}>
        <p className={styles.message}>
          No encontramos la sala <strong>{roomCode}</strong>. Verificá el
          código o creá una sala nueva.
        </p>
      </main>
    );
  }

  if (connecting || !state) {
    return (
      <main className={styles.page}>
        <p className={styles.message}>Conectando con la sala…</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {actionError && <p className={styles.actionError}>{actionError.message}</p>}

      {revealed ? (
        <section className={styles.invite}>
          <RoomCode code={state.code} />
          <JoinQr url={buildJoinUrl(state.code)} />
        </section>
      ) : (
        <button
          type="button"
          className={styles.revealButton}
          disabled={state.teams.length === 0}
          onClick={() => setRevealed(true)}
        >
          Mostrar código a los jugadores
        </button>
      )}

      <TeamManager state={state} actions={actions} />
    </main>
  );
}
