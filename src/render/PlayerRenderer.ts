/** Player renderer: physics position + procedural limb swing (hybrid, GDD §5, §46). */
import { Container, Sprite } from 'pixi.js';
import { PLAYER } from '../config/player';
import { FACE } from './AtlasFactory';
import type { Atlas } from './AtlasFactory';
import type { PlayerController } from '../gameplay/PlayerController';

export class PlayerRenderer {
  private container = new Container();
  private head: Sprite;
  private face: Sprite;
  private armL: Sprite;
  private armR: Sprite;
  private legL: Sprite;
  private legR: Sprite;
  private phase = 0;

  constructor(
    private layer: Container,
    private atlas: Atlas,
    private player: PlayerController,
  ) {
    const body = new Sprite(this.atlas.torso);
    body.anchor.set(0.5);
    body.width = 44;
    body.height = 46;
    body.tint = 0x4c8de2;
    this.container.addChild(body);

    // руки: свисают с плеч, болтаются (GDD §15.1)
    this.armL = new Sprite(this.atlas.limb);
    this.armL.anchor.set(0.5, 0);
    this.armL.width = 12;
    this.armL.height = 24;
    this.armL.position.set(-17, -20);
    this.armL.tint = 0xf2c49b;
    this.container.addChild(this.armL);

    this.armR = new Sprite(this.atlas.limb);
    this.armR.anchor.set(0.5, 0);
    this.armR.width = 12;
    this.armR.height = 24;
    this.armR.position.set(17, -20);
    this.armR.tint = 0xf2c49b;
    this.container.addChild(this.armR);

    this.legL = new Sprite(this.atlas.limb);
    this.legL.anchor.set(0.5, 0);
    this.legL.width = 11;
    this.legL.height = 26;
    this.legL.position.set(-10, 18);
    this.legL.tint = 0x3a4a6b;
    this.container.addChild(this.legL);

    this.legR = new Sprite(this.atlas.limb);
    this.legR.anchor.set(0.5, 0);
    this.legR.width = 11;
    this.legR.height = 26;
    this.legR.position.set(10, 18);
    this.legR.tint = 0x3a4a6b;
    this.container.addChild(this.legR);

    this.head = new Sprite(this.atlas.head);
    this.head.anchor.set(0.5);
    this.head.width = 40;
    this.head.height = 40;
    this.head.position.y = -40;
    this.head.tint = 0xf2c49b;
    this.container.addChild(this.head);

    this.face = new Sprite(this.atlas.faces[0]);
    this.face.anchor.set(0.5);
    this.face.width = 32;
    this.face.height = 20;
    this.face.position.set(2, -38);
    this.container.addChild(this.face);

    this.container.pivot.set(0, -6);
    this.layer.addChild(this.container);
  }

  update(alpha: number, dtMs: number, reducedMotion: boolean): void {
    void reducedMotion;
    const p = this.player;
    if (!p.body) {
      this.container.visible = false;
      return;
    }
    // мёртвый игрок остаётся видимым — обмякшее тело лежит на куче (GDD §5.4)
    this.container.visible = true;
    const t = p.body.translation();
    const px = p.x + (t.x - p.x) * alpha;
    const py = p.y + (t.y - p.y) * alpha;
    this.container.position.set(px, py);

    const crouch = p.crouching ? PLAYER.crouchScale : 1;
    this.container.scale.set(1, crouch);

    const speed = Math.abs(p.vx);
    this.phase += (dtMs / 1000) * (2 + speed / 55);
    const swing = p.grounded ? Math.sin(this.phase) * Math.min(0.65, speed / 380) : p.diving ? 0.55 : 0.25;
    this.legL.rotation = swing;
    this.legR.rotation = -swing;
    // руки: в противофазе ног при беге; в воздухе просто болтаются (GDD §15.1)
    if (p.grounded) {
      this.armL.rotation = -swing * 0.8;
      this.armR.rotation = swing * 0.8;
    } else {
      this.armL.rotation = 0.8 + Math.sin(this.phase * 0.7) * 0.35;
      this.armR.rotation = -0.8 + Math.sin(this.phase * 0.7 + 1.3) * 0.35;
    }

    // вырублен: спрайт кувыркается вместе с телом (GDD §5.4)
    this.container.rotation = p.stunTimer > 0 || !p.alive ? p.body.rotation() : 0;

    // выражения лица (GDD §15.2)
    let faceIdx: number;
    if (!p.alive) faceIdx = FACE.dead; // умер
    else if (p.stunTimer > 0) faceIdx = FACE.ko; // вырубился
    else if (p.diving) faceIdx = FACE.scream; // атака-стомп
    else if (!p.grounded) faceIdx = FACE.terror; // прыгает/летит
    else if (speed > 120) faceIdx = FACE.run; // бежит
    else faceIdx = FACE.normal; // стоит
    this.face.texture = this.atlas.faces[faceIdx];

    // squash on landing (visual only)
    if (p.squash > 0) {
      const k = p.squash;
      this.container.scale.set(1 + k, crouch * (1 - k));
    } else {
      this.container.scale.set(1, crouch);
    }
  }

  reset(): void {
    this.container.visible = true;
    this.container.scale.set(1, 1);
    this.phase = 0;
  }
}
