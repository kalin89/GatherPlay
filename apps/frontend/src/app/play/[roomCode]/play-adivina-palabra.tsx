"use client";

import type { RoomState } from "@/lib/room-types";
import type { AdivinaPalabraView } from "@/lib/adivina-palabra-match";
import styles from "./play-adivina-palabra.module.css";

export function PlayAdivinaPalabra({
  state,
  playerId,
  adivinaPalabra,
  markAdivinaReady,
  markAdivinaGuess,
  markAdivinaPass,
  actionError,
}: {
  state: RoomState;
  playerId: string | null;
  adivinaPalabra: AdivinaPalabraView;
  markAdivinaReady: () => void;
  markAdivinaGuess: () => void;
  markAdivinaPass: () => void;
  actionError: { message: string } | null;
}) {
  const actionErrorBanner = actionError && (
    <p className={styles.actionError}>{actionError.message}</p>
  );

  if (adivinaPalabra.phase === "idle") {
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>Esperando a que arranque la partida…</p>
      </main>
    );
  }

  if (adivinaPalabra.phase === "waiting_ready") {
    const team = state.teams.find((t) => t.id === adivinaPalabra.teamId);
    if (adivinaPalabra.playerId === playerId) {
      return (
        <main className={styles.page}>
          {actionErrorBanner}
          <p className={styles.message}>¡Te toca! Date la espalda a la pantalla.</p>
          <button type="button" className={styles.readyButton} onClick={markAdivinaReady}>
            Listo
          </button>
        </main>
      );
    }

    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>
          Es el turno de <strong>{team?.name ?? "otro equipo"}</strong> — le toca a{" "}
          <strong>{adivinaPalabra.playerName}</strong>
        </p>
      </main>
    );
  }

  if (adivinaPalabra.phase === "active_player") {
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <div className={styles.actionButtons}>
          <button type="button" className={`${styles.actionButton} ${styles.guessedButton}`} onClick={markAdivinaGuess}>
            Adivinada
          </button>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.passButton}`}
            onClick={markAdivinaPass}
            disabled={adivinaPalabra.pasesRestantes === 0}
          >
            Paso
          </button>
        </div>
        <p className={styles.smallCountdown}>{adivinaPalabra.remainingSeconds}s</p>
      </main>
    );
  }

  if (adivinaPalabra.phase === "active_screen") {
    // Nunca debería darse en el celular del Adivinador — el backend nunca le
    // manda la palabra a este socket (ver "Privacidad" en
    // adivina-palabra-module/analysis.md). Se cubre por completitud del tipo
    // compartido con la pantalla.
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>Mirá la pantalla…</p>
      </main>
    );
  }

  if (adivinaPalabra.phase === "turn_result") {
    const { resultado, siguiente } = adivinaPalabra;
    const resultSummary =
      resultado.playerId === playerId ? (
        <p className={styles.resultTitle}>
          Ganaste {resultado.puntos} {resultado.puntos === 1 ? "punto" : "puntos"}
        </p>
      ) : (
        <p className={styles.message}>
          <strong>{resultado.playerName}</strong> adivinó{" "}
          {resultado.puntos === 1 ? "1 palabra" : `${resultado.puntos} palabras`}
        </p>
      );

    // El próximo turno ya llegó (`siguiente`, adosado al turn_result — ver
    // adivina-palabra-ui/analysis.md): si me toca a mí, muestro el botón
    // "Listo" acá mismo en vez de esperar una fase `waiting_ready` a la que
    // el reducer nunca vuelve.
    if (siguiente?.playerId === playerId) {
      return (
        <main className={styles.page}>
          {actionErrorBanner}
          {resultSummary}
          <p className={styles.message}>¡Te toca! Date la espalda a la pantalla.</p>
          <button type="button" className={styles.readyButton} onClick={markAdivinaReady}>
            Listo
          </button>
        </main>
      );
    }

    if (siguiente) {
      const nextTeam = state.teams.find((t) => t.id === siguiente.teamId);
      return (
        <main className={styles.page}>
          {actionErrorBanner}
          {resultSummary}
          <p className={styles.message}>
            Le toca a <strong>{nextTeam?.name ?? "otro equipo"}</strong> —{" "}
            <strong>{siguiente.playerName}</strong>
          </p>
        </main>
      );
    }

    return (
      <main className={styles.page}>
        {actionErrorBanner}
        {resultSummary}
      </main>
    );
  }

  const { scores } = adivinaPalabra;
  const myTeamId = state.teams.find((team) => team.playerIds.includes(playerId ?? ""))?.id;
  const sortedScores = [...scores].sort((a, b) => b.score - a.score);

  return (
    <main className={styles.page}>
      {actionErrorBanner}
      <p className={styles.resultTitle}>Resultado final</p>
      <ul className={styles.scoreList}>
        {sortedScores.map((score) => {
          const team = state.teams.find((t) => t.id === score.teamId);
          if (!team) return null;
          return (
            <li
              key={score.teamId}
              className={`${styles.scoreRow} ${team.id === myTeamId ? styles.myTeam : ""}`}
            >
              <span className={styles.swatch} style={{ background: team.color }} />
              <span className={styles.teamName}>{team.name}</span>
              <span className={styles.teamScore}>{score.score}</span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
