/** VFX system: pooled particles, floating text, rings, slice flash, hit-stop (GDD §15.3, §31, §35). */
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { Clock } from '../core/Clock';
import { ObjectPool } from '../infra/ObjectPool';
import { COLS, CELL, GLASS_FLOOR_Y, GLASS_LEFT } from '../config/balance';

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
  spin: number;
}

interface FloatText {
  text: Text;
  life: number;
  maxLife: number;
}

interface Ring {
  g: Graphics;
  life: number;
  maxLife: number;
  maxR: number;
}

export class VfxSystem {
  private particles: ObjectPool<Particle>;
  private texts: ObjectPool<FloatText>;
  private rings: Ring[] = [];
  private sliceFlash: Sprite;
  private hitStopTimer = 0;
  private slowMoTimer = 0;
  private slowMoScale = 1;
  particleCap = 350;

  constructor(
    private fxLayer: Container,
    private clock: Clock,
    private textures: { spark: Texture; dust: Texture },
  ) {
    this.particles = new ObjectPool<Particle>(
      () => {
        const sprite = new Sprite(textures.spark);
        sprite.anchor.set(0.5);
        sprite.visible = false;
        fxLayer.addChild(sprite);
        return { sprite, vx: 0, vy: 0, life: 0, maxLife: 1, gravity: 0, spin: 0 };
      },
      (p) => {
        p.sprite.visible = false;
      },
      48,
    );
    this.texts = new ObjectPool<FloatText>(
      () => {
        const text = new Text({
          text: '',
          style: { fontFamily: 'system-ui, sans-serif', fontSize: 26, fontWeight: '700', fill: 0xffe08a },
        });
        text.anchor.set(0.5);
        text.visible = false;
        fxLayer.addChild(text);
        return { text, life: 0, maxLife: 1 };
      },
      (t) => {
        t.text.visible = false;
      },
      6,
    );
    this.sliceFlash = new Sprite(Texture.WHITE);
    this.sliceFlash.visible = false;
    this.sliceFlash.alpha = 0;
    fxLayer.addChild(this.sliceFlash);
  }

