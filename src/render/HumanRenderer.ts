/** Human renderer: per-part nodes from physics transforms — physics → pose → render (GDD §15, §46). */
import { Container, Sprite } from 'pixi.js';
import { FACE } from './AtlasFactory';
import type { Atlas } from './AtlasFactory';
import type { PartRecord, RagdollSystem } from '../gameplay/RagdollSystem';

interface PartNode {
  container: Container;
  face: Sprite | null;
}

function shortAngle(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function darken(color: number, f = 0.62): number {
  const r = Math.round(((color >> 16) & 0xff) * f);
  const g = Math.round(((color >> 8) & 0xff) * f);
  const b = Math.round((color & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}

export class HumanRenderer {
  private nodes = new Map<number, PartNode>();

  constructor(
    private pile: Container,
    private atlas: Atlas,
  ) {}

  /** Sync render nodes with alive physics parts (nodes are tiny; spawn rate ~1/s — negligible). */
  sync(ragdolls: RagdollSystem): void {
    const alive = new Set<number>();
    for (const p of ragdolls.parts.values()) {
      if (!p.alive) continue;
      alive.add(p.id);
      if (!this.nodes.has(p.id)) this.nodes.set(p.id, this.makeNode(p));
    }
    for (const [id, node] of [...this.nodes]) {
      if (!alive.has(id)) {
        node.container.destroy({ children: true });
        this.nodes.delete(id);
      }
    }
  }

  private makeNode(p: PartRecord): PartNode {
    const c = new Container();
    const w = p.halfW * 2;
    const h = p.halfH * 2;
    let face: Sprite | null = null;

    if (p.role === 'head') {
      const body = new Sprite(this.atlas.head);
      body.anchor.set(0.5);
      body.width = w;
      body.height = h;
      body.tint = p.variant.skin;
      c.addChild(body);
      const hair = new Sprite(this.atlas.hair[p.variant.hairStyle % this.atlas.hair.length]);
      hair.anchor.set(0.5);
      hair.width = w * 1.22;
      hair.height = w * 0.72;
      hair.position.y = -h * 0.44;
      hair.tint = p.variant.hairColor;
      c.addChild(hair);
      face = new Sprite(this.atlas.faces[0]);
      face.anchor.set(0.5);
      face.width = w * 0.85;
      face.height = w * 0.55;
      face.position.y = h * 0.14;
      c.addChild(face);
    } else if (p.role === 'torso') {
      const body = new Sprite(this.atlas.torso);
      body.anchor.set(0.5);
      body.width = w;
      body.height = h;
      body.tint = p.variant.shirt;
      c.addChild(body);
      const shade = new Sprite(this.atlas.limb);
      shade.anchor.set(0.5);
      shade.width = w * 0.62;
      shade.height = h * 0.34;
      shade.position.y = h * 0.16;
      shade.tint = darken(p.variant.shirt);
      shade.alpha = 0.55;
      c.addChild(shade);
    } else if (p.role === 'legs') {
      const body = new Sprite(this.atlas.pelvis);
      body.anchor.set(0.5);
      body.width = w;
      body.height = h;
      body.tint = p.variant.pants;
      c.addChild(body);
    } else {
      const body = new Sprite(this.atlas.limb);
      body.anchor.set(0.5);
      // минимальная видимая ширина: конечности не должны теряться (GDD §15.1)
      body.width = Math.max(w, 13);
      body.height = h;
      body.tint = p.humanId === null ? darken(p.variant.skin, 0.8) : p.variant.skin;
      c.addChild(body);
    }

    this.pile.addChild(c);
    return { container: c, face };
  }

  update(alpha: number, ragdolls: RagdollSystem): void {
    for (const [id, node] of this.nodes) {
      const p = ragdolls.part(id);
      if (!p || !p.alive) continue;
      const ix = p.prevX + (p.curX - p.prevX) * alpha;
      const iy = p.prevY + (p.curY - p.prevY) * alpha;
      const iang = p.prevAngle + shortAngle(p.prevAngle, p.curAngle) * alpha;
      node.container.position.set(ix, iy);
      node.container.rotation = iang;
      // squash & stretch — visual only, from impact impulse (GDD §15.3)
      if (p.lastImpactDv > 260 && p.state !== 'settled') {
        const k = Math.min(0.14, p.lastImpactDv / 4500);
        node.container.scale.set(1 + k, 1 - k);
      } else {
        node.container.scale.set(1, 1);
      }
      if (node.face) {
        // выражения лиц (GDD §15.2): состояние-driven
        let faceIdx: number;
        if (p.isPiece && p.role === 'head') faceIdx = FACE.dead; // голова отсоединилась — умер
        else if (p.exprTimer > 0) faceIdx = FACE.concussion; // контузия после удара
        else if (p.state === 'falling') faceIdx = FACE.terror; // летит — ужас
        else if (p.state === 'landing') faceIdx = FACE.concussion; // ударился
        else if (p.state === 'settling') faceIdx = FACE.scream; // шевелится — орет
        else faceIdx = FACE.ko; // лежит в отключке
        node.face.texture = this.atlas.faces[faceIdx];
      }
    }
  }

  reset(): void {
    for (const [, node] of [...this.nodes]) node.container.destroy({ children: true });
    this.nodes.clear();
  }
}
