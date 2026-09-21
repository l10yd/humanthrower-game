/** Performance monitor: rolling frame time + auto-quality suggestions (GDD §23.4, §55). */

export type TierChange = 'down' | 'up' | null;

export class PerformanceMonitor {
  private window = 0;
  private frames = 0;
  private avgMs = 0;
  private lowFor = 0;
  private highFor = 0;
  stepMsAvg = 0;

  tick(dtMs: number, autoQuality: boolean): TierChange {
    this.window += dtMs;
    this.frames++;
    if (this.window < 1000) return null;
    this.avgMs = this.window / this.frames;
    this.window = 0;
    this.frames = 0;
    if (!autoQuality) {
      this.lowFor = 0;
      this.highFor = 0;
      return null;
    }
    if (this.avgMs > 24) {
      this.lowFor += 1;
      this.highFor = 0;
      if (this.lowFor >= 4) {
        this.lowFor = 0;
        return 'down';
      }
    } else if (this.avgMs < 15) {
      this.highFor += 1;
      this.lowFor = 0;
      if (this.highFor >= 10) {
        this.highFor = 0;
        return 'up';
      }
    } else {
      this.lowFor = 0;
      this.highFor = 0;
    }
    return null;
  }

  frameMs(): number {
    return this.avgMs;
  }
}
