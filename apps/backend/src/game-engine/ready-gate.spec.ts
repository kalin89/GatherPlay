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

  describe('jugadores ausentes (desconectados)', () => {
    it('un ausente no bloquea el gate ni cuenta en los totales', () => {
      const gate = new ReadyGate(['p1', 'p2']);
      gate.markReady('p1');

      gate.markAbsent('p2');

      expect(gate.isSatisfied).toBe(true);
      expect(gate.eligiblePlayerIds).toEqual(['p1']);
      expect(gate.readyPlayerIds).toEqual(['p1']);
    });

    it('al volver presente se lo cuenta de nuevo y conserva su "Listo"', () => {
      const gate = new ReadyGate(['p1', 'p2']);
      gate.markReady('p1');
      gate.markReady('p2');
      gate.markAbsent('p2');
      expect(gate.readyPlayerIds).toEqual(['p1']);

      gate.markPresent('p2');

      expect(gate.eligiblePlayerIds).toEqual(['p1', 'p2']);
      expect(gate.readyPlayerIds).toEqual(['p1', 'p2']);
    });

    it('un ausente que vuelve sin haber presionado Listo vuelve a bloquear', () => {
      const gate = new ReadyGate(['p1', 'p2']);
      gate.markReady('p1');
      gate.markAbsent('p2');
      expect(gate.isSatisfied).toBe(true);

      gate.markPresent('p2');

      expect(gate.isSatisfied).toBe(false);
    });

    it('si todos están ausentes no se satisface', () => {
      const gate = new ReadyGate(['p1', 'p2']);
      gate.markReady('p1');
      gate.markAbsent('p1');
      gate.markAbsent('p2');

      expect(gate.isSatisfied).toBe(false);
    });

    it('marcar ausente a alguien que no es elegible no tiene efecto', () => {
      const gate = new ReadyGate(['p1']);
      gate.markAbsent('intruso');
      gate.markPresent('p1');

      expect(gate.eligiblePlayerIds).toEqual(['p1']);
    });

    it('removePlayer también lo saca de ausentes', () => {
      const gate = new ReadyGate(['p1', 'p2']);
      gate.markAbsent('p2');
      gate.removePlayer('p2');
      gate.markReady('p1');

      expect(gate.eligiblePlayerIds).toEqual(['p1']);
      expect(gate.isSatisfied).toBe(true);
    });
  });
});
