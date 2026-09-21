/** Renderer: Pixi app layers, letterbox scaling, dpr per quality tier (GDD §15, §49). */
import { Container } from 'pixi.js';
import type { Application } from 'pixi.js';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../config/balance';
import { QUALITY_PROFILES, type QualityTier } from '../config/settings';

export class Renderer {
  worldRoot: Container;
  layers: {
    bg: Container;
    env: Container;
    pile: Container;
    player: Container;
    fx: Container;
    debug: Container;
  };
  tier: QualityTier = 'high';

  constructor(private app: Application) {
    this.worldRoot = new Container();
    app.stage.addChild(this.worldRoot);
    this.layers = {
      bg: new Container(),
      env: new Container(),
      pile: new Container(),
      player: new Container(),
      fx: new Container(),
      debug: new Container(),
    };
    for (const l of Object.values(this.layers)) this.worldRoot.addChild(l);
  }

  /** Letterbox: canvas CSS size preserves 720×1280 aspect; only camera framing changes. */
  resize(tier: QualityTier): number {
    this.tier = tier;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.min(w / LOGICAL_WIDTH, h / LOGICAL_HEIGHT);
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY_PROFILES[tier].dprCap);
    this.app.renderer.resize(LOGICAL_WIDTH, LOGICAL_HEIGHT, dpr);
    this.app.canvas.style.width = `${Math.round(LOGICAL_WIDTH * scale)}px`;
    this.app.canvas.style.height = `${Math.round(LOGICAL_HEIGHT * scale)}px`;
    return scale;
  }

  render(): void {
    this.app.renderer.render({ container: this.app.stage });
  }
}
