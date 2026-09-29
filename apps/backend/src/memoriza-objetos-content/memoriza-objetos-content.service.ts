import { Injectable, Optional } from '@nestjs/common';
import { OBJECT_BANK } from './object-bank.js';
import {
  MAX_OBJECTS_PER_REQUEST,
  type MemorizaObjetosBankEntry,
} from './memoriza-objetos-content.types.js';

export class InvalidObjectCountError extends Error {
  constructor(cantidad: number) {
    super(`Cantidad de objetos inválida: ${cantidad}`);
    this.name = 'InvalidObjectCountError';
  }
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

// Resuelve el tablero de "Memoriza los objetos" (spec.md → "Contenido —
// Memoriza los objetos"): banco curado a mano, sin proveedor externo ni IA —
// a diferencia de rocola-content, no hace falta ningún lookup en runtime
// porque cada entrada ya trae su imagenUrl final. Ver
// memoriza-objetos-content/analysis.md.
@Injectable()
export class MemorizaObjetosContentService {
  constructor(
    @Optional() private readonly random: () => number = Math.random,
    @Optional() private readonly bank: readonly MemorizaObjetosBankEntry[] = OBJECT_BANK,
  ) {}

  selectObjects(cantidad: number, excluir: string[] = []): MemorizaObjetosBankEntry[] {
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_OBJECTS_PER_REQUEST) {
      throw new InvalidObjectCountError(cantidad);
    }

    const excludeSet = new Set(excluir);
    const unexcluded = this.bank.filter((entry) => !excludeSet.has(entry.id));
    // Si no alcanza tras excluir lo ya usado en la sala, se reutilizan
    // objetos ya mostrados antes en vez de arrancar la partida con menos de
    // los `cantidad` pedidos (mismo criterio que RocolaContentService ante un
    // banco agotado).
    const pool = unexcluded.length >= cantidad ? unexcluded : this.bank;

    return shuffle(pool, this.random).slice(0, cantidad);
  }
}