  update(dtMs: number, particleScale: number): void {
    void particleScale;
    const dt = dtMs / 1000;

    // hit-stop / slow-mo (real-time timers, GDD §31)
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dtMs;
      if (this.hitStopTimer <= 0) this.clock.timeScale = this.slowMoTimer > 0 ? this.slowMoScale : 1;
    }
    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= dtMs;
      if (this.slowMoTimer <= 0 && this.hitStopTimer <= 0) this.clock.timeScale = 1;
    }

    this.particles.forEachUsed((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.release(p);
        return;
      }
      p.vy += p.gravity * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.rotation += p.spin * dt;
      p.sprite.alpha = p.life / p.maxLife;
    });

    this.texts.forEachUsed((t) => {
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.release(t);
        return;
      }
      t.text.y -= 46 * dt;
      t.text.alpha = Math.min(1, (t.life / t.maxLife) * 2);
    });

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        r.g.destroy();
        this.rings.splice(i, 1);
        continue;
      }
      const f = 1 - r.life / r.maxLife;
      const rad = 8 + r.maxR * f;
      r.g.clear();
      r.g.circle(r.g.x, r.g.y, rad).stroke({ width: 4 * (1 - f) + 1, color: 0xffffff, alpha: 1 - f });
    }

    if (this.sliceFlash.alpha > 0) {
      this.sliceFlash.alpha = Math.max(0, this.sliceFlash.alpha - dt * 5);
      if (this.sliceFlash.alpha === 0) this.sliceFlash.visible = false;
    }
  }

  private canSpawn(): boolean {
    return this.particles.usedCount < this.particleCap;
  }

  dust(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      if (!this.canSpawn()) return;
      const p = this.particles.acquire();
      p.sprite.texture = this.textures.dust;
      p.sprite.tint = 0xcfd6e4;
      p.sprite.position.set(x + (Math.random() - 0.5) * 30, y);
      p.sprite.width = p.sprite.height = 14 + Math.random() * 16;
      p.sprite.rotation = 0;
      p.vx = (Math.random() - 0.5) * 160;
      p.vy = -40 - Math.random() * 90;
      p.gravity = 120;
      p.spin = 0;
      p.maxLife = p.life = 0.35 + Math.random() * 0.3;
      p.sprite.visible = true;
      p.sprite.alpha = 1;
    }
  }

  confetti(x: number, y: number, n: number, colors: number[]): void {
    for (let i = 0; i < n; i++) {
      if (!this.canSpawn()) return;
      const p = this.particles.acquire();
      p.sprite.texture = Texture.WHITE;
      p.sprite.tint = colors[i % colors.length];
      p.sprite.position.set(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40);
      p.sprite.width = 7 + Math.random() * 6;
      p.sprite.height = 10 + Math.random() * 8;
      p.vx = (Math.random() - 0.5) * 320;
      p.vy = -120 - Math.random() * 260;
      p.gravity = 700;
      p.spin = (Math.random() - 0.5) * 12;
      p.maxLife = p.life = 0.5 + Math.random() * 0.45;
      p.sprite.visible = true;
      p.sprite.alpha = 1;
    }
  }

  sparkles(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      if (!this.canSpawn()) return;
      const p = this.particles.acquire();
      p.sprite.texture = this.textures.spark;
      p.sprite.tint = 0xfff2b0;
      p.sprite.position.set(x + (Math.random() - 0.5) * CELL, y + (Math.random() - 0.5) * CELL);
      p.sprite.width = p.sprite.height = 8 + Math.random() * 10;
      p.sprite.rotation = 0;
      p.vx = (Math.random() - 0.5) * 220;
      p.vy = (Math.random() - 0.5) * 220;
      p.gravity = 0;
      p.spin = 0;
      p.maxLife = p.life = 0.25 + Math.random() * 0.25;
      p.sprite.visible = true;
      p.sprite.alpha = 1;
    }
  }

  ring(x: number, y: number, maxR: number): void {
    const g = new Graphics();
    g.position.set(x, y);
    g.circle(0, 0, 8).stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
    this.fxLayer.addChild(g);
    this.rings.push({ g, life: 0.4, maxLife: 0.4, maxR });
  }

  /** Row clear slice: full-row flash + sparkles (GDD §31). */
  slice(row: number, combo: number): void {
    const y = GLASS_FLOOR_Y - (row + 1) * CELL;
    this.sliceFlash.visible = true;
    this.sliceFlash.position.set(GLASS_LEFT, y);
    this.sliceFlash.width = COLS * CELL;
    this.sliceFlash.height = CELL;
    this.sliceFlash.alpha = 0.55;
    this.sliceFlash.tint = 0xffffff;
    this.sparkles(GLASS_LEFT + (COLS * CELL) / 2, y + CELL / 2, Math.min(26, 10 + combo * 3));
  }

  floating(text: string, x: number, y: number, color: number): void {
    const t = this.texts.acquire();
    t.text.text = text;
    t.text.style.fill = color;
    t.text.position.set(x, y);
    t.text.alpha = 1;
    t.maxLife = t.life = 0.9;
    t.text.visible = true;
  }

  /** Hit-stop 60 ms on row clear (GDD §31). */
  hitStop(ms: number): void {
    this.hitStopTimer = Math.max(this.hitStopTimer, ms);
    this.clock.timeScale = 0;
  }

  slowMo(scale: number, sec: number): void {
    this.slowMoScale = scale;
    this.slowMoTimer = sec * 1000;
    if (this.hitStopTimer <= 0) this.clock.timeScale = scale;
  }

  reset(): void {
    const doomed: Particle[] = [];
    this.particles.forEachUsed((p) => doomed.push(p));
    for (const p of doomed) this.particles.release(p);
    const tDoomed: FloatText[] = [];
    this.texts.forEachUsed((t) => tDoomed.push(t));
    for (const t of tDoomed) this.texts.release(t);
    for (const r of this.rings) r.g.destroy();
    this.rings = [];
    this.sliceFlash.visible = false;
    this.sliceFlash.alpha = 0;
    this.hitStopTimer = 0;
    this.slowMoTimer = 0;
    this.clock.timeScale = 1;
  }
}
