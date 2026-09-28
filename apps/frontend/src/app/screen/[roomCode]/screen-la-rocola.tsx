"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomState } from "@/lib/room-types";
import type { RoomActions, UseRoomStateResult } from "@/hooks/use-room-state";
import type { LaRocolaView } from "@/lib/la-rocola-match";
import { ROCOLA_GENEROS, type RocolaFiltro, type RocolaGenero } from "@/lib/la-rocola-types";
import { GameInstructions } from "@/components/game-instructions";
import { MatchScoreboard } from "@/components/match-scoreboard";
import { MatchWinnerBanner } from "@/components/match-winner-banner";
import { Countdown } from "@/components/countdown";
import { playCorrectSound, playIncorrectSound, playTickSound, playVictorySound } from "@/lib/game-sounds";
import styles from "./screen-la-rocola.module.css";

const ROCOLA_INSTRUCTIONS = [
  "Se juegan 10 canciones.",
  "En cuanto empieza a sonar, el primero en presionar “¡Me la sé!” tiene 30 segundos para escribir el nombre de la canción.",
  "No hace falta tipearlo perfecto — se toleran errores de tipeo.",
  "Si falla, el equipo contrario tiene 5 segundos para robar el punto.",
];

type FiltroModo = "aleatorio" | "genero" | "artista";

