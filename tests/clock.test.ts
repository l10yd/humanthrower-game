import { describe, expect, it } from 'vitest';
import { Clock } from '../src/core/Clock';

describe('Clock (fixed timestep, GDD §8.1)', () => {
  it('runs exactly one step per 16.7 ms frame at 60 Hz', () => {
    const clock = new Clock(1 / 60, 3);
    let steps = 0;
    let t = 0;
    for (let i = 0; i < 60; i++) {
      t += 16.7;
      clock.frame(t, () => steps++);
    }
    expect(steps).toBe(60);
  });

  it('accumulator: 33.4 ms frame → 2 steps', () => {
    const clock = new Clock(1 / 60, 3);
    let steps = 0;
    clock.frame(33.4, () => steps++);
    expect(steps).toBe(2);
  });

  it('maxSubsteps=3: frame farther drops the remainder (honest slowdown)', () => {
    const clock = new Clock(1 / 60, 3);
    let steps = 0;
    const alpha = clock.frame(200, () => steps++);
    expect(steps).toBe(3);
    expect(alpha).toBe(0); // остаток сброшен — без catch-up спайка
  });

  it('interpolation alpha in [0, 1)', () => {
    const clock = new Clock(1 / 60, 3);
    let t = 0;
    for (let i = 0; i < 30; i++) {
      t += 13; // ~78 fps → каждый кадр < шага
      const alpha = clock.frame(t, () => {});
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('timeScale 0 (hit-stop) freezes steps; slow-mo scales time', () => {
    const clock = new Clock(1 / 60, 3);
    clock.timeScale = 0;
    let steps = 0;
    clock.frame(100, () => steps++);
    expect(steps).toBe(0);
    clock.timeScale = 0.25;
    clock.frame(200, () => steps++); // 100×0.25 = 25 мс → 1 шаг (остаток 8.3 мс)
    expect(steps).toBe(1);
    clock.frame(300, () => steps++); // 25 мс + остаток = 33.3 мс → 2 шага
    expect(steps).toBe(3);
    clock.timeScale = 1;
    clock.frame(400, () => steps++); // 100 мс → 3 шага (maxSubsteps), остаток сброшен
    expect(steps).toBe(6);
  });

  it('reset() clears the accumulator', () => {
    const clock = new Clock(1 / 60, 3);
    clock.frame(50, () => {});
    clock.reset();
    let steps = 0;
    clock.frame(66.7, () => steps++);
    expect(steps).toBe(1);
  });

  it('tracks fps', () => {
    const clock = new Clock(1 / 60, 3);
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += 16.7;
      clock.frame(t, () => {});
    }
    expect(clock.fps).toBeCloseTo(60, 0);
  });
});
