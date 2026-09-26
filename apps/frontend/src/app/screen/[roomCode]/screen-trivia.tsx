"use client";

import { useEffect, useRef } from "react";
import type { RoomState } from "@/lib/room-types";
import type { RoomActions } from "@/hooks/use-room-state";
import type { TriviaMatchView } from "@/lib/trivia-match";
import { TriviaOptions } from "@/components/trivia-options";
import { TriviaCountdown } from "@/components/trivia-countdown";
import { playCorrectSound, playIncorrectSound } from "@/lib/trivia-sounds";
import styles from "./screen-trivia.module.css";

export function ScreenTrivia({
  state,
  actions,
  trivia,
}: {
  state: RoomState;
  actions: RoomActions;
  trivia: TriviaMatchView;
}) {
  const { startTriviaGame } = actions;
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (trivia.phase === "idle" && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startTriviaGame();
    }
  }, [trivia.phase, startTriviaGame]);

  // El sonido se dispara una vez por resultado: `trivia` es un objeto nuevo
  // en cada dispatch del reducer, así que este efecto corre exactamente una
  // vez por `trivia_turn_result` recibido, sin necesidad de trackear a mano
  // un id de turno.
  useEffect(() => {
    if (trivia.phase !== "turn_result") return;
    if (trivia.resultado.correcta) {
      playCorrectSound();
    } else {
      playIncorrectSound();
    }
  }, [trivia]);

  if (trivia.phase === "idle") {
    return (
      <main className={styles.page}>
        <p className={styles.message}>Arrancando Trivia…</p>
      </main>
    );
  }

  if (trivia.phase === "waiting_turn") {
    return (
      <main className={styles.page}>
        <p className={styles.message}>
          Le toca a <strong>{trivia.playerName}</strong>…
        </p>
      </main>
    );
  }

  if (trivia.phase === "my_turn") {
    return (
      <main className={styles.page}>
        <p className={styles.turnLabel}>
          Le toca a <strong>{trivia.playerName}</strong>
        </p>
        <h2 className={styles.question}>{trivia.pregunta}</h2>
        <TriviaOptions opciones={trivia.opciones} />
        <TriviaCountdown seconds={trivia.remainingSeconds} />
      </main>
    );
  }

  if (trivia.phase === "turn_result") {
    const { resultado } = trivia;
    return (
      <main className={styles.page}>
        <div
          className={`${styles.resultBadge} ${
            resultado.correcta ? styles.resultCorrect : styles.resultIncorrect
          }`}
        >
          {resultado.correcta ? "✓" : "✗"}
        </div>
        <h2 className={styles.question}>{trivia.pregunta}</h2>
        <TriviaOptions
          opciones={trivia.opciones}
          selectedIndex={resultado.opcionElegida}
          correctIndex={trivia.indiceCorrecto}
        />
      </main>
    );
  }

  const sortedScores = [...trivia.scores].sort((a, b) => b.score - a.score);

  return (
    <main className={styles.page}>
      <h2 className={styles.title}>Resultado final</h2>
      <ul className={styles.scoreList}>
        {sortedScores.map((score, index) => {
          const team = state.teams.find((t) => t.id === score.teamId);
          if (!team) return null;
          return (
            <li
              key={score.teamId}
              className={`${styles.scoreRow} ${index === 0 ? styles.winner : ""}`}
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
