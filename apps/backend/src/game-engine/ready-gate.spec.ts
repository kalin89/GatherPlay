import { ReadyGate } from './ready-gate.js';

describe('ReadyGate', () => {
  it('con lista vacía, isSatisfied es falso', () => {
    const gate = new ReadyGate([]);
    expect(gate.isSatisfied).toBe(false);
  });

  it('es falso hasta que todos los elegibles marcaron listo', () => {
    const gate = new ReadyGate(['p1', 'p2', 'p3']);
    gate.markReady('p1');
    expect(gate.isSatisfied).toBe(false);
    gate.markReady('p2');
    expect(gate.isSatisfied).toBe(false);
    gate.markReady('p3');
    expect(gate.isSatisfied).toBe(true);
  });

  it('removePlayer saca a alguien de pendientes y de elegibles', () => {
    const gate = new ReadyGate(['p1', 'p2']);
    gate.markReady('p1');
    expect(gate.isSatisfied).toBe(false);

    gate.removePlayer('p2');

    expect(gate.isSatisfied).toBe(true);
    expect(gate.eligiblePlayerIds).toEqual(['p1']);
  });

  it('marcar listo a alguien que no está en eligiblePlayerIds no lo hace elegible', () => {
    const gate = new ReadyGate(['p1']);
    gate.markReady('intruso');
    expect(gate.isSatisfied).toBe(false);
    gate.markReady('p1');
    expect(gate.isSatisfied).toBe(true);
    expect(gate.readyPlayerIds).toContain('intruso');
    expect(gate.eligiblePlayerIds).toEqual(['p1']);
  });
});
