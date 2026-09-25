import { describe, expect, it } from 'vitest';
import { distributeTurns, NotEnoughTeamsError } from './turn-distribution.js';

// Secuencia fija: primero decide el equipo inicial, después baraja cada equipo.
function fixedRandom(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('distributeTurns', () => {
  it('reparte 9 turnos por equipo (3 rondas x equipo de 3) 5/4 en el equipo de 2 y 3/3/3 en el de 3', () => {
    const teams = [
      { id: 'rojos', playerIds: ['a', 'b'] },
      { id: 'azules', playerIds: ['c', 'd', 'e'] },
    ];

    const turns = distributeTurns(teams, 3, () => 0);

    const porJugador = new Map<string, number>();
    for (const turn of turns) {
      porJugador.set(turn.playerId, (porJugador.get(turn.playerId) ?? 0) + 1);
    }

    expect(turns.filter((t) => t.teamId === 'rojos')).toHaveLength(9);
    expect(turns.filter((t) => t.teamId === 'azules')).toHaveLength(9);
    expect([...porJugador.values()].filter((n) => n === 5)).toHaveLength(1);
    expect([...porJugador.values()].filter((n) => n === 4)).toHaveLength(1);
    expect(porJugador.get('c')).toBe(3);
    expect(porJugador.get('d')).toBe(3);
    expect(porJugador.get('e')).toBe(3);
    expect(turns).toHaveLength(18);
  });

  it('reparte exacto entre equipos del mismo tamaño', () => {
    const teams = [
      { id: 'rojos', playerIds: ['a', 'b'] },
      { id: 'azules', playerIds: ['c', 'd'] },
    ];

    const turns = distributeTurns(teams, 2, () => 0);

    const porJugador = new Map<string, number>();
    for (const turn of turns) {
      porJugador.set(turn.playerId, (porJugador.get(turn.playerId) ?? 0) + 1);
    }

    expect(porJugador.get('a')).toBe(2);
    expect(porJugador.get('b')).toBe(2);
    expect(porJugador.get('c')).toBe(2);
    expect(porJugador.get('d')).toBe(2);
  });

  it('ignora equipos sin jugadores', () => {
    const teams = [
      { id: 'rojos', playerIds: ['a', 'b'] },
      { id: 'azules', playerIds: ['c', 'd'] },
      { id: 'vacio', playerIds: [] },
    ];

    const turns = distributeTurns(teams, 1, () => 0);

    expect(turns.some((t) => t.teamId === 'vacio')).toBe(false);
  });

  it('lanza NotEnoughTeamsError con un solo equipo con jugadores', () => {
    const teams = [
      { id: 'rojos', playerIds: ['a', 'b'] },
      { id: 'azules', playerIds: [] },
    ];

    expect(() => distributeTurns(teams, 1)).toThrow(NotEnoughTeamsError);
  });

  it('lanza NotEnoughTeamsError si ningún equipo tiene jugadores', () => {
    const teams = [
      { id: 'rojos', playerIds: [] },
      { id: 'azules', playerIds: [] },
    ];

    expect(() => distributeTurns(teams, 1)).toThrow(NotEnoughTeamsError);
  });

  it('con random fijo, el equipo inicial es determinístico', () => {
    const teams = [
      { id: 'rojos', playerIds: ['a'] },
      { id: 'azules', playerIds: ['b'] },
    ];

    // Primer valor de random() elige el equipo inicial: 0 -> rojos empieza.
    const turnsRojosPrimero = distributeTurns(teams, 1, fixedRandom([0, 0, 0]));
    expect(turnsRojosPrimero[0].teamId).toBe('rojos');

    // 0.9 con 2 equipos -> floor(0.9 * 2) = 1 -> azules empieza.
    const turnsAzulesPrimero = distributeTurns(teams, 1, fixedRandom([0.9, 0, 0]));
    expect(turnsAzulesPrimero[0].teamId).toBe('azules');
  });

  it('intercala turnos de 3 equipos', () => {
    const teams = [
      { id: 'rojos', playerIds: ['a'] },
      { id: 'azules', playerIds: ['b'] },
      { id: 'verdes', playerIds: ['c'] },
    ];

    const turns = distributeTurns(teams, 2, () => 0);

    expect(turns.map((t) => t.teamId)).toEqual([
      'rojos',
      'azules',
      'verdes',
      'rojos',
      'azules',
      'verdes',
    ]);
  });
});
