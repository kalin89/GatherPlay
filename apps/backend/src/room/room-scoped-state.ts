// Contrato de los servicios que guardan estado por sala (partidas en curso,
// acumuladores de contenido ya usado, temporizadores). `RoomService.closeRoom`
// lo invoca en todos los registrados para que ninguno retenga memoria de una
// sala que ya no existe. Debe ser idempotente: llamarlo dos veces, o sobre una
// sala sin partida, no falla.
export interface RoomScopedState {
  disposeRoom(code: string): void;
}
