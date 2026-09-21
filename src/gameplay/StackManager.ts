/** Stack manager: danger-band grace, trapped detection (GDD §14.1, §26). */
import { DANGER_ROW, PHYS } from '../config/balance';
import type { GridManager } from './GridManager';
import type { RagdollSystem } from './RagdollSystem';

export type GameOverReason = 'overflow' | 'crushed' | 'spawnBlocked' | 'swept';

export interface StackHooks {
  onGameOver(reason: GameOverReason): void;
}

export class StackManager {
  graceTimer = 0;
  trappedTimer = 0;
  dangerActive = false;
  trappedActive = false;

  constructor(
    private grid: GridManager,
    private ragdolls: RagdollSystem,
    private hooks: StackHooks,
  ) {}

  update(dt: number, playerX: number, playerY: number, playerAlive: boolean): void {
    // danger band (rows >= DANGER_ROW): sustained coverage → game over (grace 2.5 s)
    let band = 0;
    for (let row = DANGER_ROW; row < this.grid.rows; row++) band += this.grid.occupiedCount(row);
    this.dangerActive = band > 0;
    if (this.dangerActive) this.graceTimer += dt;
    else this.graceTimer = Math.max(0, this.graceTimer - dt * 2);
    if (this.graceTimer >= PHYS.overflowGraceSec) {
      this.hooks.onGameOver('overflow');
      return;
    }

    // trapped: player torso cell occupied by a settled part (grace 4 s, GDD §5.4)
    this.trappedActive = false;
    if (playerAlive) {
      const cell = this.grid.cellAt(playerX, playerY - 14);
      if (cell) {
        const occ = this.grid.occupantsAt(this.grid.cellIndex(cell.col, cell.row));
        for (const pid of occ) {
          const p = this.ragdolls.part(pid);
          if (p && p.alive && p.state === 'settled') {
            this.trappedActive = true;
            break;
          }
        }
      }
    }
    if (this.trappedActive) this.trappedTimer += dt;
    else this.trappedTimer = Math.max(0, this.trappedTimer - dt * 1.5);
    if (this.trappedTimer >= PHYS.trappedGraceSec) {
      this.hooks.onGameOver('crushed');
    }
  }

  reset(): void {
    this.graceTimer = 0;
    this.trappedTimer = 0;
    this.dangerActive = false;
    this.trappedActive = false;
  }
}
