// Utilidad genérica para la convención de "instrucciones + Listo de todos"
// (spec.md → "Convenciones de toda pantalla de juego"). No depende de
// RoomState ni de sockets — cualquier minijuego que necesite este gate la
// puede reusar (primer consumidor: LaRocolaService, ver
// specs/features/la-rocola-module/analysis.md).
export class ReadyGate {
  private readonly ready = new Set<string>();
  private eligible: string[];

  constructor(eligiblePlayerIds: string[]) {
    this.eligible = [...eligiblePlayerIds];
  }

  markReady(playerId: string): void {
    this.ready.add(playerId);
  }

  removePlayer(playerId: string): void {
    this.ready.delete(playerId);
    this.eligible = this.eligible.filter((id) => id !== playerId);
  }

  get readyPlayerIds(): string[] {
    return [...this.ready];
  }

  get eligiblePlayerIds(): string[] {
    return [...this.eligible];
  }

  get isSatisfied(): boolean {
    return this.eligible.length > 0 && this.eligible.every((id) => this.ready.has(id));
  }
}
