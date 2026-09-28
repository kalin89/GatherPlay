"use client";

import { useEffect, useRef } from "react";
import type { RoomState } from "@/lib/room-types";
import type { RoomActions } from "@/hooks/use-room-state";
import type { GestosMatchView } from "@/lib/gestos-match";
import { Countdown } from "@/components/countdown";
import { playCorrectSound, playPassSound, playVictorySound } from "@/lib/game-sounds";
import styles from "./screen-gestos.module.css";

export function ScreenGestos({
  state,
  actions,
  gestos,
}: {
  state: RoomState;
  actions: RoomActions;
  gestos: GestosMatchView;
}) {
  const { startGestosGame } = actions;
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (gestos.phase === "idle" && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startGestosGame();
    }
  }, [gestos.phase, startGestosGame]);

  // `lastWordEvent` es un objeto nuevo por cada `gestos_word_update` (nunca
  // por un tick del temporizador) — ver gestos-match.ts. Así este efecto
  // suena una vez por palabra marcada, aunque el motivo se repita.
  const lastWordEvent = gestos.phase === "acting" ? gestos.lastWordEvent : null;
  useEffect(() => {
    if (!lastWordEvent) return;
    if (lastWordEvent.motivo === "adivinada") {
      playCorrectSound();
    } else {
      playPassSound();
    }
  }, [lastWordEvent]);

  // Mismo criterio que ScreenTrivia con el sonido de acierto/error: `gestos`
  // es un objeto nuevo por cada dispatch, así que este efecto corre
  // exactamente una vez por `gestos_match_result` recibido.
  useEffect(() => {
    if (gestos.phase !== "match_result") return;
    playVictorySound();
  }, [gestos]);

  if (gestos.phase === "idle") {
    return (
      <main className={styles.page}>
        <p className={styles.message}>Arrancando Caras y Gestos…</p>
      </main>
    );
  }

  if (gestos.phase === "waiting_turn") {
    return (
      <main className={styles.page}>
        <p className={styles.message}>
          Le toca a <strong>{gestos.playerName}</strong>
        </p>
        <p className={styles.hint}>
          Que se pare frente a la pantalla y presione Iniciar en su celular.
        </p>
      </main>
    );
  }

  if (gestos.phase === "ready_to_start" || gestos.phase === "my_turn_active") {
    // Nunca debería darse en la pantalla (nunca recibe gestos_actor_ready ni
    // resuelve gestos_turn_waiting contra un playerId propio — ver
    // "Privacidad" en caras-y-gestos-module/analysis.md). Se cubre igual por
    // completitud del tipo compartido con el jugador.
    return (
      <main className={styles.page}>
        <p className={styles.message}>Un momento…</p>
      </main>
    );
  }

  if (gestos.phase === "acting") {
    const adivinadas = gestos.totalPalabras - gestos.palabrasRestantes;
    return (
      <main className={styles.page}>
        <p className={styles.progress}>
          {adivinadas}/{gestos.totalPalabras} adivinadas
        </p>
        <h2 className={styles.word}>{gestos.palabra}</h2>
        <Countdown seconds={gestos.remainingSeconds} />
      </main>
    );
  }

  if (gestos.phase === "turn_result") {
    const { resultado } = gestos;
    return (
      <main className={styles.page}>
        <p className={styles.turnLabel}>
          <strong>{resultado.playerName}</strong> ganó {resultado.puntos}{" "}
          {resultado.puntos === 1 ? "punto" : "puntos"}
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

  const { scores, palabrasPorEquipo } = gestos;
  const sortedScores = [...scores].sort((a, b) => b.score - a.score);
  const topScore = sortedScores[0]?.score ?? 0;

  return (
    <main className={styles.page}>
      <h2 className={styles.title}>Resultado final</h2>
      <ul className={styles.scoreList}>
        {sortedScores.map((score) => {
          const team = state.teams.find((t) => t.id === score.teamId);
          if (!team) return null;
          const isWinner = score.score === topScore;
          return (
            <li
              key={score.teamId}
              className={`${styles.scoreRow} ${isWinner ? styles.winner : ""}`}
            >
              <div className={styles.scoreHeader}>
                <span className={styles.swatch} style={{ background: team.color }} />
                <span className={styles.teamName}>{team.name}</span>
                <span className={styles.teamScore}>{score.score}</span>
              </div>
              <ul className={styles.wordList}>
                {(palabrasPorEquipo[team.id] ?? []).map((palabra, index) => (
                  <li key={`${index}-${palabra}`}>{palabra}</li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
