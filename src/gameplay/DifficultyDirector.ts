/** Difficulty director: level over time (GDD §12). Thin stateful wrapper over pure config fns. */
import { levelAt } from '../config/difficulty';

export class DifficultyDirector {
  t = 0;
  level = 1;

  update(dt: number): void {
    this.t += dt;
    this.level = levelAt(this.t);
  }

  reset(): void {
    this.t = 0;
    this.level = 1;
  }
}
