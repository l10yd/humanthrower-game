/** Clear scheduler: WARNING → DANGEROUS → resolve/apply transaction pipeline (GDD §10.1, §68).
 * Runs at the start of a fixed step — never inside physics callbacks. */
import { ROW_CLEAR } from '../config/rowClear';

export type ClearPhase = 'warning' | 'dangerous';

export interface ClearHooks {
  onPhase(rows: number[], phase: ClearPhase): void;
  /** Live re-validation at resolve time; return kept rows or null to cancel (GDD §10.3). */
  revalidate(rows: number[]): number[] | null;
  /** Execute the clear transaction (destroy/detach/wake/resample/score). */
  applyMutations(rows: number[]): void;
  onCancel(rows: number[]): void;
}

export class ClearScheduler {
  pending: number[] = [];
  active: { rows: number[]; phase: ClearPhase; timer: number } | null = null;
  clearsDone = 0;

  constructor(private hooks: ClearHooks) {}

  onRowCompleted(row: number): void {
    if (this.pending.includes(row)) return;
    if (this.active && this.active.rows.includes(row)) return;
    this.pending.push(row);
  }

  tick(dt: number): void {
    if (!this.active) {
      if (this.pending.length > 0) {
        const rows = this.pending; // multi-row: one transaction (GDD §10.5)
        this.pending = [];
        this.active = { rows, phase: 'warning', timer: 0 };
        this.hooks.onPhase(rows, 'warning');
      }
      return;
    }
    const a = this.active;
    if (a.phase === 'warning') {
      a.timer += dt;
      if (a.timer >= ROW_CLEAR.warningSec) {
        a.phase = 'dangerous';
        a.timer = 0;
        this.hooks.onPhase(a.rows, 'dangerous');
      }
    } else {
      a.timer += dt;
      if (a.timer >= ROW_CLEAR.dangerousSec) {
        const rows = a.rows;
        this.active = null;
        const live = this.hooks.revalidate(rows);
        if (!live || live.length === 0) {
          this.hooks.onCancel(rows);
          return;
        }
        this.clearsDone++;
        this.hooks.applyMutations(live);
      }
    }
  }

  warningRows(): number[] {
    return this.active && this.active.phase === 'warning' ? this.active.rows : [];
  }

  dangerousRows(): number[] {
    return this.active && this.active.phase === 'dangerous' ? this.active.rows : [];
  }

  isBusy(): boolean {
    return this.active !== null || this.pending.length > 0;
  }

  reset(): void {
    this.pending = [];
    this.active = null;
    this.clearsDone = 0;
  }
}
