"use client";

import { GAME_CATALOG } from "@/lib/game-catalog";
import type { GameId, Team } from "@/lib/room-types";
import { TeamScoreboard } from "./team-scoreboard";
import styles from "./game-selection-panel.module.css";

export function GameSelectionPanel({
  onSelect,
  teams,
}: {
  onSelect: (gameId: GameId) => void;
  teams: Team[];
}) {
  return (
    <section className={styles.wrapper}>
      <TeamScoreboard teams={teams} />
      <h2 className={styles.title}>Elegí un juego</h2>
      <div className={styles.list}>
        {GAME_CATALOG.map((game) => (
          <button
            key={game.id}
            type="button"
            className={styles.gameButton}
            onClick={() => onSelect(game.id)}
          >
            <span className={styles.gameLabel}>{game.label}</span>
            <span className={styles.gameDescription}>{game.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
