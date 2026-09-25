"use client";

import styles from "./start-match-button.module.css";

export function StartMatchButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.startMatchButton}
      disabled={disabled}
      onClick={onClick}
    >
      Iniciar partida
    </button>
  );
}
