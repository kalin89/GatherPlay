"use client";

import { useEffect, useRef } from "react";
import type { RoomState } from "@/lib/room-types";
import type { RoomActions } from "@/hooks/use-room-state";
import type { AdivinaPalabraView } from "@/lib/adivina-palabra-match";
import { AdivinaPalabraWord } from "@/components/adivina-palabra-word";
import { Countdown } from "@/components/countdown";
import { playCorrectSound, playIncorrectSound, playVictorySound } from "@/lib/game-sounds";
import styles from "./screen-adivina-palabra.module.css";

function Marcador({
  marcador,
  teams,
}: {
  marcador: { teamId: string; score: number }[];
  teams: RoomState["teams"];
}) {
  return (
    <div className={styles.marcador}>
      {marcador.map((entry) => {
        const team = teams.find((t) => t.id === entry.teamId);
        if (!team) return null;
        return (
          <span key={entry.teamId} className={styles.marcadorChip}>
            <span className={styles.swatch} style={{ background: team.color }} />
            {team.name}: {entry.score}
          </span>
        );
      })}
    </div>
  );
}

export function ScreenAdivinaPalabra({
  state,
  actions,
  adivinaPalabra,
}: {
  state: RoomState;
  actions: RoomActions;
  adivinaPalabra: AdivinaPalabraView;
}) {
  const { startAdivinaPalabraGame } = actions;
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (adivinaPalabra.phase === "idle" && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startAdivinaPalabraGame();
    }
  }, [adivinaPalabra.phase, startAdivinaPalabraGame]);

  const lastAccion = adivinaPalabra.phase === "active_screen" ? adivinaPalabra.lastAccion : null;
  useEffect(() => {
    if (!lastAccion) return;
    if (lastAccion.tipo === "adivinada") {
      playCorrectSound();
    } else {
      playIncorrectSound();
    }
  }, [lastAccion]);

  // Mismo criterio que ScreenTrivia/ScreenGestos: `adivinaPalabra` es un
  // objeto nuevo por cada dispatch, así que este efecto corre exactamente una
  // vez por `adivina_match_result` recibido.
  useEffect(() => {
    if (adivinaPalabra.phase !== "match_result") return;
    playVictorySound();
  }, [adivinaPalabra]);

  if (adivinaPalabra.phase === "idle") {
    return (
      <main className={styles.page}>
        <p className={styles.message}>Arrancando Adivina la palabra…</p>
      </main>
    );
  }

  if (adivinaPalabra.phase === "waiting_ready") {
    const team = state.teams.find((t) => t.id === adivinaPalabra.teamId);
    return (
      <main className={styles.page}>
        <p className={styles.message}>
          Le toca a <strong>{adivinaPalabra.playerName}</strong>
          {team ? <> ({team.name})</> : null}
        </p>
        <p className={styles.hint}>Esperando que presione Listo…</p>
        <Marcador marcador={adivinaPalabra.marcador} teams={state.teams} />
      </main>
    );
  }

  if (adivinaPalabra.phase === "active_screen") {
    return (
      <main className={styles.page}>
        <p className={styles.turnLabel}>
          Adivina <strong>{adivinaPalabra.playerName}</strong>
        </p>
        <AdivinaPalabraWord palabra={adivinaPalabra.palabra} />
        <Countdown seconds={adivinaPalabra.remainingSeconds} />
        <Marcador marcador={adivinaPalabra.marcador} teams={state.teams} />
      </main>
    );
  }

  if (adivinaPalabra.phase === "active_player") {
    // Nunca debería darse en la pantalla (nunca recibe adivina_jugador_estado
    // — ver "Privacidad" en adivina-palabra-module/analysis.md). Se cubre por
    // completitud del tipo compartido con el jugador.
    return (
      <main className={styles.page}>
        <p className={styles.message}>Un momento…</p>
      </main>
    );
  }

  if (adivinaPalabra.phase === "turn_result") {
    const { resultado, siguiente } = adivinaPalabra;
    return (
      <main className={styles.page}>
        <p className={styles.turnLabel}>
          <strong>{resultado.playerName}</strong> ganó {resultado.puntos}{" "}
          {resultado.puntos === 1 ? "punto" : "puntos"}
        </p>
        {resultado.adivinadas.length > 0 && (
          <ul className={styles.wordList}>
            {resultado.adivinadas.map((palabra, index) => (
              <li key={`ok-${index}-${palabra}`} className={styles.correct}>
                {palabra}
              </li>
            ))}
            {resultado.pasadas.map((palabra, index) => (
              <li key={`no-${index}-${palabra}`} className={styles.incorrect}>
                {palabra}
              </li>
            ))}
          </ul>
        )}
        {siguiente ? (
          <p className={styles.message}>
            Siguiente Jugador <strong>{siguiente.playerName}</strong>
          </p>
        ) : (
          <p className={styles.hint}>Esperando al siguiente Adivinador…</p>
        )}
      </main>
    );
  }

  const { scores, palabrasPorEquipo } = adivinaPalabra;
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
          const palabras = palabrasPorEquipo.find((p) => p.teamId === team.id)?.palabras ?? [];
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
                {palabras.map((palabra, index) => (
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
