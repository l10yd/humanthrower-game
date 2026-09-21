/**
 * Fixed timestep clock: accumulator pattern, max substeps, render interpolation alpha.
 * Physics is never tied to the render FPS (GDD §8.1). timeScale supports hit-stop / slow-mo.
 */
export class Clock {
  readonly step: number;
  readonly maxSubsteps: number;
  private acc = 0;
  private lastMs = 0;
  timeScale = 1;
  fps = 0;
  /** Average fixed-step wall time (ms) — debug overlay / perf monitor. */
  stepMsAvg = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private stepMsAcc = 0;
  private stepCount = 0;

  constructor(stepSec = 1 / 60, maxSubsteps = 3) {
    this.step = stepSec;
    this.maxSubsteps = maxSubsteps;
  }

  reset(): void {
    this.acc = 0;
    this.lastMs = performance.now();
  }

  /** Called once per rAF; runs up to maxSubsteps fixed steps, returns render alpha in [0,1). */
  frame(nowMs: number, fixedStep: (dt: number) => void): number {
    let dtMs = nowMs - this.lastMs;
    this.lastMs = nowMs;
    if (!Number.isFinite(dtMs) || dtMs < 0) dtMs = 16.7;
    this.fpsAcc += dtMs;
    this.fpsFrames++;
    if (this.fpsAcc >= 500) {
      this.fps = Math.round((1000 * this.fpsFrames) / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    const scaled = Math.min(dtMs, 250) * this.timeScale;
    if (scaled <= 0) return 0;
    this.acc += scaled / 1000;
    let steps = 0;
    const t0 = performance.now();
    while (this.acc >= this.step && steps < this.maxSubsteps) {
      fixedStep(this.step);
      this.acc -= this.step;
      steps++;
    }
    const stepWall = performance.now() - t0;
    if (steps > 0) {
      this.stepMsAcc += stepWall;
      this.stepCount += steps;
      if (this.stepCount >= 60) {
        this.stepMsAvg = this.stepMsAcc / this.stepCount;
        this.stepMsAcc = 0;
        this.stepCount = 0;
      }
    }
    if (this.acc >= this.step) this.acc = 0; // drop remainder: honest slowdown, no catch-up spike
    return this.acc / this.step;
  }
}
