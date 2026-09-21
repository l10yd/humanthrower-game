import { describe, expect, it } from 'vitest';
import { ScoreSystem } from '../src/gameplay/ScoreSystem';
import { Save } from '../src/infra/Save';
import { SCORE, comboMultiplier } from '../src/config/scoring';

describe('ScoreSystem', () => {
  it('passive survival: +12/s (GDD §13.1)', () => {
    const s = new ScoreSystem(new Save());
    s.update(1);
    expect(s.score).toBeCloseTo(SCORE.survivePerSecond, 3);
    s.update(0.5);
    expect(s.score).toBeCloseTo(SCORE.survivePerSecond * 1.5, 3);
  });

  it('row clear: 120 × combo, multi-row +180/extra', () => {
    const s = new ScoreSystem(new Save());
    s.onClear(1, false, 100, 100);
    expect(s.score).toBe(120);
    s.update(0.1); // combo ещё жив
    s.onClear(3, false, 100, 100);
    // combo = 1 + 3 = 4 → mult = min(4, 1 + 0.35×3) = 2.05 → 246 + 360; плюс 12×0.1 от update
    expect(s.score).toBeCloseTo(120 + 12 * 0.1 + Math.round(120 * 2.05) + 180 * 2, 3);
  });

  it('combo multiplier caps at ×4 and decays after 5 s', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(1)).toBeCloseTo(1, 5);
    expect(comboMultiplier(4)).toBeCloseTo(2.05, 5);
    expect(comboMultiplier(100)).toBe(SCORE.comboCap);
    const s = new ScoreSystem(new Save());
    s.onClear(1, false, 0, 0);
    expect(s.combo).toBe(1);
    s.update(5.1);
    expect(s.combo).toBe(0);
  });

  it('stomp pays 6/body capped at 30 (GDD §13.2)', () => {
    const s = new ScoreSystem(new Save());
    s.onStomp(3);
    expect(s.score).toBe(18);
    s.onStomp(10);
    expect(s.score).toBe(18 + SCORE.stompCap);
  });

  it('risky clear, dodge, physics moment', () => {
    const s = new ScoreSystem(new Save());
    s.onClear(1, true, 0, 0);
    expect(s.score).toBe(120 + SCORE.riskyClear);
    s.onDodge(0, 0);
    expect(s.score).toBe(120 + SCORE.riskyClear + SCORE.dodge);
    s.onPhysicsMoment(0, 0);
    expect(s.score).toBe(120 + SCORE.riskyClear + SCORE.dodge + SCORE.physicsMoment);
  });

  it('best score tracks maximum and persists via Save', () => {
    const save = new Save();
    const s = new ScoreSystem(save);
    s.add(500);
    expect(s.best).toBe(500);
    expect(s.newBest).toBe(true);
    save.data.bestScore = Math.floor(s.best);
    const s2 = new ScoreSystem(save);
    expect(s2.best).toBe(500);
  });

  it('floating events queue drains', () => {
    const s = new ScoreSystem(new Save());
    s.onDodge(10, 20);
    s.onClear(1, false, 0, 0);
    expect(s.events.size).toBe(2);
    const drained = s.events.drain();
    expect(drained.length).toBe(2);
    expect(drained[0].text).toBe('DODGE');
    expect(s.events.size).toBe(0);
  });

  it('snapshot reports integer score/best and combo fraction', () => {
    const s = new ScoreSystem(new Save());
    s.add(12.7);
    s.onClear(1, false, 0, 0);
    const snap = s.snapshot();
    expect(snap.score).toBe(Math.floor(s.score));
    expect(snap.mult).toBeCloseTo(1, 5);
    expect(snap.comboFrac).toBeCloseTo(1, 5);
    expect(snap.newBest).toBe(true);
  });
});
