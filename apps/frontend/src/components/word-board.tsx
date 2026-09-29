import type { Team } from "@/lib/room-types";
import type { MemorizaBoardItemPublic } from "@/lib/memoriza-objetos-types";
import styles from "./word-board.module.css";

// Grilla de la fase "adivinando": una celda por objeto, con la pista de una
// letra (o la palabra completa, en el color del equipo que acertó, una vez
// revelada). La imagen se mantiene oculta mientras nadie la adivina — el
// espacio queda reservado con un placeholder del mismo tamaño, para que la
// grilla no salte cuando se revele.
export function WordBoard({ items, teams }: { items: MemorizaBoardItemPublic[]; teams: Team[] }) {
  return (
    <div className={styles.grid}>
      {items.map((item) => {
        const team = item.equipoQueAcerto ? teams.find((t) => t.id === item.equipoQueAcerto) : undefined;
        // Se revela al terminar la partida sin que nadie la haya adivinado —
        // se marca distinto (gris, borde punteado) para no confundirla con un
        // acierto de equipo.
        const sinAdivinar = item.estado === "revelada" && !item.equipoQueAcerto;
        return (
          <div key={item.id} className={`${styles.cell} ${sinAdivinar ? styles.noAdivinada : ""}`}>
            {item.estado === "revelada" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imagenUrl} alt="" className={styles.icon} />
            ) : (
              <div className={styles.iconPlaceholder} aria-hidden="true" />
            )}
            {item.estado === "revelada" ? (
              <p
                className={`${styles.palabra} ${sinAdivinar ? styles.noAdivinada : ""}`}
                style={team ? { color: team.color } : undefined}
              >
                {item.palabra}
              </p>
            ) : (
              <p className={styles.pista}>{item.pista}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
