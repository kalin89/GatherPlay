// Evento que un juego le manda a un jugador que reconecta a mitad de partida,
// con la misma forma (nombre + payload) que emite normalmente su gateway.
export interface GameSnapshotEvent {
  event: string;
  payload: unknown;
}

// Contrato de los servicios que guardan estado por sala (partidas en curso,
// acumuladores de contenido ya usado, temporizadores). `RoomService.closeRoom`
// lo invoca en todos los registrados para que ninguno retenga memoria de una
// sala que ya no existe. Debe ser idempotente: llamarlo dos veces, o sobre una
// sala sin partida, no falla.
export interface RoomScopedState {
  disposeRoom(code: string): void;
  // Opcional: los eventos mínimos que necesita un jugador que vuelve para ver
  // lo que le corresponde ahora (ver specs/features/player-reconnection).
  // No debe incluir contenido secreto que no sea suyo.
  snapshotFor?(code: string, playerId: string): GameSnapshotEvent[];
}
