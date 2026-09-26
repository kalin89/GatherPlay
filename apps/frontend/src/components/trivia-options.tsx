"use client";

import styles from "./trivia-options.module.css";

const LETTERS = ["A", "B", "C", "D"];

export function TriviaOptions({
  opciones,
  onSelect,
  selectedIndex = null,
  correctIndex = null,
  disabled = false,
}: {
  opciones: string[];
  onSelect?: (index: number) => void;
  selectedIndex?: number | null;
  correctIndex?: number | null;
  disabled?: boolean;
}) {
  const answered = selectedIndex != null;

  return (
    <div className={styles.grid}>
      {opciones.map((opcion, index) => {
        const isCorrect = correctIndex != null && correctIndex === index;
        const isWrongPick = answered && selectedIndex === index && !isCorrect;
        const isPickedNoResultYet = answered && selectedIndex === index && correctIndex == null;

        const classNames = [styles.option];
        if (isCorrect) classNames.push(styles.correct);
        else if (isWrongPick) classNames.push(styles.incorrect);
        else if (isPickedNoResultYet) classNames.push(styles.selected);

        return (
          <button
            key={index}
            type="button"
            className={classNames.join(" ")}
            disabled={disabled || answered || !onSelect}
            onClick={() => onSelect?.(index)}
          >
            <span className={styles.badge}>{LETTERS[index]}</span>
            <span className={styles.text}>{opcion}</span>
          </button>
        );
      })}
    </div>
  );
}
