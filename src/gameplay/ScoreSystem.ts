/** Score system: sources, combo multiplier, floating events (GDD §13). Pure module. */
import { SCORE, comboMultiplier } from '../config/scoring';
import { Queue } from '../core/Events';
import type { Save } from '../infra/Save';

export interface FloatingEvent {
  text: string;
  x: number;
  y: number;
  color: number;
}

export class ScoreSystem {
  score = 0;
  best = 0;
  combo = 0;
  comboTimer = 0;
  newBest = false;
  events = new Queue<FloatingEvent>();

  constructor(save: Save) {
    this.best = save.data.bestScore;
  }

  update(dt: number): void {
    this.score += SCORE.survivePerSecond * dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTimer = 0;
      }
    }
  }

  add(n: number): void {
    this.score += n;
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
    }
  }

  onClear(rows: number, risky: boolean, x: number, y: number): void {
    this.combo += rows;
    this.comboTimer = SCORE.comboDecaySec;
    const mult = comboMultiplier(this.combo);
    const gain = Math.round(SCORE.rowClear * mult) + SCORE.multiRowExtra * (rows - 1);
    this.add(gain);
    this.events.push({ text: `+${gain}`, x, y, color: 0xffe08a });
    if (risky) this.add(SCORE.riskyClear);
  }

  onStomp(count: number): void {
    if (count > 0) this.add(Math.min(count * SCORE.stompPerBody, SCORE.stompCap));
  }

  onDodge(x: number, y: number): void {
    this.add(SCORE.dodge);
    this.events.push({ text: 'DODGE', x, y, color: 0x9be0ff });
  }

  onPhysicsMoment(x: number, y: number): void {
    this.add(SCORE.physicsMoment);
    this.events.push({ text: 'NICE!', x, y, color: 0xb4ff9b });
  }

  multiplier(): number {
    return comboMultiplier(this.combo);
  }

  snapshot(): { score: number; best: number; combo: number; mult: number; comboFrac: number; newBest: boolean } {
    return {
      score: Math.floor(this.score),
      best: Math.floor(this.best),
      combo: this.combo,
      mult: this.multiplier(),
      comboFrac: this.comboTimer / SCORE.comboDecaySec,
      newBest: this.newBest,
    };
  }

  reset(): void {
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.newBest = false;
    this.events.drain();
  }
}
