import type { Player } from "@/lib/room-types";
import styles from "./player-list.module.css";

export function PlayerList({
  title,
  players,
  emptyMessage,
}: {
  title: string;
  players: Player[];
  emptyMessage: string;
}) {
  return (
    <section className={styles.wrapper}>
      <h2 className={styles.title}>{title}</h2>
      {players.length === 0 ? (
        <p className={styles.empty}>{emptyMessage}</p>
      ) : (
        <ul className={styles.list}>
          {players.map((player) => (
            <li key={player.id} className={styles.player}>
              {player.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
