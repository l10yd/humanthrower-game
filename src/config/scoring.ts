/** Score system data (GDD §13). Skillful play pays 4–8× more than passive survival. */
export const SCORE = {
  survivePerSecond: 12,
  rowClear: 120,
  multiRowExtra: 180,
  comboBonus: 0.35,
  comboCap: 4,
  comboDecaySec: 5,
  dodge: 20,
  stompPerBody: 6,
  stompCap: 30,
  riskyClear: 60,
  physicsMoment: 15,
} as const;

export function comboMultiplier(combo: number): number {
  if (combo <= 0) return 1;
  return Math.min(SCORE.comboCap, 1 + SCORE.comboBonus * (combo - 1));
}
