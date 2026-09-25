"use client";

import { GAME_CATALOG } from "@/lib/game-catalog";
import type { GameId } from "@/lib/room-types";
import styles from "./game-selection-panel.module.css";

export function GameSelectionPanel({
  onSelect,
}: {
  onSelect: (gameId: GameId) => void;
}) {
  return (
    <section className={styles.wrapper}>
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
