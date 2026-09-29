"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRoomState, type RoomActions, type UseRoomStateResult } from "@/hooks/use-room-state";
import { buildJoinUrl } from "@/lib/join-url";
import { getGameLabel } from "@/lib/game-catalog";
import { startBackgroundMusic, stopBackgroundMusic } from "@/lib/game-sounds";
import type { GameId, RoomState } from "@/lib/room-types";
import type { TriviaMatchView } from "@/lib/trivia-match";
import type { GestosMatchView } from "@/lib/gestos-match";
import type { AdivinaPalabraView } from "@/lib/adivina-palabra-match";
import type { LaRocolaView } from "@/lib/la-rocola-match";
import type { MemorizaObjetosView } from "@/lib/memoriza-objetos-match";
import { RoomCode } from "@/components/room-code";
import { JoinQr } from "@/components/join-qr";
import { TeamManager } from "./team-manager";
import { StartMatchButton } from "./start-match-button";
import { GameSelectionPanel } from "./game-selection-panel";
import { ScreenTrivia } from "./screen-trivia";
import { ScreenGestos } from "./screen-gestos";
import { ScreenAdivinaPalabra } from "./screen-adivina-palabra";
import { ScreenLaRocola } from "./screen-la-rocola";
import { ScreenMemorizaObjetos } from "./screen-memoriza-objetos";
import styles from "./screen-lobby.module.css";

// Único lugar que conoce qué juegos tienen de verdad una pantalla propia
// implementada (a diferencia de GAME_CATALOG, que puede listar juegos
// "próximamente" sin componente todavía).
function renderGameScreen(
  gameId: GameId,
  state: RoomState,
  actions: RoomActions,
  trivia: TriviaMatchView,
  gestos: GestosMatchView,
  adivinaPalabra: AdivinaPalabraView,
  laRocola: LaRocolaView,
  laRocolaAudio: UseRoomStateResult["laRocolaAudio"],
  rocolaArtists: string[] | null,
  actionError: { message: string } | null,
  memorizaObjetos: MemorizaObjetosView,
): ReactNode {
  switch (gameId) {
    case "trivia":
      return <ScreenTrivia state={state} actions={actions} trivia={trivia} />;
    case "caras-y-gestos":
      return <ScreenGestos state={state} actions={actions} gestos={gestos} />;
    case "adivina-palabra":
      return <ScreenAdivinaPalabra state={state} actions={actions} adivinaPalabra={adivinaPalabra} />;
    case "la-rocola":
      return (
        <ScreenLaRocola
          state={state}
          actions={actions}
          laRocola={laRocola}
          laRocolaAudio={laRocolaAudio}
          rocolaArtists={rocolaArtists}
          actionError={actionError}
        />
      );
    case "memoriza-objetos":
      return (
        <ScreenMemorizaObjetos state={state} actions={actions} memorizaObjetos={memorizaObjetos} />
      );
    default:
      return (
        <main className={styles.page}>
          <p className={styles.message}>Preparando {getGameLabel(gameId)}…</p>
        </main>
      );
  }
}

export function ScreenLobby({ roomCode }: { roomCode: string }) {
  const {
    state,
    error,
    actionError,
    connecting,
    actions,
    trivia,
    gestos,
    adivinaPalabra,
    laRocola,
    laRocolaAudio,
    rocolaArtists,
    memorizaObjetos,
  } = useRoomState(roomCode);
  const [hasCheckedInitialReveal, setHasCheckedInitialReveal] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [showGamePanel, setShowGamePanel] = useState(false);

  // Si la pantalla se recarga (F5) y la sala ya tenía equipos, se asume que
  // ya se había revelado antes — no tiene sentido pedirle al host que
  // vuelva a hacer click a mitad de la partida. Se ajusta durante el
  // render (patrón recomendado por React para esto, no en un efecto) y
  // solo una vez, apenas llega el primer `state`.
  if (state && !hasCheckedInitialReveal) {
    setHasCheckedInitialReveal(true);
    if (state.teams.length > 0) {
      setRevealed(true);
    }
  }

  const currentGame = state?.currentGame ?? null;
  useEffect(() => {
    // Música de fondo mientras se juega — salvo en La Rocola, donde hay que
    // escuchar la canción que se está adivinando.
    if (currentGame !== null && currentGame !== "la-rocola") {
      startBackgroundMusic();
    } else {
      stopBackgroundMusic();
    }
    return () => stopBackgroundMusic();
  }, [currentGame]);

  if (error) {
    return (
      <main className={styles.page}>
        <p className={styles.message}>
          No encontramos la sala <strong>{roomCode}</strong>. Verificá el
          código o creá una sala nueva.
        </p>
      </main>
    );
  }

  if (connecting || !state) {
    return (
      <main className={styles.page}>
        <p className={styles.message}>Conectando con la sala…</p>
      </main>
    );
  }

  if (state.currentGame !== null) {
    return renderGameScreen(
      state.currentGame,
      state,
      actions,
      trivia,
      gestos,
      adivinaPalabra,
      laRocola,
      laRocolaAudio,
      rocolaArtists,
      actionError,
      memorizaObjetos,
    );
  }

  const noTeamHasPlayers = state.teams.every((t) => t.playerIds.length === 0);

  return (
    <main className={styles.page}>
      {actionError && <p className={styles.actionError}>{actionError.message}</p>}

      {showGamePanel ? (
        <GameSelectionPanel onSelect={actions.selectGame} teams={state.teams} />
      ) : (
        <>
          {revealed ? (
            <section className={styles.invite}>
              <RoomCode code={state.code} />
              <JoinQr url={buildJoinUrl(state.code)} />
            </section>
          ) : (
            <button
              type="button"
              className={styles.revealButton}
              disabled={state.teams.length === 0}
              onClick={() => setRevealed(true)}
            >
              Mostrar código a los jugadores
            </button>
          )}

          <TeamManager state={state} actions={actions} />

          <StartMatchButton
            disabled={noTeamHasPlayers}
            onClick={() => setShowGamePanel(true)}
          />
        </>
      )}
    </main>
  );
}
