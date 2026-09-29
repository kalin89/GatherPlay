"use client";

import { useEffect, useRef } from "react";
import type { RoomState } from "@/lib/room-types";
import type { RoomActions } from "@/hooks/use-room-state";
import type { MemorizaObjetosView } from "@/lib/memoriza-objetos-match";
import { GameInstructions } from "@/components/game-instructions";
import { MatchScoreboard } from "@/components/match-scoreboard";
import { MatchWinnerBanner } from "@/components/match-winner-banner";
import { Countdown } from "@/components/countdown";
import { ObjectGrid } from "@/components/object-grid";
import { WordBoard } from "@/components/word-board";
import { TeamClocks } from "@/components/team-clocks";
import { playCorrectSound, playIncorrectSound, playTickSound, playVictorySound } from "@/lib/game-sounds";
import styles from "./screen-memoriza-objetos.module.css";

const MEMORIZA_INSTRUCTIONS = [
  "Vas a ver 20 objetos durante 30 segundos.",
  "Después, cada equipo compite por escribirlos a partir de una sola letra.",
  "Un integrante a la vez, un intento por turno.",
  "El reloj de tu equipo corre solo mientras es tu turno.",
];

const URGENT_CLOCK_SECONDS = 10;

export function ScreenMemorizaObjetos({
  state,
  actions,
  memorizaObjetos,
}: {
  state: RoomState;
  actions: RoomActions;
  memorizaObjetos: MemorizaObjetosView;
}) {
  const { startMemorizaObjetosGame } = actions;
  const hasStartedRef = useRef(false);
  const hasPreloadedRef = useRef(false);

  useEffect(() => {
    if (memorizaObjetos.phase === "idle" && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startMemorizaObjetosGame();
    }
  }, [memorizaObjetos.phase, startMemorizaObjetosGame]);

  useEffect(() => {
    if (memorizaObjetos.phase !== "waiting_ready" || hasPreloadedRef.current) return;
    hasPreloadedRef.current = true;
    for (const item of memorizaObjetos.items) {
      const img = new Image();
      img.src = item.imagenUrl;
    }
  }, [memorizaObjetos]);

  const atencionSeconds = memorizaObjetos.phase === "pon_atencion" ? memorizaObjetos.remainingSeconds : null;
  useEffect(() => {
    if (atencionSeconds === null) return;
    playTickSound();
  }, [atencionSeconds]);

  const ultimoIntento = memorizaObjetos.phase === "adivinando" ? memorizaObjetos.ultimoIntento : null;
  useEffect(() => {
    if (!ultimoIntento) return;
    if (ultimoIntento.acierto) playCorrectSound();
    else playIncorrectSound();
  }, [ultimoIntento]);

  // Mismo tick que "Pon Mucha Atención" y el countdown de La Rocola, para el
  // reloj del equipo activo cuando le quedan 10 segundos o menos — se sigue
  // el mismo criterio: solo el reloj que está corriendo de verdad (el del
  // equipo activo), no uno congelado de un turno anterior.
  const activeClockSeconds =
    memorizaObjetos.phase === "adivinando"
      ? (memorizaObjetos.clocks.find((c) => c.teamId === memorizaObjetos.equipoActivoId)?.remainingSeconds ?? null)
      : null;
  const urgentClockSeconds =
    activeClockSeconds !== null && activeClockSeconds <= URGENT_CLOCK_SECONDS ? activeClockSeconds : null;
  useEffect(() => {
    if (urgentClockSeconds === null) return;
    playTickSound();
  }, [urgentClockSeconds]);

  const jugadorActivo = memorizaObjetos.phase === "adivinando" ? memorizaObjetos.jugadorActivo : null;
  const jugadorActivoTeamColor = jugadorActivo
    ? state.teams.find((t) => t.id === jugadorActivo.teamId)?.color
    : undefined;

  useEffect(() => {
    if (memorizaObjetos.phase !== "match_result") return;
    playVictorySound();
  }, [memorizaObjetos]);

  return (
    <main className={styles.page}>
      {memorizaObjetos.phase === "adivinando" && (
        <MatchScoreboard
          teams={state.teams}
          // Puntaje de ESTA partida (no el acumulado de `team.score`) — se
          // deriva de las palabras ya reveladas, 1 punto por cada una, igual
          // criterio de puntaje que el backend.
          scores={memorizaObjetos.clocks.map((c) => ({
            teamId: c.teamId,
            score: memorizaObjetos.items.filter((i) => i.equipoQueAcerto === c.teamId).length,
          }))}
        />
      )}

      {memorizaObjetos.phase === "match_result" && (
        <MatchScoreboard teams={state.teams} scores={memorizaObjetos.scores} />
      )}

      {(memorizaObjetos.phase === "idle" || memorizaObjetos.phase === "waiting_ready") && (
        <>
          <GameInstructions title="Memoriza los objetos" bullets={MEMORIZA_INSTRUCTIONS} />
          {memorizaObjetos.phase === "waiting_ready" && (
            <p className={styles.hint}>
              Esperando a los jugadores ({memorizaObjetos.readyPlayerIds.length}/
              {memorizaObjetos.eligiblePlayerIds.length} listos)…
            </p>
          )}
        </>
      )}

      {memorizaObjetos.phase === "pon_atencion" && (
        <>
          <p className={styles.attentionTitle}>Pon Mucha Atención</p>
          <Countdown seconds={memorizaObjetos.remainingSeconds} />
        </>
      )}

      {memorizaObjetos.phase === "memorizando" && (
        <>
          <div className={styles.memorizeCountdown}>
            <Countdown seconds={memorizaObjetos.remainingSeconds} />
          </div>
          <ObjectGrid items={memorizaObjetos.items} remainingSeconds={memorizaObjetos.remainingSeconds} />
        </>
      )}

      {memorizaObjetos.phase === "adivinando" && (
        <>
          <TeamClocks
            teams={state.teams}
            clocks={memorizaObjetos.clocks}
            equipoActivoId={memorizaObjetos.equipoActivoId}
          />
          {jugadorActivo && (
            <p className={styles.turnLabel}>
              Turno de{" "}
              <strong className={styles.turnName} style={{ background: jugadorActivoTeamColor }}>
                {jugadorActivo.playerName}
              </strong>
            </p>
          )}
          <WordBoard items={memorizaObjetos.items} teams={state.teams} />
        </>
      )}

      {memorizaObjetos.phase === "match_result" && (
        <>
          <div className={styles.resultBanner}>
            <MatchWinnerBanner teams={state.teams} scores={memorizaObjetos.scores} />
          </div>
          <WordBoard items={memorizaObjetos.items} teams={state.teams} />
        </>
      )}
    </main>
  );
}