// Selector del host, antes de las instrucciones + "Listo" — spec.md →
// "Filtro opcional por género o artista". El artista se elige de una lista
// (nunca texto libre) para no depender de que el host lo escriba igual a
// como está guardado.
function FiltroPicker({
  rocolaArtists,
  onStart,
  actionError,
}: {
  rocolaArtists: string[] | null;
  onStart: (filtro?: RocolaFiltro) => void;
  actionError: { message: string } | null;
}) {
  const [modo, setModo] = useState<FiltroModo>("aleatorio");
  const [genero, setGenero] = useState<RocolaGenero | "">("");
  const [artista, setArtista] = useState("");

  const canStart =
    modo === "aleatorio" ||
    (modo === "genero" && genero !== "") ||
    (modo === "artista" && artista !== "");

  function handleStart() {
    if (!canStart) return;
    if (modo === "genero") onStart({ tipo: "genero", genero: genero as RocolaGenero });
    else if (modo === "artista") onStart({ tipo: "artista", artista });
    else onStart(undefined);
  }

  return (
    <div className={styles.filtroPicker}>
      <GameInstructions title="La Rocola" bullets={ROCOLA_INSTRUCTIONS} />
      {actionError && <p className={styles.actionError}>{actionError.message}</p>}
      <div className={styles.filtroModos}>
        <button
          type="button"
          className={`${styles.filtroModo} ${modo === "aleatorio" ? styles.filtroModoActivo : ""}`}
          onClick={() => setModo("aleatorio")}
        >
          Aleatorio
        </button>
        <button
          type="button"
          className={`${styles.filtroModo} ${modo === "genero" ? styles.filtroModoActivo : ""}`}
          onClick={() => setModo("genero")}
        >
          Por género
        </button>
        <button
          type="button"
          className={`${styles.filtroModo} ${modo === "artista" ? styles.filtroModoActivo : ""}`}
          onClick={() => setModo("artista")}
        >
          Por artista
        </button>
      </div>

      {modo === "genero" && (
        <select
          className={styles.filtroSelect}
          value={genero}
          onChange={(event) => setGenero(event.target.value as RocolaGenero)}
        >
          <option value="">Elegí un género…</option>
          {ROCOLA_GENEROS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      )}

      {modo === "artista" && (
        <select
          className={styles.filtroSelect}
          value={artista}
          onChange={(event) => setArtista(event.target.value)}
          disabled={rocolaArtists === null}
        >
          <option value="">
            {rocolaArtists === null ? "Cargando artistas…" : "Elegí un artista…"}
          </option>
          {(rocolaArtists ?? []).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        className={styles.empezarButton}
        disabled={!canStart}
        onClick={handleStart}
      >
        Empezar
      </button>
    </div>
  );
}

export function ScreenLaRocola({
  state,
  actions,
  laRocola,
  laRocolaAudio,
  rocolaArtists,
  actionError,
}: {
  state: RoomState;
  actions: RoomActions;
  laRocola: LaRocolaView;
  laRocolaAudio: UseRoomStateResult["laRocolaAudio"];
  rocolaArtists: string[] | null;
  actionError: { message: string } | null;
}) {
  const { startLaRocolaGame, getRocolaArtists } = actions;
  const hasFetchedArtistsRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!hasFetchedArtistsRef.current) {
      hasFetchedArtistsRef.current = true;
      getRocolaArtists();
    }
  }, [getRocolaArtists]);

  useEffect(() => {
    if (!laRocolaAudio || !audioRef.current) return;
    const audio = audioRef.current;
    if (laRocolaAudio.action === "play" && laRocolaAudio.previewUrl) {
      audio.src = laRocolaAudio.previewUrl;
      void audio.play();
    } else if (laRocolaAudio.action === "pause") {
      audio.pause();
    } else if (laRocolaAudio.action === "resume") {
      void audio.play();
    }
  }, [laRocolaAudio]);

  const countdownSeconds = laRocola.phase === "countdown" ? laRocola.remainingSeconds : null;
  useEffect(() => {
    if (countdownSeconds === null) return;
    playTickSound();
  }, [countdownSeconds]);

  const lastResultado = laRocola.phase === "revelacion" ? laRocola.resultado : null;
  useEffect(() => {
    if (!lastResultado) return;
    if (lastResultado.teamId !== null) {
      playCorrectSound();
    } else {
      playIncorrectSound();
    }
  }, [lastResultado]);

  useEffect(() => {
    if (laRocola.phase !== "match_result") return;
    playVictorySound();
  }, [laRocola]);

  const marcador = "marcador" in laRocola ? laRocola.marcador : null;

  return (
    <main className={styles.page}>
      <audio ref={audioRef} className={styles.hiddenAudio} />
      {marcador && <MatchScoreboard teams={state.teams} scores={marcador} />}

      {laRocola.phase === "idle" && (
        <FiltroPicker
          rocolaArtists={rocolaArtists}
          onStart={startLaRocolaGame}
          actionError={actionError}
        />
      )}

      {laRocola.phase === "waiting_ready" && (
        <>
          <GameInstructions title="La Rocola" bullets={ROCOLA_INSTRUCTIONS} />
          <p className={styles.hint}>
            Esperando a los jugadores ({laRocola.readyPlayerIds.length}/
            {laRocola.eligiblePlayerIds.length} listos)…
          </p>
        </>
      )}

      {laRocola.phase === "countdown" && (
        <>
          <p className={styles.roundLabel}>
            Ronda {laRocola.roundNumber} de {laRocola.totalRounds}
          </p>
          <Countdown seconds={laRocola.remainingSeconds} />
        </>
      )}

      {laRocola.phase === "sonando" && (
        <>
          <p className={styles.roundLabel}>
            Ronda {laRocola.roundNumber} de {laRocola.totalRounds}
          </p>
          <p className={styles.title}>🎵 Adivina la canción</p>
        </>
      )}

      {(laRocola.phase === "respondiendo" || laRocola.phase === "robo_respondiendo") && (
        <>
          <p className={styles.turnLabel}>
            <strong>{laRocola.buzzedPlayerName}</strong> está escribiendo la respuesta…
          </p>
          <Countdown seconds={laRocola.remainingSeconds} />
        </>
      )}

      {laRocola.phase === "robo" && (
        <>
          <p className={styles.turnLabel}>
            Robo de punto del equipo {laRocola.eligibleTeamNames.join(" / ")}
          </p>
          <Countdown seconds={laRocola.remainingSeconds} />
        </>
      )}

      {laRocola.phase === "revelacion" && (
        <div className={styles.reveal}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={laRocola.resultado.portadaUrl}
            alt=""
            className={styles.cover}
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
          />
          <p className={styles.songTitle}>{laRocola.resultado.titulo}</p>
          <p className={styles.songArtist}>{laRocola.resultado.artista}</p>
          {laRocola.resultado.teamId !== null ? (
            <p className={styles.message}>
              <strong>{laRocola.resultado.playerName}</strong> acertó (+{laRocola.resultado.puntos})
            </p>
          ) : (
            <p className={styles.message}>Nadie acertó</p>
          )}
          {laRocola.resultado.respuesta && (
            <p className={styles.answerEcho}>Escribió: “{laRocola.resultado.respuesta}”</p>
          )}
        </div>
      )}

      {laRocola.phase === "match_result" && (
        <div className={styles.resultPage}>
          <h2 className={styles.title}>Resultado final</h2>
          <MatchWinnerBanner teams={state.teams} scores={laRocola.scores} />
          <ul className={styles.scoreList}>
            {[...laRocola.scores]
              .sort((a, b) => b.score - a.score)
              .map((score) => {
                const team = state.teams.find((t) => t.id === score.teamId);
                if (!team) return null;
                return (
                  <li key={score.teamId} className={styles.scoreRow}>
                    <span className={styles.swatch} style={{ background: team.color }} />
                    <span className={styles.teamName}>{team.name}</span>
                    <span className={styles.teamScore}>{score.score}</span>
                  </li>
                );
              })}
          </ul>
          <ul className={styles.songList}>
            {laRocola.canciones.map((c, index) => (
              <li key={index}>
                {c.titulo} — {c.artista}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
