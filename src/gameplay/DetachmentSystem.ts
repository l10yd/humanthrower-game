/** Detachment system: pure resolve (row clear → destroyed/orphaned) + physics executor
 * (GDD §11, §33.2). Survivors become independent stackable pieces; NO impulses (GDD §44). */
import { ROW_CLEAR } from '../config/rowClear';
import type { HumanVariant } from '../config/palette';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { GridManager } from './GridManager';
import type { PartRole, RagdollSystem } from './RagdollSystem';

export interface PartRef {
  id: number;
  humanId: number | null;
  role: PartRole;
  cells: number[];
  alive: boolean;
}

export interface OrphanGroup {
  humanId: number;
  survivors: number[];
}

export interface DetachDecision {
  destroyed: number[];
  sliced: number[];
  orphans: OrphanGroup[];
}

/** Pure decision: GDD §10.2 rules — full-in-row destroys; slice ≥ 50% for torso/legs;
 * head is 1×1 (full-or-nothing); partial < 50% survives with its in-row cells freed. */
export function resolveRowClear(parts: PartRef[], clearedCells: Set<number>): DetachDecision {
  const destroyed: number[] = [];
  const sliced: number[] = [];
  for (const p of parts) {
    if (!p.alive || p.cells.length === 0) continue;
    let inRow = 0;
    for (const c of p.cells) if (clearedCells.has(c)) inRow++;
    if (inRow === 0) continue;
    if (inRow === p.cells.length) {
      destroyed.push(p.id);
      continue;
    }
    if (p.role !== 'head' && inRow / p.cells.length >= ROW_CLEAR.sliceCoverage) {
      destroyed.push(p.id);
      sliced.push(p.id);
    }
  }
  const byHuman = new Map<number, PartRef[]>();
  for (const p of parts) {
    if (p.humanId === null) continue;
    const arr = byHuman.get(p.humanId);
    if (arr) arr.push(p);
    else byHuman.set(p.humanId, [p]);
  }
  const destroyedSet = new Set(destroyed);
  const orphans: OrphanGroup[] = [];
  for (const [humanId, arr] of byHuman) {
    const hasDestroyed = arr.some((p) => destroyedSet.has(p.id));
    const survivors = arr.filter((p) => p.alive && !destroyedSet.has(p.id)).map((p) => p.id);
    if (hasDestroyed && survivors.length > 0) orphans.push({ humanId, survivors });
  }
  return { destroyed, sliced, orphans };
}

export interface DetachHooks {
  onDestroyed(x: number, y: number, role: PartRole, variant: HumanVariant): void;
  onDetached(x: number, y: number, role: PartRole, variant: HumanVariant): void;
}

const DETACH_MAX_LIN = 260; // px/s (GDD §11.2)
const DETACH_MAX_ANG = 3; // rad/s

export class DetachmentSystem {
  constructor(
    private world: PhysicsWorld,
    private ragdolls: RagdollSystem,
    private grid: GridManager,
    private hooks: DetachHooks,
  ) {}

  execute(rows: number[]): { destroyedCount: number; slicedCount: number } {
    const clearedCells = new Set<number>();
    for (const row of rows) {
      for (let col = 0; col < this.grid.cols; col++) clearedCells.add(this.grid.cellIndex(col, row));
    }

    const refs: PartRef[] = [];
    for (const p of this.ragdolls.coreParts()) {
      refs.push({
        id: p.id,
        humanId: p.humanId,
        role: p.role,
        cells: this.grid.cellsOfPart(p.id),
        alive: p.alive,
      });
    }

    const decision = resolveRowClear(refs, clearedCells);

    // 1. destroy what is really in the clear zone (GDD §11.4)
    for (const id of decision.destroyed) {
      const p = this.ragdolls.part(id);
      if (!p || !p.alive) continue;
      const t = p.body.translation();
      this.hooks.onDestroyed(t.x, t.y, p.role, p.variant);
      this.ragdolls.destroyPart(p);
    }

    // 2. promote survivors of orphaned humans to independent pieces
    for (const o of decision.orphans) {
      for (const id of o.survivors) {
        const p = this.ragdolls.part(id);
        if (!p || !p.alive) continue;
        p.isPiece = true;
        p.humanId = null;
        this.world.clampVelocity(p.body, DETACH_MAX_LIN, DETACH_MAX_ANG); // keep velocity, clamped
        this.ragdolls.thawPiece(p);
        const t = p.body.translation();
        this.hooks.onDetached(t.x, t.y, p.role, p.variant);
      }
    }

    // 3. wake bodies that lost support above cleared cells — honest fall, no explosion (GDD §44)
    for (const cell of clearedCells) {
      const col = cell % this.grid.cols;
      const row = Math.floor(cell / this.grid.cols);
      const center = this.grid.cellCenter(col, row);
      for (const p of this.ragdolls.coreParts()) {
        const t = p.body.translation();
        if (t.y < center.y && t.y > center.y - this.grid.cell * 1.4 && Math.abs(t.x - center.x) < this.grid.cell) {
          this.ragdolls.thawPiece(p);
        }
      }
    }

    // 4. full occupancy resample (GDD §24 п.6)
    this.grid.reset();
    return { destroyedCount: decision.destroyed.length, slicedCount: decision.sliced.length };
  }
}
