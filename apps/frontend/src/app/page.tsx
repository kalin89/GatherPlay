import { CreateRoomButton } from "@/components/create-room-button";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>GatherPlay</h1>
        <p className={styles.tagline}>
          Reuní a todos en la misma pantalla. Cada quien juega desde su
          celular.
        </p>
        <CreateRoomButton className={styles.createButton} />
      </div>
    </div>
  );
}
