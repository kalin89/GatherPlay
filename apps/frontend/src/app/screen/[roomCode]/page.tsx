import { ScreenLobby } from "./screen-lobby";

// Vista "pantalla" (host/TV) — solo lectura del estado de sala vía
// WebSocket. La resolución de `params` queda en el Server Component;
// toda la conexión en vivo vive en `ScreenLobby` (Client Component).
export default async function ScreenPage(
  props: PageProps<"/screen/[roomCode]">,
) {
  const { roomCode } = await props.params;

  // `key` fuerza un remount si el usuario navega de una sala a otra sin
  // recargar la página, así `useRoomState` arranca limpio para el código
  // nuevo en vez de arrastrar el estado de la sala anterior.
  return <ScreenLobby key={roomCode} roomCode={roomCode} />;
}
