// Vista "pantalla" (host/TV) — solo lectura del estado de sala vía WebSocket.
// Placeholder de Fase 0: aún no conecta al gateway, solo confirma que la ruta existe.
export default async function ScreenPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = await params;

  return (
    <main>
      <h1>Pantalla de sala: {roomCode}</h1>
      <p>Aquí se mostrará el estado del juego en vivo (Fase 1 en adelante).</p>
    </main>
  );
}
