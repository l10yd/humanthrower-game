import { describe, expect, it } from 'vitest';
import { Rng, randomSeed } from '../src/core/Rng';

describe('Rng (mulberry32, GDD §53)', () => {
  it('deterministic for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('different seeds give different sequences', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('range/int/pick/chance respect bounds', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 500; i++) {
      const v = rng.range(-2, 5);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(5);
      const n = rng.int(3, 9);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
      const p = rng.pick(['a', 'b', 'c']);
      expect(['a', 'b', 'c']).toContain(p);
    }
  });

  it('chance(0) is always false, chance(1) always true', () => {
    const rng = new Rng(9);
    for (let i = 0; i < 50; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it('randomSeed returns a positive integer', () => {
    for (let i = 0; i < 20; i++) {
      const s = randomSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThan(0);
    }
  });
});
