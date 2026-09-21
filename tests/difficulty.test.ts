import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY,
  LEVEL_WEIGHTS,
  levelAt,
  pickArchetype,
  spawnIntervalAt,
  spawnVelocityAt,
  targetingPAt,
  weightsAt,
} from '../src/config/difficulty';
import { Rng } from '../src/core/Rng';

describe('DifficultyDirector data (GDD §12)', () => {
  it('level = 1 + floor(t/40), capped at 7', () => {
    expect(levelAt(0)).toBe(1);
    expect(levelAt(39.9)).toBe(1);
    expect(levelAt(40)).toBe(2);
    expect(levelAt(240)).toBe(7);
    expect(levelAt(10000)).toBe(DIFFICULTY.maxLevel);
  });

  it('spawn interval: 2.6 − 0.34×(D−1), floor 0.6', () => {
    expect(spawnIntervalAt(1)).toBeCloseTo(2.6, 5);
    expect(spawnIntervalAt(3)).toBeCloseTo(1.92, 5);
    expect(spawnIntervalAt(7)).toBeCloseTo(0.6, 5);
    expect(spawnIntervalAt(8)).toBe(DIFFICULTY.spawnIntervalFloor);
  });

  it('spawn velocity: 150 + 34×(D−1)', () => {
    expect(spawnVelocityAt(1)).toBe(150);
    expect(spawnVelocityAt(4)).toBe(252);
  });

  it('targeting p: 0.12 + 0.07×(D−1), cap 0.55', () => {
    expect(targetingPAt(1)).toBeCloseTo(0.12, 5);
    expect(targetingPAt(5)).toBeCloseTo(0.4, 5);
    expect(targetingPAt(7)).toBeCloseTo(0.54, 5);
  });

  it('D1: только NORMAL', () => {
    expect(LEVEL_WEIGHTS[1]).toEqual({ normal: 100 });
    const rng = new Rng(42);
    for (let i = 0; i < 50; i++) expect(pickArchetype(rng, 0)).toBe('normal');
  });

  it('D7: все 6 типов в смеси', () => {
    const w = weightsAt(280);
    for (const id of ['normal', 'small', 'light', 'tall', 'heavy', 'fat'] as const) {
      expect(w[id]).toBeGreaterThan(0);
    }
  });

  it('weights ramp smoothly inside the level duration', () => {
    const start = weightsAt(40); // f = 0 уровня 2
    const end = weightsAt(79.9); // f ≈ 1 уровня 2
    expect(start.light ?? 0).toBeCloseTo(LEVEL_WEIGHTS[2].light ?? 0, 5);
    expect(end.light ?? 0).toBeCloseTo(LEVEL_WEIGHTS[3].light ?? 0, 1);
    expect(end.light ?? 0).toBeGreaterThan(start.light ?? 0); // light: 8 → 10
    expect(end.normal ?? 0).toBeLessThan(start.normal ?? 0); // normal: 78 → 62
  });

  it('pickArchetype distribution roughly matches weights at D5', () => {
    const rng = new Rng(7);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 5000; i++) {
      const id = pickArchetype(rng, 200);
      counts[id] = (counts[id] ?? 0) + 1;
    }
    const w = weightsAt(200);
    // normal ≈ 34% веса (допуск 5%)
    expect(counts.normal! / 5000).toBeGreaterThan(w.normal / 100 - 0.05);
    expect(counts.normal! / 5000).toBeLessThan(w.normal / 100 + 0.05);
  });
});
