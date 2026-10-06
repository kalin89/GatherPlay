// Utilidad genérica para la convención de "instrucciones + Listo de todos"
// (spec.md → "Convenciones de toda pantalla de juego"). No depende de
// RoomState ni de sockets — cualquier minijuego que necesite este gate la
// puede reusar (primer consumidor: LaRocolaService, ver
// specs/features/la-rocola-module/analysis.md).
//
// Los jugadores desconectados (`markAbsent`) no bloquean el gate ni cuentan en
// los totales mientras estén ausentes; si vuelven (`markPresent`) antes de que
// arranque la partida se los cuenta de nuevo, con su "Listo" intacto (ver
// specs/features/player-reconnection/analysis.md).
export class ReadyGate {
  private readonly ready = new Set<string>();
  private readonly absent = new Set<string>();
  private eligible: string[];

  constructor(eligiblePlayerIds: string[]) {
    this.eligible = [...eligiblePlayerIds];
  }

  markReady(playerId: string): void {
    this.ready.add(playerId);
  }

  markAbsent(playerId: string): void {
    if (this.eligible.includes(playerId)) this.absent.add(playerId);
  }

  markPresent(playerId: string): void {
    this.absent.delete(playerId);
  }

  removePlayer(playerId: string): void {
    this.ready.delete(playerId);
    this.absent.delete(playerId);
    this.eligible = this.eligible.filter((id) => id !== playerId);
  }

  get readyPlayerIds(): string[] {
    return [...this.ready].filter((id) => !this.absent.has(id));
  }

  get eligiblePlayerIds(): string[] {
    return this.eligible.filter((id) => !this.absent.has(id));
  }

  get isSatisfied(): boolean {
    const present = this.eligiblePlayerIds;
    return present.length > 0 && present.every((id) => this.ready.has(id));
  }
}
