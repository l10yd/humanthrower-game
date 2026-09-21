import { describe, expect, it } from 'vitest';
import { detectCompletedRows } from '../src/gameplay/RowDetector';
import { ROWS } from '../src/config/balance';
import { ROW_CLEAR } from '../src/config/rowClear';

describe('detectCompletedRows', () => {
  it('finds rows with coverage ≥ fillCoverage (8/9)', () => {
    const cov = (r: number) => (r === 2 ? 1.0 : r === 5 ? 8 / 9 : 0.5);
    const out: number[] = [];
    expect(detectCompletedRows(cov, ROWS, ROW_CLEAR.fillCoverage, out)).toEqual([2, 5]);
  });

  it('does not detect a row at exactly 7/9', () => {
    const out: number[] = [];
    detectCompletedRows(() => 7 / 9, ROWS, ROW_CLEAR.fillCoverage, out);
    expect(out).toEqual([]);
  });

  it('multi-row: detects all completed rows in one pass', () => {
    const out: number[] = [];
    detectCompletedRows((r) => (r < 3 ? 1.0 : 0), 4, ROW_CLEAR.fillCoverage, out);
    expect(out).toEqual([0, 1, 2]);
  });

  it('reuses the scratch array without leaking previous results', () => {
    const out: number[] = [9, 9, 9];
    detectCompletedRows(() => 0, ROWS, ROW_CLEAR.fillCoverage, out);
    expect(out).toEqual([]);
  });
});
