import { PlayLobby } from "./play-lobby";

// Vista "control" (jugador/celular) — formulario de nombre para unirse y
// espera en el lobby. La resolución de `params` queda en el Server
// Component; toda la conexión en vivo vive en `PlayLobby` (Client Component).
export default async function PlayPage(props: PageProps<"/play/[roomCode]">) {
  const { roomCode } = await props.params;

  // `key` fuerza un remount si el usuario navega de una sala a otra sin
  // recargar la página, igual que en `/screen/[roomCode]`.
  return <PlayLobby key={roomCode} roomCode={roomCode} />;
}
