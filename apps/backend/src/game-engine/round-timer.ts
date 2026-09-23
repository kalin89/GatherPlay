export class RoundTimer {
  private handle: NodeJS.Timeout | null = null;
  private remaining = 0;

  constructor(
    private readonly onTick: (remainingSeconds: number) => void,
    private readonly onEnd: () => void,
  ) {}

  start(durationSeconds: number): void {
    this.remaining = durationSeconds;
    this.handle = setInterval(() => {
      this.remaining--;
      this.onTick(this.remaining);
      if (this.remaining <= 0) {
        this.stop();
        this.onEnd();
      }
    }, 1000);
    this.handle.unref?.();
  }

  stop(): void {
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = null;
    }
  }

  get isRunning(): boolean {
    return this.handle !== null;
  }
}
