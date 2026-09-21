import { describe, expect, it } from 'vitest';
import { resolveRowClear, type PartRef } from '../src/gameplay/DetachmentSystem';

/** Row 0 cells = indices 0..8; row 1 = 9..17 (row × 9 + col). */
function ref(id: number, humanId: number | null, role: PartRef['role'], cells: number[], alive = true): PartRef {
  return { id, humanId, role, cells, alive };
}

describe('resolveRowClear (pure, GDD §10.2)', () => {
  const cleared = new Set<number>([0, 1, 2, 3, 4, 5, 6, 7, 8]); // row 0

  it('part fully in the cleared row → destroyed', () => {
    const d = resolveRowClear([ref(1, 1, 'torso', [0, 1])], cleared);
    expect(d.destroyed).toEqual([1]);
    expect(d.sliced).toEqual([]);
    expect(d.orphans).toEqual([]);
  });

  it('head is 1×1 full-or-nothing: partial head never slices', () => {
    // head наполовину в строке: 1 из 2 ячеек — голова НЕ нарезается
    const d = resolveRowClear([ref(2, null, 'head', [8, 9])], cleared);
    expect(d.destroyed).toEqual([]);
    expect(d.sliced).toEqual([]);
  });

  it('slice: torso/legs with ≥ 50% cells in row → destroyed + sliced', () => {
    const d = resolveRowClear([ref(3, 1, 'legs', [2, 10])], cleared);
    expect(d.destroyed).toEqual([3]);
    expect(d.sliced).toEqual([3]);
  });

  it('partial < 50% survives (cells freed, not destroyed)', () => {
    const d = resolveRowClear([ref(4, 2, 'torso', [3, 12, 21])], cleared);
    expect(d.destroyed).toEqual([]);
    expect(d.sliced).toEqual([]);
  });

  it('orphan group: human with destroyed and alive parts (GDD §11.1)', () => {
    const d = resolveRowClear(
      [
        ref(1, 1, 'torso', [0, 1]),   // destroyed (full-in-row)
        ref(2, 1, 'head', [10]),      // survivor above
        ref(3, 1, 'legs', [2, 11]),   // destroyed (slice 50%)
      ],
      cleared,
    );
    expect(d.destroyed).toEqual([1, 3]);
    expect(d.orphans).toEqual([{ humanId: 1, survivors: [2] }]);
  });

  it('pieces (humanId null) are destroyed but never orphaned', () => {
    const d = resolveRowClear([ref(5, null, 'torso', [4])], cleared);
    expect(d.destroyed).toEqual([5]);
    expect(d.orphans).toEqual([]);
  });

  it('dead parts and parts outside the row are ignored', () => {
    const d = resolveRowClear(
      [ref(6, 1, 'torso', [20], false), ref(7, 1, 'torso', [9, 10])],
      cleared,
    );
    expect(d.destroyed).toEqual([]);
    expect(d.orphans).toEqual([]);
  });

  it('multi-human clear with several orphan groups', () => {
    const d = resolveRowClear(
      [
        ref(1, 1, 'torso', [0, 1]),
        ref(2, 1, 'head', [9]),
        ref(3, 2, 'legs', [5, 14]),
        ref(4, 2, 'head', [23]),
        ref(5, null, 'torso', [7]),
      ],
      cleared,
    );
    expect(d.destroyed).toEqual([1, 3, 5]);
    expect(d.sliced).toEqual([3]);
    expect(d.orphans).toEqual([
      { humanId: 1, survivors: [2] },
      { humanId: 2, survivors: [4] },
    ]);
  });
});
