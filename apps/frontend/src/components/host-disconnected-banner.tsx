import styles from "./host-disconnected-banner.module.css";

// Aviso sobre cualquier vista de `/play` mientras la pantalla del anfitrión
// está caída (`host_disconnected`). Va con `position: fixed` para no tener que
// tocar cada vista de juego. No menciona cuánto tiempo hay de gracia: es una
// variable del servidor (`ROOM_HOST_GRACE_MS`).
export function HostDisconnectedBanner() {
  return (
    <div role="status" className={styles.banner}>
      El anfitrión perdió la conexión. Esperando a que vuelva…
    </div>
  );
}
