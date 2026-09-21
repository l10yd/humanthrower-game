/** Row clear timing & thresholds (GDD §10). Tuning values. */
export const ROW_CLEAR = {
  /** Row completion coverage threshold: 0.85 → 8/9 cells (one-ragdoll-gap tolerance). */
  fillCoverage: 0.85,
  warningSec: 0.45,
  dangerousSec: 0.7,
  clearSec: 0.15,
  recomposeSec: 0.15,
  /** Slice rule: torso/pelvis destroyed when cleared rows cover ≥ 50% of its cells. */
  sliceCoverage: 0.5,
  /** Head edge threshold (Case C): head centre must be within row by this margin. */
  headEdgeCells: 0.5,
} as const;
