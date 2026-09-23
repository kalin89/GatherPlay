// Arma la URL que se codifica en el QR de invitación. Si el host abrió la
// pantalla por `localhost`, un QR armado con `window.location.origin`
// apuntaría a `localhost` y ningún celular en la misma WiFi podría entrar —
// por eso `NEXT_PUBLIC_APP_URL` permite forzar la IP LAN explícitamente.
export function buildJoinUrl(roomCode: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
  return `${base.replace(/\/$/, "")}/play/${roomCode}`;
}
