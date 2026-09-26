import type { Team } from "@/lib/room-types";
import styles from "./team-scoreboard.module.css";

export function TeamScoreboard({ teams }: { teams: Team[] }) {
  return (
    <div className={styles.scoreboard}>
      {teams.map((team) => (
        <div key={team.id} className={styles.teamChip}>
          <span className={styles.swatch} style={{ background: team.color }} />
          <span className={styles.teamName}>{team.name}</span>
          <span className={styles.teamScore}>{team.score}</span>
        </div>
      ))}
    </div>
  );
}
