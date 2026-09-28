import type { Team } from "@/lib/room-types";
import styles from "./match-winner-banner.module.css";

// Anuncio de fin de partida (spec.md → "Convenciones de toda pantalla de
// juego"): "Empate" o "El ganador de este juego es el equipo {nombre}" —
// genérico para cualquier minijuego.
export function MatchWinnerBanner({
  teams,
  scores,
}: {
  teams: Team[];
  scores: { teamId: string; score: number }[];
}) {
  const topScore = Math.max(0, ...scores.map((s) => s.score));
  const winners = scores.filter((s) => s.score === topScore);
  const isTie = winners.length > 1;

  if (isTie) {
    return <p className={styles.banner}>Empate</p>;
  }

  const winnerTeam = teams.find((t) => t.id === winners[0]?.teamId);
  if (!winnerTeam) {
    return null;
  }

  return (
    <p className={styles.banner}>
      El ganador de este juego es el equipo{" "}
      <span className={styles.swatch} style={{ background: winnerTeam.color }} />
      <strong>{winnerTeam.name}</strong>
    </p>
  );
}
