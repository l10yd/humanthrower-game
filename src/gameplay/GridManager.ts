/** Grid manager: abstract occupancy layer under the physics (GDD §9.3, §33.1). Pure module —
 * no engine imports, fully unit-testable. */
import { CELL, COLS, GLASS_FLOOR_Y, GLASS_LEFT, ROWS } from '../config/balance';

export interface OccupancySubmit {
  id: number;
  x: number;
  y: number;
  angle: number;
  halfW: number;
  halfH: number;
  /** settleable weight: FALLING 0, SETTLING 0.5, SETTLED 1.0 (GDD §9.3 п.5) */
  weight: number;
}

export interface GridConfig {
  cols: number;
  rows: number;
  cell: number;
  originX: number;
  floorY: number;
}

export const GRID_DEFAULTS: GridConfig = { cols: COLS, rows: ROWS, cell: CELL, originX: GLASS_LEFT, floorY: GLASS_FLOOR_Y };

const ENTER = 0.6;
const EXIT = 0.4;

/** Probe weights: centre 1.0 + 4 corners at 0.55 × half-extents (oriented, GDD §9.3 п.2). */
const CORNER = 0.55;
const CORNER_WEIGHT = 0.45;

export class GridManager {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  private originX: number;
  private floorY: number;
  private partCells = new Map<number, number[]>();
  private occupants: Set<number>[] = [];
  occupied: Uint8Array;
  private scratch = new Map<number, number>();

  constructor(cfg: GridConfig = GRID_DEFAULTS) {
    this.cols = cfg.cols;
    this.rows = cfg.rows;
    this.cell = cfg.cell;
    this.originX = cfg.originX;
    this.floorY = cfg.floorY;
    this.occupied = new Uint8Array(cfg.cols * cfg.rows);
    for (let i = 0; i < cfg.cols * cfg.rows; i++) this.occupants.push(new Set<number>());
  }

  reset(): void {
    this.partCells.clear();
    for (const s of this.occupants) s.clear();
    this.occupied.fill(0);
  }

  cellAt(x: number, y: number): { col: number; row: number } | null {
    const col = Math.floor((x - this.originX) / this.cell);
    const row = Math.floor((this.floorY - y) / this.cell);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;
    return { col, row };
  }

  cellIndex(col: number, row: number): number {
    return row * this.cols + col;
  }

  cellCenter(col: number, row: number): { x: number; y: number } {
    return { x: this.originX + (col + 0.5) * this.cell, y: this.floorY - (row + 0.5) * this.cell };
  }

  /** Submit one core part: oriented probes → cells, committed with hysteresis. */
  submit(part: OccupancySubmit): void {
    const { id, x, y, angle, halfW, halfH, weight } = part;
    this.scratch.clear();
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const probes: Array<[number, number, number]> = [
      [0, 0, 1.0],
      [CORNER * halfW, CORNER * halfH, CORNER_WEIGHT],
      [-CORNER * halfW, CORNER * halfH, CORNER_WEIGHT],
      [CORNER * halfW, -CORNER * halfH, CORNER_WEIGHT],
      [-CORNER * halfW, -CORNER * halfH, CORNER_WEIGHT],
    ];
    for (const [lx, ly, w] of probes) {
      const wx = x + lx * cos - ly * sin;
      const wy = y + lx * sin + ly * cos;
      const c = this.cellAt(wx, wy);
      if (!c) continue;
      const idx = this.cellIndex(c.col, c.row);
      // GDD §33.1: transient[col][row] += probeWeight × stateWeight (FALLING 0 / SETTLING 0.5 / SETTLED 1.0)
      this.scratch.set(idx, (this.scratch.get(idx) ?? 0) + w * weight);
    }
    const old = this.partCells.get(id) ?? [];
    const next: number[] = [];
    for (const [idx, w] of this.scratch) {
      if (w >= ENTER) next.push(idx);
      else if (w >= EXIT && old.includes(idx)) next.push(idx);
    }
    this.partCells.set(id, next);
  }

  /** Rebuild occupancy from partCells (end of a sampling pass). */
  endSample(): void {
    for (const s of this.occupants) s.clear();
    for (const [id, cells] of this.partCells) {
      for (const idx of cells) this.occupants[idx].add(id);
    }
    for (let i = 0; i < this.occupied.length; i++) {
      this.occupied[i] = this.occupants[i].size > 0 ? 1 : 0;
    }
  }

  /** Drop a destroyed part's cells. */
  removePart(id: number): void {
    this.partCells.delete(id);
  }

  occupiedCount(row: number): number {
    if (row < 0 || row >= this.rows) return 0;
    let n = 0;
    for (let c = 0; c < this.cols; c++) n += this.occupied[this.cellIndex(c, row)];
    return n;
  }

  coverage(row: number): number {
    return this.occupiedCount(row) / this.cols;
  }

  cellsOfPart(id: number): number[] {
    return this.partCells.get(id) ?? [];
  }

  occupantsAt(cellIndex: number): number[] {
    const s = this.occupants[cellIndex];
    return s ? [...s] : [];
  }

  isOccupied(col: number, row: number): boolean {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
    return this.occupied[this.cellIndex(col, row)] === 1;
  }

  totalOccupied(): number {
    let n = 0;
    for (let i = 0; i < this.occupied.length; i++) n += this.occupied[i];
    return n;
  }
}
