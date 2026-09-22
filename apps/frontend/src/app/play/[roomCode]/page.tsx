// Vista "control" (jugador/celular) — formulario de nombre + controles del minijuego activo.
// Placeholder de Fase 0: aún no conecta al gateway, solo confirma que la ruta existe.
export default async function PlayPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = await params;

  return (
    <main>
      <h1>Unirse a la sala: {roomCode}</h1>
      <p>Aquí irá el formulario de nombre y los controles del juego (Fase 1 en adelante).</p>
    </main>
  );
}
