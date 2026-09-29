import { useMemo } from "react";
import {
  gridPositions,
  orbitAngleOffsetDeg,
  scatterPositions,
  segmentForRemaining,
  shufflePositions,
} from "@/lib/object-grid-positions";
import styles from "./object-grid.module.css";

// Velocidad del tramo "orbit" — una vuelta completa cada 9s ("ni muy rápida
// ni muy lenta", spec.md).
const ORBIT_DURATION_SECONDS = 9;

export interface ObjectGridItem {
  id: string;
  imagenUrl: string;
}

// Secuencia animada de 5 tramos de la fase "memorizando" (spec.md → "10.
// Memoriza los objetos en la imagen"). Nunca recibe ni muestra la palabra —
// solo el ícono de cada objeto.
export function ObjectGrid({
  items,
  remainingSeconds,
}: {
  items: ObjectGridItem[];
  remainingSeconds: number;
}) {
  const segment = segmentForRemaining(remainingSeconds);

  // Estables durante toda la fase de memorización — no se recalculan tick a
  // tick, solo dependen de la cantidad de objetos.
  const gridPos = useMemo(() => gridPositions(items.length), [items.length]);
  const shufflePos = useMemo(() => shufflePositions(items.length), [items.length]);
  const scatterPos = useMemo(() => scatterPositions(items.length), [items.length]);

  return (
    <div className={styles.container}>
      {items.map((item, index) => {
        if (segment === "orbit") {
          const delay = -((orbitAngleOffsetDeg(index, items.length) / 360) * ORBIT_DURATION_SECONDS);
          const style = { animationDelay: `${delay}s`, animationDuration: `${ORBIT_DURATION_SECONDS}s` };
          return (
            <div key={item.id} className={styles.orbitWrapper} style={style}>
              <div className={styles.orbitInner} style={style}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.imagenUrl} alt="" className={styles.icon} />
              </div>
            </div>
          );
        }

        const position =
          segment === "grid" ? gridPos[index] : segment === "shuffle" ? shufflePos[index] : scatterPos[index];
        const fading = segment === "fadeout";

        return (
          <div
            key={item.id}
            className={`${styles.item} ${fading ? styles.fadeout : ""}`}
            style={{ top: `${position?.top ?? 50}%`, left: `${position?.left ?? 50}%` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imagenUrl} alt="" className={styles.icon} />
          </div>
        );
      })}
    </div>
  );
}
