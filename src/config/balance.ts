/** Logical world layout & global physics constants (GDD §8.2, §9.1, §32). All values are tuning values. */
export const LOGICAL_WIDTH = 720;
export const LOGICAL_HEIGHT = 1280;

export const COLS = 9;
export const ROWS = 13;
export const CELL = 68;
export const GLASS_W = COLS * CELL; // 612
export const GLASS_LEFT = (LOGICAL_WIDTH - GLASS_W) / 2; // 54
export const GLASS_TOP = 204;
export const GLASS_FLOOR_Y = GLASS_TOP + ROWS * CELL; // 1088 — player run surface
export const WALL_THICKNESS = 32;
export const SPAWN_Y = 150; // внутри spawn-зоны (y 64..204)

/** Danger band: rows >= DANGER_ROW (danger line at 82% glass height, GDD §9.1). */
export const DANGER_ROW = 10;
export const WARNING_ROW = 8;
export const DANGER_LINE_Y = GLASS_FLOOR_Y - 0.82 * (ROWS * CELL); // ≈ 363

/** Global physics caps & policy constants (GDD §8.2, §8.5, §8.6). */
export const PHYS = {
  gravity: 1800,
  fixedHz: 60,
  maxSubsteps: 3,
  maxLinearVelocity: 2600,
  maxAngularVelocity: 14,
  maxImpactDv: 1200,
  /** Sleep policy: |v|<sleepLinVel && |ω|<sleepAngVel && contact && sleepSec → sleep(). */
  sleepLinVel: 26,
  sleepAngVel: 0.35,
  sleepSec: 0.6,
  /** Wake conditions (§7.2). */
  wakeDv: 140,
  wakeAngVel: 2.5,
  /** Landing detection: Δv over one step. */
  landingDv: 300,
  landingDampTime: 0.4,
  settlingLinVel: 160,
  contactDamp: 0.985,
  ccdSpeedThreshold: 900,
  /** Max core units (humans + pieces) in the glass (StackManager cap). */
  maxCoreUnits: 34,
  /** Grace periods (§14.1). */
  overflowGraceSec: 2.5,
  trappedGraceSec: 4,
  spawnBlockedGraceSec: 6,
} as const;
