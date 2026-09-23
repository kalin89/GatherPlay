import type { TeamWithPlayers } from "@/lib/room-selectors";
import styles from "./team-board.module.css";

export function TeamBoard({ team, players }: TeamWithPlayers) {
  return (
    <article className={styles.card} style={{ borderColor: team.color }}>
      <header className={styles.header}>
        {/* El color nunca es el único diferenciador: el nombre siempre
            está en texto, el color es solo un acento visual. */}
        <span className={styles.swatch} style={{ background: team.color }} />
        <h2 className={styles.name}>{team.name}</h2>
      </header>
      {players.length === 0 ? (
        <p className={styles.empty}>Sin jugadores todavía</p>
      ) : (
        <ul className={styles.list}>
          {players.map((player) => (
            <li key={player.id} className={styles.player}>
              {player.name}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
