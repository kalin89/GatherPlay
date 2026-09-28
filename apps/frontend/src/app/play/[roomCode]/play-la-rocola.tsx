"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { RoomState } from "@/lib/room-types";
import type { LaRocolaView } from "@/lib/la-rocola-match";
import { GameInstructions } from "@/components/game-instructions";
import { ReadyButton } from "@/components/ready-button";
import styles from "./play-la-rocola.module.css";

const MAX_ANSWER_LENGTH = 80;

const ROCOLA_INSTRUCTIONS = [
  "Se juegan 10 canciones.",
  "En cuanto empieza a sonar, el primero en presionar “¡Me la sé!” tiene la oportunidad de adivinarla.",
  "Digan la respuesta en voz alta — el grupo decide si es correcta.",
  "Si fallan, el equipo contrario tiene 5 segundos para robar el punto.",
];

// Botón de buzzer con su propio guard local de "ya presioné" — se monta de
// nuevo (y por lo tanto resetea `buzzed`) cada vez que cambia la `key` que
// le pasa el padre (una por ronda y por oportunidad de buzzer: `sonando` y
// `robo` son oportunidades distintas). Evita depender de un efecto que
// llame `setState` para "resetear" el guard entre rondas.
function BuzzButton({
  disabled,
  onBuzz,
}: {
  disabled?: boolean;
  onBuzz: () => void;
}) {
  const [buzzed, setBuzzed] = useState(false);
  return (
    <button
      type="button"
      className={styles.buzzButton}
      disabled={buzzed || disabled}
      onClick={() => {
        setBuzzed(true);
        onBuzz();
      }}
    >
      ¡Me la sé!
    </button>
  );
}

// Campo de texto + 30s para escribir la respuesta — se monta de nuevo (y
// resetea su estado) cada vez que cambia la `key` que le pasa el padre, una
// por ronda y por oportunidad de responder (mismo criterio que BuzzButton).
// Al llegar a 0s envía automáticamente lo que haya escrito hasta ese
// momento, sin esperar un clic en "Enviar" (spec.md: "se evalúa lo que haya
// tecleado hasta ese momento").
function AnswerForm({
  remainingSeconds,
  onSubmit,
}: {
  remainingSeconds: number;
  onSubmit: (texto: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [manuallySubmitted, setManuallySubmitted] = useState(false);
  // Guarda si ya se auto-envió por timeout — un ref, no un estado: evita
  // llamar a `setState` dentro del efecto (la deshabilitación visual ya la
  // cubre `disabled` derivado de `remainingSeconds`, más abajo).
  const hasAutoSubmittedRef = useRef(false);

  useEffect(() => {
    if (remainingSeconds <= 0 && !hasAutoSubmittedRef.current) {
      hasAutoSubmittedRef.current = true;
      onSubmit(texto);
    }
  }, [remainingSeconds, texto, onSubmit]);

  const disabled = manuallySubmitted || remainingSeconds <= 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    setManuallySubmitted(true);
    onSubmit(texto);
  }

  return (
    <form className={styles.answerForm} onSubmit={handleSubmit}>
      <p className={styles.message}>¿Cómo se llama la canción?</p>
      <input
        type="text"
        className={styles.answerInput}
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        disabled={disabled}
        maxLength={MAX_ANSWER_LENGTH}
        placeholder="Escribí el nombre…"
        autoFocus
      />
      <button type="submit" className={styles.submitButton} disabled={disabled}>
        Enviar
      </button>
      <p className={styles.smallCountdown}>{remainingSeconds}s</p>
    </form>
  );
}

export function PlayLaRocola({
  state,
  playerId,
  laRocola,
  markRocolaReady,
  rocolaBuzz,
  submitRocolaAnswer,
  actionError,
}: {
  state: RoomState;
  playerId: string | null;
  laRocola: LaRocolaView;
  markRocolaReady: () => void;
  rocolaBuzz: () => void;
  submitRocolaAnswer: (texto: string) => void;
  actionError: { message: string } | null;
}) {
  const actionErrorBanner = actionError && <p className={styles.actionError}>{actionError.message}</p>;

  const myTeamId = state.teams.find((team) => team.playerIds.includes(playerId ?? ""))?.id;

  if (laRocola.phase === "idle") {
    // El host todavía está eligiendo el filtro (o la partida ni siquiera se
    // creó del lado del backend) — mostrar el botón "Listo" acá sería un
    // error esperando a pasar.
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <GameInstructions title="La Rocola" bullets={ROCOLA_INSTRUCTIONS} />
        <p className={styles.message}>Esperando a que el anfitrión configure la partida…</p>
      </main>
    );
  }

  if (laRocola.phase === "waiting_ready") {
    const alreadyReady = playerId !== null && laRocola.readyPlayerIds.includes(playerId);

    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <GameInstructions title="La Rocola" bullets={ROCOLA_INSTRUCTIONS} />
        <ReadyButton
          onReady={markRocolaReady}
          pressed={alreadyReady}
          readyCount={laRocola.readyPlayerIds.length}
          totalCount={laRocola.eligiblePlayerIds.length}
        />
      </main>
    );
  }

  if (laRocola.phase === "countdown") {
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>Prepárate…</p>
      </main>
    );
  }

  if (laRocola.phase === "sonando") {
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <BuzzButton key={`sonando-${laRocola.roundNumber}`} onBuzz={rocolaBuzz} />
      </main>
    );
  }

  if (laRocola.phase === "respondiendo" || laRocola.phase === "robo_respondiendo") {
    if (laRocola.buzzedPlayerId === playerId) {
      return (
        <main className={styles.page}>
          {actionErrorBanner}
          <AnswerForm
            key={`answer-${laRocola.phase}-${laRocola.roundNumber}`}
            remainingSeconds={laRocola.remainingSeconds}
            onSubmit={submitRocolaAnswer}
          />
        </main>
      );
    }

    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>
          <strong>{laRocola.buzzedPlayerName}</strong> está escribiendo… ({laRocola.remainingSeconds}s)
        </p>
      </main>
    );
  }

  if (laRocola.phase === "robo") {
    const canBuzz = myTeamId !== undefined && laRocola.eligibleTeamIds.includes(myTeamId);
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <BuzzButton
          key={`robo-${laRocola.roundNumber}`}
          disabled={!canBuzz}
          onBuzz={rocolaBuzz}
        />
        {!canBuzz && <p className={styles.hint}>Tu equipo no puede robar esta vez</p>}
      </main>
    );
  }

  if (laRocola.phase === "revelacion") {
    const { resultado } = laRocola;
    if (resultado.teamId === myTeamId && resultado.teamId !== null) {
      return (
        <main className={styles.page}>
          {actionErrorBanner}
          <p className={styles.resultTitle}>¡Acertaste! +{resultado.puntos} punto</p>
          <p className={styles.songReveal}>
            {resultado.titulo} — {resultado.artista}
          </p>
        </main>
      );
    }
    return (
      <main className={styles.page}>
        {actionErrorBanner}
        <p className={styles.message}>
          {resultado.teamId !== null ? (
            <>
              <strong>{resultado.playerName}</strong> acertó
            </>
          ) : (
            "Nadie acertó"
          )}
        </p>
        <p className={styles.songReveal}>
          {resultado.titulo} — {resultado.artista}
        </p>
      </main>
    );
  }

  const { scores } = laRocola;
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
