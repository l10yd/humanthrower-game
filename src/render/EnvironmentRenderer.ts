/** Environment: laboratory glass tube, floor, pedestal, row guides, danger/warning visuals (GDD §15.4, §9.1). */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import {
  CELL,
  DANGER_LINE_Y,
  GLASS_FLOOR_Y,
  GLASS_LEFT,
  GLASS_TOP,
  GLASS_W,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  ROWS,
  WARNING_ROW,
} from '../config/balance';
import { linearGradientTexture } from './AtlasFactory';

export interface EnvFrameState {
  warningRows: number[];
  dangerousRows: number[];
  dangerActive: boolean;
  dangerLevel: number;
  dtMs: number;
}

export class EnvironmentRenderer {
  private dangerLine: Graphics;
  private warningLine: Graphics;
  private dangerVignette: Sprite;
  private highlights = new Map<number, Sprite>();
  private time = 0;

  constructor(private envLayer: Container) {
    this.buildStatic();
    this.dangerLine = this.makeLine(DANGER_LINE_Y, 0xff4c5c, 3);
    this.warningLine = this.makeLine(GLASS_FLOOR_Y - WARNING_ROW * CELL, 0xffd24c, 2);
    this.dangerVignette = new Sprite(linearGradientTexture(64, 512, 'rgba(255,76,92,0.55)', 'rgba(255,76,92,0)'));
    this.dangerVignette.position.set(GLASS_LEFT - 12, GLASS_TOP - 40);
    this.dangerVignette.width = GLASS_W + 24;
    this.dangerVignette.height = 512;
    this.dangerVignette.alpha = 0;
    this.envLayer.addChild(this.dangerVignette);
  }

  private buildStatic(): void {
    // background gradient
    const bg = new Sprite(linearGradientTexture(64, 128, '#161c30', '#0a0d18'));
    bg.width = LOGICAL_WIDTH;
    bg.height = LOGICAL_HEIGHT;
    this.envLayer.addChild(bg);

    const g = new Graphics();
    // interior soft shapes
    g.ellipse(170, 520, 150, 95).fill({ color: 0x1b2340, alpha: 0.45 });
    g.ellipse(570, 820, 165, 105).fill({ color: 0x182036, alpha: 0.45 });
    // pedestal under the glass
    g.rect(GLASS_LEFT - 26, GLASS_FLOOR_Y, GLASS_W + 52, LOGICAL_HEIGHT - GLASS_FLOOR_Y).fill({ color: 0x232b45 });
    g.rect(GLASS_LEFT - 26, GLASS_FLOOR_Y, GLASS_W + 52, 7).fill({ color: 0x3a4568 });
    g.rect(GLASS_LEFT + 40, GLASS_FLOOR_Y + 60, GLASS_W - 80, 10).fill({ color: 0x2c3552 });
    // glass walls + top rim
    g.rect(GLASS_LEFT - 11, GLASS_TOP - 44, 14, GLASS_FLOOR_Y - GLASS_TOP + 44).fill({ color: 0xbfd4ff, alpha: 0.13 });
    g.rect(GLASS_LEFT + GLASS_W - 3, GLASS_TOP - 44, 14, GLASS_FLOOR_Y - GLASS_TOP + 44).fill({ color: 0xbfd4ff, alpha: 0.13 });
    g.rect(GLASS_LEFT - 11, GLASS_TOP - 44, GLASS_W + 22, 12).fill({ color: 0xbfd4ff, alpha: 0.18 });
    // soft inner shadow at glass bottom
    g.rect(GLASS_LEFT, GLASS_FLOOR_Y - 70, GLASS_W, 70).fill({ color: 0x000000, alpha: 0.14 });
    // row guides
    for (let r = 1; r < ROWS; r++) {
      const y = GLASS_FLOOR_Y - r * CELL;
      g.moveTo(GLASS_LEFT + 6, y).lineTo(GLASS_LEFT + GLASS_W - 6, y).stroke({ width: 1, color: 0xffffff, alpha: 0.05 });
    }
    this.envLayer.addChild(g);
  }

  private makeLine(y: number, color: number, width: number): Graphics {
    const g = new Graphics();
    for (let x = GLASS_LEFT + 4; x < GLASS_LEFT + GLASS_W - 4; x += 20) {
      g.moveTo(x, y).lineTo(Math.min(x + 11, GLASS_LEFT + GLASS_W - 4), y);
    }
    g.stroke({ width, color });
    this.envLayer.addChild(g);
    return g;
  }

  private rowY(row: number): number {
    return GLASS_FLOOR_Y - (row + 1) * CELL;
  }

  update(state: EnvFrameState): void {
    this.time += state.dtMs / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6.5);
    this.dangerLine.alpha = state.dangerActive ? 0.45 + 0.55 * pulse : 0.55;
    this.warningLine.alpha = state.dangerActive ? 0.25 : 0.35 + 0.25 * pulse;

    const active = new Set<number>(state.warningRows);
    for (const r of state.dangerousRows) active.add(r);
    for (const [row, sprite] of [...this.highlights]) {
      if (!active.has(row)) {
        sprite.destroy();
        this.highlights.delete(row);
      }
    }
    for (const row of state.warningRows) {
      const s = this.getHighlight(row);
      s.tint = 0xffd24c;
      s.alpha = 0.1 + 0.12 * pulse;
    }
    for (const row of state.dangerousRows) {
      const s = this.getHighlight(row);
      s.tint = 0xff4c5c;
      s.alpha = 0.18 + 0.18 * pulse;
    }
    const bandFrac = state.dangerActive ? 1 : Math.max(0, state.dangerLevel - 1) / 6;
    this.dangerVignette.alpha = 0.1 * bandFrac + (state.dangerActive ? 0.14 : 0);
  }

  private getHighlight(row: number): Sprite {
    let s = this.highlights.get(row);
    if (!s) {
      s = new Sprite(Texture.WHITE);
      s.position.set(GLASS_LEFT, this.rowY(row));
      s.width = GLASS_W;
      s.height = CELL;
      this.envLayer.addChild(s);
      this.highlights.set(row, s);
    }
    return s;
  }

  reset(): void {
    for (const [, sprite] of [...this.highlights]) sprite.destroy();
    this.highlights.clear();
    this.dangerVignette.alpha = 0;
  }
}
