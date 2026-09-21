import { describe, expect, it } from 'vitest';
import { GridManager } from '../src/gameplay/GridManager';
import { CELL, COLS, GLASS_FLOOR_Y, GLASS_LEFT, ROWS } from '../src/config/balance';

describe('GridManager', () => {
  const gm = new GridManager();

  it('maps world coords to grid cells; outside the glass → null', () => {
    expect(gm.cellAt(GLASS_LEFT, GLASS_FLOOR_Y - 1)).toEqual({ col: 0, row: 0 });
    expect(gm.cellAt(GLASS_LEFT + 67.9, GLASS_FLOOR_Y - 1)).toEqual({ col: 0, row: 0 });
    expect(gm.cellAt(GLASS_LEFT + 68, GLASS_FLOOR_Y - 1)).toEqual({ col: 1, row: 0 });
    expect(gm.cellAt(GLASS_LEFT - 0.5, GLASS_FLOOR_Y - 1)).toBeNull(); // левая стена
    expect(gm.cellAt(GLASS_LEFT + 100, GLASS_FLOOR_Y + 1)).toBeNull(); // под полом
    expect(gm.cellAt(GLASS_LEFT + 100, GLASS_FLOOR_Y - 100 * CELL)).toBeNull(); // выше сетки
  });

  it('settled part (weight 1.0) occupies its cell', () => {
    gm.reset();
    const c = gm.cellCenter(4, 3);
    gm.submit({ id: 1, x: c.x, y: c.y, angle: 0, halfW: 20, halfH: 20, weight: 1.0 });
    gm.endSample();
    expect(gm.isOccupied(4, 3)).toBe(true);
    expect(gm.occupantsAt(gm.cellIndex(4, 3))).toEqual([1]);
  });

  it('settling part (weight 0.5) fills via summed probes (GDD §33.1)', () => {
    gm.reset();
    const c = gm.cellCenter(2, 5);
    gm.submit({ id: 1, x: c.x, y: c.y, angle: 0, halfW: 20, halfH: 20, weight: 0.5 });
    gm.endSample();
    // 0.5 (центр) + 4 × 0.225 (углы) = 1.4 ≥ 0.6 → занято
    expect(gm.isOccupied(2, 5)).toBe(true);
  });

  it('falling parts are never submitted → not occupied', () => {
    gm.reset();
    gm.endSample();
    expect(gm.totalOccupied()).toBe(0);
  });

  it('rotated tall part occupies horizontal neighbours, not a big AABB (GDD §9.3 п.2)', () => {
    gm.reset();
    const halfH = 70; // 0.55 × 70 ≈ 38.5 px по x после поворота на 90°
    const a = gm.cellCenter(4, 3);
    const b = gm.cellCenter(2, 3);
    gm.submit({ id: 1, x: a.x, y: a.y, angle: Math.PI / 2, halfW: 10, halfH, weight: 1.0 });
    gm.submit({ id: 2, x: b.x, y: b.y, angle: Math.PI / 2, halfW: 10, halfH, weight: 1.0 });
    gm.endSample();
    // col 3 получает по два угла от обеих частей: 0.45×2 = 0.9 ≥ 0.6
    expect(gm.isOccupied(4, 3)).toBe(true); // центр A
    expect(gm.isOccupied(2, 3)).toBe(true); // центр B
    expect(gm.isOccupied(3, 3)).toBe(true); // сумма углов A + B
    expect(gm.isOccupied(5, 3)).toBe(true); // два угла A: 0.9
    expect(gm.isOccupied(1, 3)).toBe(true); // два угла B: 0.9
    // наклонённое тело не заполняет соседние строки (неповоротнутый AABB занял бы (4,2)/(4,4))
    expect(gm.isOccupied(4, 2)).toBe(false);
    expect(gm.isOccupied(4, 4)).toBe(false);
  });

  it('hysteresis: enter ≥ 0.6, exit < 0.4 (GDD §9.3 п.4)', () => {
    gm.reset();
    const halfH = 70;
    // заняли ячейку (4,3) центром
    let c = gm.cellCenter(4, 3);
    gm.submit({ id: 1, x: c.x, y: c.y, angle: Math.PI / 2, halfW: 10, halfH, weight: 1.0 });
    gm.endSample();
    expect(gm.isOccupied(4, 3)).toBe(true);
    // съехали так, что в ячейке остался только угол 0.45 (0.4..0.6 → гистерезис держит)
    c = gm.cellCenter(5, 3);
    gm.submit({ id: 1, x: c.x, y: c.y, angle: Math.PI / 2, halfW: 10, halfH, weight: 1.0 });
    gm.endSample();
    expect(gm.isOccupied(4, 3)).toBe(true);
    // уехали полностью → ячейка свободна
    c = gm.cellCenter(7, 3);
    gm.submit({ id: 1, x: c.x, y: c.y, angle: Math.PI / 2, halfW: 10, halfH, weight: 1.0 });
    gm.endSample();
    expect(gm.isOccupied(4, 3)).toBe(false);
  });

  it('removePart drops a destroyed part\'s cells', () => {
    gm.reset();
    const c = gm.cellCenter(1, 1);
    gm.submit({ id: 7, x: c.x, y: c.y, angle: 0, halfW: 20, halfH: 20, weight: 1.0 });
    gm.endSample();
    expect(gm.isOccupied(1, 1)).toBe(true);
    gm.removePart(7);
    gm.endSample();
    expect(gm.isOccupied(1, 1)).toBe(false);
    expect(gm.cellsOfPart(7)).toEqual([]);
  });

  it('coverage: 8/9 filled row ≥ 0.85 (GDD §9.4)', () => {
    gm.reset();
    for (let c = 0; c < COLS - 1; c++) {
      const cc = gm.cellCenter(c, 0);
      gm.submit({ id: 100 + c, x: cc.x, y: cc.y, angle: 0, halfW: 20, halfH: 20, weight: 1.0 });
    }
    gm.endSample();
    expect(gm.occupiedCount(0)).toBe(8);
    expect(gm.coverage(0)).toBeCloseTo(8 / 9, 5);
    expect(gm.coverage(1)).toBe(0);
  });

  it('grid is 9 × 13 with 68 px cells', () => {
    expect(gm.cols).toBe(COLS);
    expect(gm.rows).toBe(ROWS);
    expect(gm.cell).toBe(CELL);
    expect(gm.cellIndex(3, 2)).toBe(2 * COLS + 3);
  });
});
