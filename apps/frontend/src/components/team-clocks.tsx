import type { Team } from "@/lib/room-types";
import type { MemorizaTeamClock } from "@/lib/memoriza-objetos-types";
import styles from "./team-clocks.module.css";

function formatClock(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const rest = clamped % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

// Un reloj mm:ss por equipo, resaltando el que tiene el turno activo —
// spec.md → "10. Memoriza los objetos en la imagen" (reloj tipo "ajedrez").
export function TeamClocks({
  teams,
  clocks,
  equipoActivoId,
}: {
  teams: Team[];
  clocks: MemorizaTeamClock[];
  equipoActivoId: string | null;
}) {
  return (
    <div className={styles.row}>
      {clocks.map((clock) => {
        const team = teams.find((t) => t.id === clock.teamId);
        if (!team) return null;
        const activo = clock.teamId === equipoActivoId;
        return (
          <div
            key={clock.teamId}
            className={`${styles.clock} ${activo ? styles.activo : ""}`}
            style={activo ? { borderColor: team.color } : undefined}
          >
            <span className={styles.swatch} style={{ background: team.color }} />
            <span className={styles.teamName}>{team.name}</span>
            <span className={styles.time}>{formatClock(clock.remainingSeconds)}</span>
          </div>
        );
      })}
    </div>
  );
}
