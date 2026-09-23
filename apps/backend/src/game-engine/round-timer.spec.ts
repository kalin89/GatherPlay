import { RoundTimer } from './round-timer.js';

describe('RoundTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tickea en cuenta regresiva y llama onEnd una sola vez al llegar a cero', () => {
    const onTick = vi.fn();
    const onEnd = vi.fn();
    const timer = new RoundTimer(onTick, onEnd);

    timer.start(3);
    vi.advanceTimersByTime(3000);

    expect(onTick.mock.calls.map((call) => call[0])).toEqual([2, 1, 0]);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('no tickea más después de terminar', () => {
    const onTick = vi.fn();
    const onEnd = vi.fn();
    const timer = new RoundTimer(onTick, onEnd);

    timer.start(1);
    vi.advanceTimersByTime(1000);
    onTick.mockClear();
    onEnd.mockClear();
    vi.advanceTimersByTime(5000);

    expect(onTick).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('stop() a mitad de cuenta detiene los ticks sin llamar onEnd', () => {
    const onTick = vi.fn();
    const onEnd = vi.fn();
    const timer = new RoundTimer(onTick, onEnd);

    timer.start(5);
    vi.advanceTimersByTime(2000);
    timer.stop();
    vi.advanceTimersByTime(5000);

    expect(onTick).toHaveBeenCalledTimes(2);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('stop() sin start() previo no lanza', () => {
    const timer = new RoundTimer(vi.fn(), vi.fn());

    expect(() => timer.stop()).not.toThrow();
  });

  it('stop() llamado dos veces no lanza', () => {
    const timer = new RoundTimer(vi.fn(), vi.fn());

    timer.start(5);
    timer.stop();

    expect(() => timer.stop()).not.toThrow();
  });

  it('isRunning refleja arranque, fin natural y cancelación', () => {
    const timer = new RoundTimer(vi.fn(), vi.fn());

    expect(timer.isRunning).toBe(false);

    timer.start(2);
    expect(timer.isRunning).toBe(true);

    vi.advanceTimersByTime(2000);
    expect(timer.isRunning).toBe(false);

    timer.start(5);
    timer.stop();
    expect(timer.isRunning).toBe(false);
  });
});
