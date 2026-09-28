import styles from "./adivina-palabra-word.module.css";

export function AdivinaPalabraWord({ palabra }: { palabra: string | null }) {
  if (palabra === null) {
    return <p className={styles.empty}>Sin más palabras…</p>;
  }

  return <h2 className={styles.word}>{palabra}</h2>;
}
