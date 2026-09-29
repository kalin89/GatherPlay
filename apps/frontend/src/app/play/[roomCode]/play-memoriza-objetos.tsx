"use client";

import { useState, type FormEvent } from "react";
import type { RoomState } from "@/lib/room-types";
import type { MemorizaObjetosView } from "@/lib/memoriza-objetos-match";
import { GameInstructions } from "@/components/game-instructions";
import { ReadyButton } from "@/components/ready-button";
import styles from "./play-memoriza-objetos.module.css";

const MAX_GUESS_LENGTH = 40;

const MEMORIZA_INSTRUCTIONS = [
  "Vas a ver 20 objetos durante 30 segundos.",
  "Después, cada equipo compite por escribirlos a partir de una sola letra.",
  "Un integrante a la vez, un intento por turno.",
  "El reloj de tu equipo corre solo mientras es tu turno.",
];

// Campo de texto + "Enviar"/"Pasar" del jugador en turno. Se monta de nuevo
// (y resetea su guard local de "ya envié") cada vez que cambia la `key` que
// le pasa el padre — basada en `turnNumber`, no en el jugador/equipo activo,
// porque cuando un equipo se queda jugando solo (el otro sin tiempo) el
// mismo jugador repite turno una y otra vez sin que playerId/teamId cambien.
// Mismo criterio de remount por turno que BuzzButton/AnswerForm en
// play-la-rocola.tsx (ahí con `roundNumber`).
function GuessForm({
  puedePasar,
  onSubmit,
  onPass,
}: {
  puedePasar: boolean;
  onSubmit: (texto: string) => void;
  onPass: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [sent, setSent] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (sent || texto.trim().length === 0) return;
    setSent(true);
    onSubmit(texto);
  }

  function handlePass() {
    if (sent || !puedePasar) return;
    setSent(true);
    onPass();
  }

  return (
    <form className={styles.guessForm} onSubmit={handleSubmit}>
      <p className={styles.message}>¿Qué objeto es?</p>
      <input
        type="text"
        className={styles.guessInput}
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        disabled={sent}
        maxLength={MAX_GUESS_LENGTH}
        placeholder="Escribí la palabra…"
        autoFocus
      />
      <button type="submit" className={styles.submitButton} disabled={sent || texto.trim().length === 0}>
        Enviar
      </button>
      <button type="button" className={styles.passButton} disabled={sent || !puedePasar} onClick={handlePass}>
        Pasar
      </button>
    </form>
  );
}

export function PlayMemorizaObjetos({
  state,
  playerId,
  memorizaObjetos,
  markMemorizaReady,
  submitMemorizaGuess,
  passMemorizaTurn,
  actionError,
}: {
  state: RoomState;
  playerId: string | null;
  memorizaObjetos: MemorizaObjetosView;
  markMemorizaReady: () => void;
  submitMemorizaGuess: (texto: string) => void;
  passMemorizaTurn: () => void;
  actionError: { message: string } | null;
}) {
  const actionErrorBanner = actionError && <p className={styles.actionError}>{actionError.message}</p>;
  const myTeamId = state.teams.find((team) => team.playerIds.includes(playerId ?? ""))?.id;

  if (memorizaObjetos.phase === "idle") {
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <GameInstructions title="Memoriza los objetos" bullets={MEMORIZA_INSTRUCTIONS} />
        <p className={styles.message}>Preparando la partida…</p>
      </main>
    );
  }

  if (memorizaObjetos.phase === "waiting_ready") {
    const alreadyReady = playerId !== null && memorizaObjetos.readyPlayerIds.includes(playerId);
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <GameInstructions title="Memoriza los objetos" bullets={MEMORIZA_INSTRUCTIONS} />
        <ReadyButton
          onReady={markMemorizaReady}
          pressed={alreadyReady}
          readyCount={memorizaObjetos.readyPlayerIds.length}
          totalCount={memorizaObjetos.eligiblePlayerIds.length}
        />
      </main>
    );
  }

  if (memorizaObjetos.phase === "pon_atencion" || memorizaObjetos.phase === "memorizando") {
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>Mira la pantalla</p>
      </main>
    );
  }

  if (memorizaObjetos.phase === "adivinando") {
    const { jugadorActivo } = memorizaObjetos;
    if (jugadorActivo && jugadorActivo.playerId === playerId) {
      return (
        <main className={styles.page}>
          {actionErrorBanner}
          <GuessForm
            key={`guess-${memorizaObjetos.turnNumber}`}
            puedePasar={memorizaObjetos.miPuedePasar}
            onSubmit={submitMemorizaGuess}
            onPass={passMemorizaTurn}
          />
        </main>
      );
    }

    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>
          {jugadorActivo ? (
            <>
              Le toca a <strong>{jugadorActivo.playerName}</strong>
            </>
          ) : (
            "Esperando…"
          )}
        </p>
      </main>
    );
  }

  const { scores } = memorizaObjetos;
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
