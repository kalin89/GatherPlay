"use client";

import { useState } from "react";
import type { RoomState } from "@/lib/room-types";
import type { TriviaMatchView } from "@/lib/trivia-match";
import { TriviaOptions } from "@/components/trivia-options";
import { TriviaCountdown } from "@/components/trivia-countdown";
import styles from "./play-trivia.module.css";

export function PlayTrivia({
  state,
  playerId,
  trivia,
  submitAnswer,
  actionError,
}: {
  state: RoomState;
  playerId: string | null;
  trivia: TriviaMatchView;
  submitAnswer: (opcionIndex: number) => void;
  actionError: { message: string } | null;
}) {
  const [tappedIndex, setTappedIndex] = useState<number | null>(null);
  // Se resetea al salir de `my_turn` ajustando el estado durante el render
  // (patrón recomendado por React para esto, no en un efecto) — mismo
  // criterio que ya usa `screen-lobby.tsx` con `hasCheckedInitialReveal`.
  const [lastPhase, setLastPhase] = useState(trivia.phase);
  if (trivia.phase !== lastPhase) {
    setLastPhase(trivia.phase);
    if (trivia.phase !== "my_turn") {
      setTappedIndex(null);
    }
  }

  function handleSelect(index: number) {
    setTappedIndex(index);
    submitAnswer(index);
  }

  const actionErrorBanner = actionError && (
    <p className={styles.actionError}>{actionError.message}</p>
  );

  if (trivia.phase === "idle") {
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>Esperando a que arranque la partida…</p>
      </main>
    );
  }

  if (trivia.phase === "waiting_turn") {
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>
          Le toca a <strong>{trivia.playerName}</strong>
        </p>
      </main>
    );
  }

  if (trivia.phase === "my_turn") {
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <h2 className={styles.question}>{trivia.pregunta}</h2>
        <TriviaOptions
          opciones={trivia.opciones}
          onSelect={handleSelect}
          selectedIndex={tappedIndex}
        />
        <TriviaCountdown seconds={trivia.remainingSeconds} />
      </main>
    );
  }

  if (trivia.phase === "turn_result") {
    const { resultado } = trivia;
    if (resultado.playerId === playerId) {
      const resultText =
        resultado.opcionElegida === null
          ? "No respondiste a tiempo"
          : resultado.correcta
            ? `¡Correcto! +${resultado.puntos}`
            : "Incorrecto";
      return (
        <main className={styles.page}>
          {actionErrorBanner}
          <p className={styles.resultTitle}>{resultText}</p>
          <TriviaOptions
            opciones={trivia.opciones}
            selectedIndex={resultado.opcionElegida}
            correctIndex={trivia.indiceCorrecto}
          />
        </main>
      );
    }

    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>
          <strong>{resultado.playerName}</strong> {resultado.correcta ? "acertó" : "falló"}
        </p>
      </main>
    );
  }

  const myTeamId = state.teams.find((team) => team.playerIds.includes(playerId ?? ""))?.id;
  const sortedScores = [...trivia.scores].sort((a, b) => b.score - a.score);

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
