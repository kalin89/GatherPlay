import { useState } from "react";
import styles from "./ready-button.module.css";

export function ReadyButton({
  onReady,
  pressed,
  readyCount,
  totalCount,
}: {
  onReady: () => void;
  pressed: boolean;
  readyCount: number;
  totalCount: number;
}) {
  // Guarda local además de `pressed`: evita un segundo emit si el padre
  // todavía no recibió el `rocola_ready_state` actualizado (latencia de red)
  // cuando el juego ya se satisfizo con este mismo click.
  const [clicked, setClicked] = useState(false);
  const disabled = pressed || clicked;

  if (readyCount >= totalCount && totalCount > 0) {
    return null;
  }

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        disabled={disabled}
        onClick={() => {
          setClicked(true);
          onReady();
        }}
      >
        Listo
      </button>
      {disabled && (
        <p className={styles.waiting}>
          Esperando a los demás ({readyCount}/{totalCount})
        </p>
      )}
    </div>
  );
}
