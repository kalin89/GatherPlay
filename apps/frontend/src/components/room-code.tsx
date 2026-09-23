import styles from "./room-code.module.css";

export function RoomCode({ code }: { code: string }) {
  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Código de sala</span>
      <span className={styles.code}>{code}</span>
    </div>
  );
}
