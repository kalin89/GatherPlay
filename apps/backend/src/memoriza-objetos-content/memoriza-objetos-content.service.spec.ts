import type { MemorizaObjetosBankEntry } from './memoriza-objetos-content.types.js';
import { InvalidObjectCountError, MemorizaObjetosContentService } from './memoriza-objetos-content.service.js';

function makeBank(count: number): MemorizaObjetosBankEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `objeto-${i}`,
    palabra: `palabra${i}`,
    imagenUrl: `https://example.com/${i}.svg`,
  }));
}

describe('MemorizaObjetosContentService', () => {
  it('devuelve la cantidad pedida, todas distintas entre sí', () => {
    const service = new MemorizaObjetosContentService(Math.random, makeBank(30));
    const objects = service.selectObjects(20);
    expect(objects).toHaveLength(20);
    expect(new Set(objects.map((o) => o.id)).size).toBe(20);
  });

  it('no repite ningún id de la lista de exclusión cuando el banco alcanza sin ellos', () => {
    const bank = makeBank(30);
    const service = new MemorizaObjetosContentService(Math.random, bank);
    const excluir = bank.slice(0, 15).map((o) => o.id);
    const objects = service.selectObjects(10, excluir);
    expect(objects).toHaveLength(10);
    for (const obj of objects) {
      expect(excluir).not.toContain(obj.id);
    }
  });

  it('cantidad inválida (0, negativa, no entera o mayor al máximo) lanza error sin tocar el banco', () => {
    const service = new MemorizaObjetosContentService(Math.random, makeBank(30));
    expect(() => service.selectObjects(0)).toThrow(InvalidObjectCountError);
    expect(() => service.selectObjects(-1)).toThrow(InvalidObjectCountError);
    expect(() => service.selectObjects(1.5)).toThrow(InvalidObjectCountError);
    expect(() => service.selectObjects(1000)).toThrow(InvalidObjectCountError);
  });

  it('si el banco no tiene suficientes objetos nuevos tras excluir, reutiliza objetos ya usados en vez de devolver menos de los pedidos', () => {
    const bank = makeBank(25);
    const service = new MemorizaObjetosContentService(Math.random, bank);
    // Solo quedan 5 sin excluir — no alcanza para pedir 20, así que debe
    // completar reutilizando algunos de los 20 excluidos.
    const excluir = bank.slice(0, 20).map((o) => o.id);
    const objects = service.selectObjects(20, excluir);
    expect(objects).toHaveLength(20);
  });
});
