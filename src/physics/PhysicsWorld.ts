/** Physics world wrapper around Rapier 2D (GDD §8, §38). Gameplay never touches Rapier directly. */
import type RAPIER from '@dimforge/rapier2d-compat';
import {
  PHYS,
  GLASS_LEFT,
  GLASS_W,
  GLASS_FLOOR_Y,
  WALL_THICKNESS,
} from '../config/balance';
import { COLLISION, G, interactionGroups, MATERIALS } from '../config/physics';

export type BodyKind = 'player' | 'core' | 'limb' | 'piece' | 'static';

export interface RegisteredBody {
  kind: BodyKind;
  body: RAPIER.RigidBody;
}

export interface RadiusHit {
  body: RAPIER.RigidBody;
  kind: BodyKind;
  dist: number;
  pos: { x: number; y: number };
}

export interface GroundHit {
  kind: BodyKind;
  dist: number;
}

/** Ray interaction groups: see static | cores | pieces (ground detection for the player). */
export const RAY_GROUPS = interactionGroups(G.STATIC | G.CORE | G.PIECE, 0xffff);

export class PhysicsWorld {
  readonly ra: typeof RAPIER;
  world: RAPIER.World;
  events: RAPIER.EventQueue;
  private registry = new Map<number, RegisteredBody>();
  private contacts = new Map<number, number>();

  constructor(ra: typeof RAPIER) {
    this.ra = ra;
    this.world = new ra.World({ x: 0, y: PHYS.gravity });
    this.world.timestep = 1 / PHYS.fixedHz;
    this.events = new ra.EventQueue(true);
    this.createContainer();
  }

  private createContainer(): void {
    const desc = this.ra.RigidBodyDesc.fixed();
    const body = this.world.createRigidBody(desc);
    const cx = GLASS_LEFT + GLASS_W / 2;
    // Floor (top edge exactly at GLASS_FLOOR_Y).
    this.world.createCollider(
      this.ra.ColliderDesc.cuboid(GLASS_W / 2, WALL_THICKNESS / 2)
        .setTranslation(cx, GLASS_FLOOR_Y + WALL_THICKNESS / 2)
        .setRestitution(MATERIALS.floor.restitution)
        .setFriction(MATERIALS.floor.friction)
        .setCollisionGroups(COLLISION.static),
      body,
    );
    // Left / right glass walls, tall enough to catch spawns above the glass top.
    const wallHalfH = (GLASS_FLOOR_Y + 200) / 2;
    const wallCy = GLASS_FLOOR_Y - wallHalfH;
    this.world.createCollider(
      this.ra.ColliderDesc.cuboid(WALL_THICKNESS / 2, wallHalfH)
        .setTranslation(GLASS_LEFT - WALL_THICKNESS / 2, wallCy)
        .setRestitution(MATERIALS.glass.restitution)
        .setFriction(MATERIALS.glass.friction)
        .setCollisionGroups(COLLISION.static),
      body,
    );
    this.world.createCollider(
      this.ra.ColliderDesc.cuboid(WALL_THICKNESS / 2, wallHalfH)
        .setTranslation(GLASS_LEFT + GLASS_W + WALL_THICKNESS / 2, wallCy)
        .setRestitution(MATERIALS.glass.restitution)
        .setFriction(MATERIALS.glass.friction)
        .setCollisionGroups(COLLISION.static),
      body,
    );
    this.registry.set(body.handle, { kind: 'static', body });
  }

  step(): void {
    this.world.step(this.events);
    // v8 bindings: аргументы — хэндлы КОЛЛАЙДЕРОВ (числа), маппим в тела через getCollider
    this.events.drainCollisionEvents((handle1: number, handle2: number, started: boolean) => {
      const c1 = this.world.getCollider(handle1);
      const c2 = this.world.getCollider(handle2);
      const b1 = c1?.parent();
      const b2 = c2?.parent();
      if (!b1 || !b2) return;
      this.bumpContact(b1.handle, started);
      this.bumpContact(b2.handle, started);
    });
  }

  private bumpContact(handle: number, started: boolean): void {
    const cur = this.contacts.get(handle) ?? 0;
    const next = started ? cur + 1 : Math.max(0, cur - 1);
    this.contacts.set(handle, next);
  }

  contactCount(handle: number): number {
    return this.contacts.get(handle) ?? 0;
  }

