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
  // Opcional: avisa que estos jugadores vencieron su gracia y salieron de la
  // sala, para que un juego que estaba esperando a alguno de ellos (ej. el
  // actor que nunca presionó "Iniciar") no quede congelado.
  onPlayersRemoved?(code: string, playerIds: string[]): void;
  // Opcionales: el jugador se desconectó (empieza su gracia) o reclamó su lugar
  // con `rejoin_room`. Lo usa un juego que deja de esperar a los ausentes (ej.
  // el `ReadyGate` de La Rocola).
  onPlayerDisconnected?(code: string, playerId: string): void;
  onPlayerReconnected?(code: string, playerId: string): void;
}
