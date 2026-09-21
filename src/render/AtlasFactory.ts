/** Procedural texture atlas — built at boot, zero external assets (GDD §15, §46).
 * White shapes for tinting + canvas-gradient soft textures. */
import { Graphics, RenderTexture, Texture } from 'pixi.js';
import type { Application } from 'pixi.js';

export interface Atlas {
  torso: Texture;
  pelvis: Texture;
  limb: Texture;
  head: Texture;
  hair: Texture[];
  faces: Texture[]; // [normal, terror, concussion, ko, scream, dead, run]
  shadow: Texture;
  dust: Texture;
  spark: Texture;
}

/** Индексы выражений лиц (GDD §15.2): состояние-driven выбор в HumanRenderer/PlayerRenderer. */
export const FACE = { normal: 0, terror: 1, concussion: 2, ko: 3, scream: 4, dead: 5, run: 6 } as const;

/** Soft radial-gradient texture via Canvas2D (reliable across browsers). */
export function radialGradientTexture(size: number, inner: string, outer: string): Texture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(c);
}

/** Vertical linear-gradient texture via Canvas2D. */
export function linearGradientTexture(w: number, h: number, top: string, bottom: string): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return Texture.from(c);
}

function bake(app: Application, draw: (g: Graphics) => void, w: number, h: number): Texture {
  const g = new Graphics();
  draw(g);
  const rt = RenderTexture.create({ width: w, height: h, resolution: 2 });
  app.renderer.render({ container: g, target: rt, clear: true });
  g.destroy();
  return rt;
}

export function buildAtlas(app: Application): Atlas {
  // capsule-ish torso (white → tint)
  const torso = bake(app, (g) => {
    g.roundRect(2, 2, 44, 60, 21).fill({ color: 0xffffff });
    g.roundRect(2, 44, 44, 18, 10).fill({ color: 0xcccccc });
  }, 48, 64);
  // pelvis (white → tint)
  const pelvis = bake(app, (g) => {
    g.roundRect(2, 2, 28, 42, 13).fill({ color: 0xffffff });
  }, 32, 46);
  // thin limb (white → tint)
  const limb = bake(app, (g) => {
    g.roundRect(2, 2, 11, 32, 5.5).fill({ color: 0xffffff });
  }, 15, 36);
  // head (white → tint)
  const head = bake(app, (g) => {
    g.circle(20, 20, 18).fill({ color: 0xffffff });
  }, 40, 40);
  // hair styles (white → tint)
  const hair: Texture[] = [
    bake(app, (g) => { g.roundRect(2, 6, 36, 12, 8).fill({ color: 0xffffff }); }, 40, 20), // cap
    bake(app, (g) => { // spikes
      g.moveTo(2, 18).lineTo(8, 4).lineTo(14, 14).lineTo(20, 2).lineTo(26, 14).lineTo(32, 4).lineTo(38, 18).lineTo(2, 18).fill({ color: 0xffffff });
    }, 40, 20),
    bake(app, (g) => { g.circle(20, 8, 8).fill({ color: 0xffffff }); g.roundRect(2, 10, 36, 8, 4).fill({ color: 0xffffff }); }, 40, 20), // bun
    bake(app, (g) => { g.roundRect(8, 2, 4, 4, 2).fill({ color: 0xffffff }); }, 40, 20), // bald stub
    bake(app, (g) => { g.roundRect(2, 2, 36, 14, 7).fill({ color: 0xffffff }); g.roundRect(2, 12, 8, 16, 4).fill({ color: 0xffffff }); g.roundRect(30, 12, 8, 16, 4).fill({ color: 0xffffff }); }, 40, 30), // long
  ];
  // faces (black на прозрачном): полилинии с ЯВНЫМ moveTo — без arc() (v8 рисует соединительную
  // линию от текущей точки пути → диагональная артефакт-линия через лицо)
  const INK = 0x1a1a22;
  /** Полилиния-дуга: явный moveTo + lineTo по сегментам. */
  const arcPolyline = (g: Graphics, cx: number, cy: number, r: number, a0: number, a1: number, segments = 8): void => {
    for (let i = 0; i <= segments; i++) {
      const a = a0 + ((a1 - a0) * i) / segments;
      const px = cx + r * Math.cos(a);
      const py = cy + r * Math.sin(a);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
  };
  const dot = (g: Graphics, x: number, y: number, r: number): void => {
    g.circle(x, y, r).fill({ color: INK });
  };
  const faces: Texture[] = [
    bake(app, (g) => { // 0 normal (стоит)
      dot(g, 13, 13, 2.2);
      dot(g, 27, 13, 2.2);
      arcPolyline(g, 20, 17, 7, 0.5, Math.PI - 0.5);
      g.stroke({ width: 2, color: INK });
    }, 40, 32),
    bake(app, (g) => { // 1 terror (летит): широкие глаза + открытый рот
      dot(g, 12, 12, 3);
      dot(g, 28, 12, 3);
      g.ellipse(20, 24, 4.5, 5.5).fill({ color: INK });
    }, 40, 32),
    bake(app, (g) => { // 2 concussion (ударился): звёздочки-глаза + волнистый рот
      g.moveTo(13, 9).lineTo(13, 17).moveTo(9.5, 11).lineTo(16.5, 15).moveTo(16.5, 11).lineTo(9.5, 15);
      g.moveTo(27, 9).lineTo(27, 17).moveTo(23.5, 11).lineTo(30.5, 15).moveTo(30.5, 11).lineTo(23.5, 15);
      g.stroke({ width: 1.8, color: INK });
      g.moveTo(13, 24).lineTo(16, 22).lineTo(20, 25).lineTo(24, 22).lineTo(27, 24);
      g.stroke({ width: 2, color: INK });
    }, 40, 32),
    bake(app, (g) => { // 3 ko (лежит в отключке): закрытые глаза + прямой рот
      g.moveTo(10, 14).lineTo(16, 14);
      g.moveTo(24, 14).lineTo(30, 14);
      g.stroke({ width: 2, color: INK });
      g.moveTo(15, 24).lineTo(25, 24);
      g.stroke({ width: 2, color: INK });
    }, 40, 32),
    bake(app, (g) => { // 4 scream (орет): широкие глаза + большой открытый рот
      dot(g, 12, 11, 3.2);
      dot(g, 28, 11, 3.2);
      g.ellipse(20, 23, 6, 7).fill({ color: INK });
    }, 40, 32),
    bake(app, (g) => { // 5 dead (умер): X-крестики + язык высунут
      g.moveTo(9, 10).lineTo(16, 16).moveTo(16, 10).lineTo(9, 16);
      g.moveTo(24, 10).lineTo(31, 16).moveTo(31, 10).lineTo(24, 16);
      g.stroke({ width: 2, color: INK });
      g.roundRect(17, 22, 6, 8, 3).fill({ color: INK });
    }, 40, 32),
    bake(app, (g) => { // 6 run (бежит): решимость — брови + улыбка
      g.moveTo(9, 9).lineTo(16, 12);
      g.moveTo(31, 9).lineTo(24, 12);
      g.stroke({ width: 2, color: INK });
      dot(g, 13, 16, 2.2);
      dot(g, 27, 16, 2.2);
      arcPolyline(g, 20, 19, 7, 0.4, Math.PI - 0.4);
      g.stroke({ width: 2, color: INK });
    }, 40, 32),
  ];
  // soft shadow / dust / spark
  const shadow = radialGradientTexture(128, 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0)');
  const dust = radialGradientTexture(64, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
  const spark = radialGradientTexture(32, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)');

  return { torso, pelvis, limb, head, hair, faces, shadow, dust, spark };
}
