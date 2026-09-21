import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../src/config/archetypes';
import { ragdollGeometry } from '../src/physics/RagdollFactory';
import { generateVariant } from '../src/config/palette';
import { Rng } from '../src/core/Rng';

describe('Archetypes (GDD §7.3)', () => {
  it('6 archetypes with unlock difficulty ≥ 2 (кроме normal)', () => {
    expect(Object.keys(ARCHETYPES).sort()).toEqual(['fat', 'heavy', 'light', 'normal', 'small', 'tall'].sort());
    for (const [id, a] of Object.entries(ARCHETYPES)) {
      if (id === 'normal') expect(a.unlockDifficulty).toBe(1);
      else expect(a.unlockDifficulty).toBeGreaterThan(1);
    }
  });

  it('mass values are sane (18..130, GDD §6.2)', () => {
    for (const a of Object.values(ARCHETYPES)) {
      expect(a.mass).toBeGreaterThanOrEqual(18);
      expect(a.mass).toBeLessThanOrEqual(130);
    }
  });

  it('ragdoll geometry: positive radii, head < torso, sane proportions (GDD §7.1)', () => {
    const v = generateVariant(new Rng(11));
    for (const a of Object.values(ARCHETYPES)) {
      const g = ragdollGeometry(a, v);
      expect(g.headR).toBeGreaterThan(0);
      expect(g.torsoR).toBeGreaterThan(g.headR);
      expect(g.torsoHalfH).toBeGreaterThan(0);
      expect(g.pelvisR).toBeGreaterThan(0);
      expect(g.pelvisHalfH).toBeGreaterThan(0);
      // head ≈ 0.136 × (высота × scale) × headScale
      expect(g.headR).toBeCloseTo(0.136 * a.heightPx * a.scale * v.headScale, 5);
    }
  });

  it('no-launching policy: restitution ≤ 0.10 everywhere (GDD §8.3)', () => {
    for (const a of Object.values(ARCHETYPES)) {
      expect(a.restitution).toBeLessThanOrEqual(0.1);
    }
  });

  it('FAT закрывает 2 колонки, SMALL — компактный', () => {
    expect(ARCHETYPES.fat.widthCells).toBe(2);
    expect(ARCHETYPES.small.widthPx).toBeLessThan(ARCHETYPES.normal.widthPx);
    expect(ARCHETYPES.tall.heightPx).toBeGreaterThan(ARCHETYPES.normal.heightPx);
  });

  it('scale and dims are positive and sane', () => {
    for (const a of Object.values(ARCHETYPES)) {
      expect(a.scale).toBeGreaterThan(0.5);
      expect(a.scale).toBeLessThanOrEqual(1.4);
      expect(a.widthPx).toBeGreaterThan(20);
      expect(a.heightPx).toBeGreaterThan(60);
    }
  });
});