  createDynamic(kind: BodyKind, opts: {
    x: number; y: number; linDamp: number; angDamp: number; ccd?: boolean; lockRot?: boolean;
  }): RAPIER.RigidBody {
    const desc = this.ra.RigidBodyDesc.dynamic()
      .setTranslation(opts.x, opts.y)
      .setLinearDamping(opts.linDamp)
      .setAngularDamping(opts.angDamp);
    if (opts.ccd) desc.setCcdEnabled(true);
    if (opts.lockRot) desc.lockRotations();
    const body = this.world.createRigidBody(desc);
    this.registry.set(body.handle, { kind, body });
    return body;
  }

  createCollider(desc: RAPIER.ColliderDesc, body: RAPIER.RigidBody): RAPIER.Collider {
    return this.world.createCollider(desc, body);
  }

  /** Revolute joint with optional angular limits [min, max] (GDD §7.1). */
  createRevolute(
    bodyA: RAPIER.RigidBody, bodyB: RAPIER.RigidBody,
    ax: number, ay: number, bx: number, by: number,
    limits: [number, number] | null,
  ): { joint: RAPIER.ImpulseJoint; aHandle: number; bHandle: number } {
    const data = this.ra.JointData.revolute({ x: ax, y: ay }, { x: bx, y: by });
    const joint = this.world.createImpulseJoint(data, bodyA, bodyB, true);
    if (limits) {
      const rev = joint as unknown as { setLimits?: (min: number, max: number) => void };
      try {
        rev.setLimits?.(limits[0], limits[1]);
      } catch {
        // limits unsupported in this runtime → limbs stay floppy (still playable)
      }
    }
    return { joint, aHandle: bodyA.handle, bHandle: bodyB.handle };
  }

  removeJoint(entry: { joint: RAPIER.ImpulseJoint; aHandle: number; bHandle: number }): void {
    this.world.removeImpulseJoint(entry.joint, true);
  }

  removeBody(body: RAPIER.RigidBody): void {
    this.registry.delete(body.handle);
    this.contacts.delete(body.handle);
    this.world.removeRigidBody(body);
  }

  /** Downward ray — ground detection with body classification. */
  groundRay(x: number, y: number, maxDist: number): GroundHit | null {
    const ray = new this.ra.Ray({ x, y }, { x: 0, y: 1 });
    const hit = this.world.castRay(ray, maxDist, true, undefined, RAY_GROUPS);
    if (!hit) return null;
    const h = hit as unknown as { collider?: RAPIER.Collider; timeOfImpact?: number; toi?: number };
    const kind = h.collider?.parent() ? this.registry.get(h.collider.parent()!.handle)?.kind ?? 'static' : 'static';
    return { kind, dist: h.timeOfImpact ?? h.toi ?? 0 };
  }

  /** All dynamic bodies within radius of a point (stomp, spawn corridor, wake). */
  bodiesInRadius(x: number, y: number, r: number): RadiusHit[] {
    const out: RadiusHit[] = [];
    for (const info of this.registry.values()) {
      if (info.kind === 'static') continue;
      const t = info.body.translation();
      const dx = t.x - x;
      const dy = t.y - y;
      const d = Math.hypot(dx, dy);
      if (d <= r) out.push({ body: info.body, kind: info.kind, dist: d, pos: { x: t.x, y: t.y } });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }

  /** Apply anti-explosion velocity caps to one body (GDD §8.4). */
  clampVelocity(body: RAPIER.RigidBody, maxLin: number = PHYS.maxLinearVelocity, maxAng: number = PHYS.maxAngularVelocity): void {
    const v = body.linvel();
    const s = Math.hypot(v.x, v.y);
    if (s > maxLin) body.setLinvel({ x: (v.x / s) * maxLin, y: (v.y / s) * maxLin }, true);
    const w = body.angvel();
    if (Math.abs(w) > maxAng) body.setAngvel(Math.sign(w) * maxAng, true);
  }

  counts(): { awake: number; sleeping: number; frozen: number } {
    let awake = 0;
    let sleeping = 0;
    let frozen = 0;
    for (const info of this.registry.values()) {
      if (info.kind === 'static') continue;
      if (!info.body.isEnabled()) frozen++;
      else if (info.body.isSleeping()) sleeping++;
      else awake++;
    }
    return { awake, sleeping, frozen };
  }

  dynamicCount(): number {
    let n = 0;
    for (const info of this.registry.values()) if (info.kind !== 'static') n++;
    return n;
  }

  /** Remove every enabled dynamic body (game reset). Disabled (parked) pool bodies survive. */
  resetDynamic(): void {
    const doomed: RAPIER.RigidBody[] = [];
    for (const info of this.registry.values()) {
      if (info.kind !== 'static' && info.body.isEnabled()) doomed.push(info.body);
    }
    for (const b of doomed) this.removeBody(b);
    this.contacts.clear();
  }
}
