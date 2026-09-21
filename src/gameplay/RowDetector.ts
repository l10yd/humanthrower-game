/** Row completion detection from grid occupancy (GDD §9.4). Pure function. */

export function detectCompletedRows(
  coverage: (row: number) => number,
  rows: number,
  fillCoverage: number,
  out: number[],
): number[] {
  out.length = 0;
  for (let r = 0; r < rows; r++) {
    if (coverage(r) >= fillCoverage) out.push(r);
  }
  return out;
}
