"use client";

import type { RoomState } from "@/lib/room-types";
import type { GestosMatchView } from "@/lib/gestos-match";
import styles from "./play-gestos.module.css";

export function PlayGestos({
  state,
  playerId,
  gestos,
  startGestosTurn,
  markGestureWord,
  actionError,
}: {
  state: RoomState;
  playerId: string | null;
  gestos: GestosMatchView;
  startGestosTurn: () => void;
  markGestureWord: (resultado: "adivinada" | "paso") => void;
  actionError: { message: string } | null;
}) {
  const actionErrorBanner = actionError && (
    <p className={styles.actionError}>{actionError.message}</p>
  );

  if (gestos.phase === "idle") {
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>Esperando a que arranque la partida…</p>
      </main>
    );
  }

  if (gestos.phase === "waiting_turn") {
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>
          Le toca a <strong>{gestos.playerName}</strong>
        </p>
      </main>
    );
  }

  if (gestos.phase === "ready_to_start") {
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>¡Te toca!</p>
        <button type="button" className={styles.startButton} onClick={startGestosTurn}>
          Iniciar
        </button>
      </main>
    );
  }

  if (gestos.phase === "acting") {
    // Nunca debería darse en el celular del actor — nunca recibe la palabra
    // (ver "Privacidad" en caras-y-gestos-module/analysis.md). Se cubre
    // igual por completitud del tipo compartido con la pantalla.
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>Mirá la pantalla…</p>
      </main>
    );
  }

  if (gestos.phase === "my_turn_active") {
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <div className={styles.actionButtons}>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.guessedButton}`}
            onClick={() => markGestureWord("adivinada")}
          >
            Adivinada
          </button>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.passButton}`}
            onClick={() => markGestureWord("paso")}
          >
            Paso
          </button>
        </div>
      </main>
    );
  }

  if (gestos.phase === "turn_result") {
    const { resultado } = gestos;
    if (resultado.playerId === playerId) {
      return (
        <main className={styles.page}>
          {actionErrorBanner}
          <p className={styles.resultTitle}>
            Ganaste {resultado.puntos} {resultado.puntos === 1 ? "punto" : "puntos"}
          </p>
          {resultado.palabrasAdivinadas.length > 0 && (
            <ul className={styles.wordList}>
              {resultado.palabrasAdivinadas.map((palabra, index) => (
                <li key={`${index}-${palabra}`}>{palabra}</li>
              ))}
            </ul>
          )}
        </main>
      );
    }

    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>
          <strong>{resultado.playerName}</strong> adivinó{" "}
          {resultado.palabrasAdivinadas.length === 1
            ? "1 palabra"
            : `${resultado.palabrasAdivinadas.length} palabras`}
        </p>
      </main>
    );
  }

  const { scores, palabrasPorEquipo } = gestos;
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
              <div className={styles.scoreHeader}>
                <span className={styles.swatch} style={{ background: team.color }} />
                <span className={styles.teamName}>{team.name}</span>
                <span className={styles.teamScore}>{score.score}</span>
              </div>
              {team.id === myTeamId && (
                <ul className={styles.wordList}>
                  {(palabrasPorEquipo[team.id] ?? []).map((palabra, index) => (
                    <li key={`${index}-${palabra}`}>{palabra}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
