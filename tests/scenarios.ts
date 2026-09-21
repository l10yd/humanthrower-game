/** Deterministic spawn scenarios (GDD §53, §A step 12): seed_001..009.
 * Each scenario: fixed seed + spawn script (t, archetype, x-offset from glass centre). */
import type { ScenarioSpawn } from '../src/gameplay/HumanSpawner';
import type { ArchetypeId } from '../src/config/difficulty';

export interface Scenario {
  seed: number;
  spawns: ScenarioSpawn[];
}

function line(archetype: ArchetypeId, t: number, cols: number[]): ScenarioSpawn[] {
  // линейка: 3 человечка с широким разбросом, чтобы заполнить ряд
  return cols.map((x, i) => ({ t: t + i * 0.12, archetype, x }));
}

export const SCENARIOS: Record<string, Scenario> = {
  seed_001: {
    seed: 1001,
    spawns: [...line('normal', 0.5, [-180, 0, 180]), ...line('normal', 6, [-120, 60])],
  },
  seed_002: {
    seed: 1002,
    spawns: [...line('small', 0.5, [-200, -60, 80, 200]), ...line('small', 5, [-140, 120])],
  },
  seed_003: {
    seed: 1003,
    spawns: [...line('tall', 0.5, [-160, 160]), ...line('normal', 5.5, [-80, 80])],
  },
  seed_004: {
    seed: 1004,
    spawns: [...line('fat', 0.5, [-110, 110]), ...line('normal', 6, [-40, 40, 0])],
  },
  seed_005: {
    seed: 1005,
    spawns: [...line('light', 0.5, [-190, -60, 70, 190]), ...line('light', 4.5, [-120, 130])],
  },
  seed_006: {
    seed: 1006,
    spawns: [...line('heavy', 0.5, [-130, 130]), ...line('small', 5.5, [-60, 60])],
  },
  seed_007: {
    seed: 1007,
    spawns: [
      ...line('normal', 0.5, [-180, 0, 180]),
      ...line('small', 4, [-140, 140]),
      ...line('tall', 8, [-160, 160]),
    ],
  },
  seed_008: {
    seed: 1008,
    spawns: [
      ...line('normal', 0.5, [-150, 150]),
      ...line('fat', 5, [-110, 110]),
      ...line('light', 9, [-180, 60, 190]),
    ],
  },
  seed_009: {
    seed: 1009,
    spawns: [
      ...line('small', 0.5, [-200, -60, 80, 200]),
      ...line('heavy', 4.5, [-130, 130]),
      ...line('normal', 9, [-90, 90]),
    ],
  },
};

/** Seed-only runs: no scripted spawns — spawner drives from the difficulty curve. */
export const SEED_RUNS: Record<string, { seed: number }> = {
  run_001: { seed: 424242 },
  run_002: { seed: 777777 },
};
