import type { Team } from "@/lib/room-types";
import styles from "./match-scoreboard.module.css";

// Marcador de la partida en curso, esquina superior derecha (spec.md →
// "Convenciones de toda pantalla de juego") — genérico para cualquier
// minijuego, no específico de La Rocola.
export function MatchScoreboard({
  teams,
  scores,
}: {
  teams: Team[];
  scores: { teamId: string; score: number }[];
}) {
  return (
    <div className={styles.corner}>
      {scores.map((entry) => {
        const team = teams.find((t) => t.id === entry.teamId);
        if (!team) return null;
        return (
          <span key={entry.teamId} className={styles.chip}>
            <span className={styles.swatch} style={{ background: team.color }} />
            {team.name}: {entry.score}
          </span>
        );
      })}
    </div>
  );
}
