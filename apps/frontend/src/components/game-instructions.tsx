import styles from "./game-instructions.module.css";

export function GameInstructions({ title, bullets }: { title: string; bullets: string[] }) {
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>{title}</h2>
      <ul className={styles.bullets}>
        {bullets.map((bullet, index) => (
          <li key={index}>{bullet}</li>
        ))}
      </ul>
    </section>
  );
}
