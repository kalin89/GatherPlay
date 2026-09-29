import Link from "next/link";
import type { RoomClosedReason } from "@/lib/room-types";
import styles from "./room-closed-notice.module.css";

const MESSAGES: Record<RoomClosedReason, string> = {
  host_left: "El anfitrión se desconectó y la sala se cerró.",
  max_age: "La sala llegó a su duración máxima y se cerró.",
};

// Aviso a pantalla completa cuando el backend cierra la sala (`room_closed`).
// Lo comparten `/play` y `/screen`: en ambos el siguiente paso es el mismo,
// volver al inicio para crear una sala nueva.
export function RoomClosedNotice({ reason }: { reason: RoomClosedReason }) {
  return (
    <main className={styles.page}>
      <p className={styles.message}>{MESSAGES[reason]}</p>
      <Link href="/" className={styles.link}>
        Volver al inicio
      </Link>
    </main>
  );
}
