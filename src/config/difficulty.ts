/** Difficulty director data (GDD §12): formulas + per-level archetype weights. */
import type { Rng } from '../core/Rng';

export type ArchetypeId = 'normal' | 'small' | 'tall' | 'fat' | 'light' | 'heavy';

export const DIFFICULTY = {
  levelDurationSec: 40,
  maxLevel: 7,
  spawnIntervalBase: 2.6,
  spawnIntervalPerLevel: -0.34,
  spawnIntervalFloor: 0.6,
  spawnVelocityBase: 150,
  spawnVelocityPerLevel: 34,
  targetingBase: 0.12,
  targetingPerLevel: 0.07,
  targetingCap: 0.55,
} as const;

/** Weights per level D1..D7 (GDD §12.2). */
export const LEVEL_WEIGHTS: Record<number, Partial<Record<ArchetypeId, number>>> = {
  1: { normal: 100 },
  2: { normal: 78, small: 14, light: 8 },
  3: { normal: 62, small: 16, light: 10, tall: 8, heavy: 4 },
  4: { normal: 50, small: 14, light: 10, tall: 12, heavy: 8, fat: 6 },
  5: { normal: 40, small: 12, light: 10, tall: 14, heavy: 12, fat: 12 },
  6: { normal: 34, small: 10, light: 10, tall: 14, heavy: 14, fat: 18 },
  7: { normal: 28, small: 8, light: 12, tall: 16, heavy: 16, fat: 20 },
};

const ALL_IDS: ArchetypeId[] = ['normal', 'small', 'light', 'tall', 'heavy', 'fat'];

export function levelAt(t: number): number {
  return Math.min(DIFFICULTY.maxLevel, 1 + Math.floor(t / DIFFICULTY.levelDurationSec));
}

export function spawnIntervalAt(level: number): number {
  return Math.max(DIFFICULTY.spawnIntervalFloor, DIFFICULTY.spawnIntervalBase + DIFFICULTY.spawnIntervalPerLevel * (level - 1));
}

export function spawnVelocityAt(level: number): number {
  return DIFFICULTY.spawnVelocityBase + DIFFICULTY.spawnVelocityPerLevel * (level - 1);
}

export function targetingPAt(level: number): number {
  return Math.min(DIFFICULTY.targetingCap, DIFFICULTY.targetingBase + DIFFICULTY.targetingPerLevel * (level - 1));
}

/** Weights smoothly ramped from current level toward the next one inside the level duration. */
export function weightsAt(t: number): Record<ArchetypeId, number> {
  const level = levelAt(t);
  const cur = LEVEL_WEIGHTS[Math.min(level, DIFFICULTY.maxLevel)];
  const nxt = LEVEL_WEIGHTS[Math.min(level + 1, DIFFICULTY.maxLevel)];
  const f = Math.min(1, (t % DIFFICULTY.levelDurationSec) / DIFFICULTY.levelDurationSec);
  const out = {} as Record<ArchetypeId, number>;
  for (const id of ALL_IDS) {
    const a = cur[id] ?? 0;
    const b = nxt[id] ?? 0;
    out[id] = a + (b - a) * f;
  }
  return out;
}

export function pickArchetype(rng: Rng, t: number): ArchetypeId {
  const w = weightsAt(t);
  let total = 0;
  for (const id of ALL_IDS) total += w[id];
  let r = rng.next() * total;
  for (const id of ALL_IDS) {
    r -= w[id];
    if (r <= 0) return id;
  }
  return 'normal';
}
