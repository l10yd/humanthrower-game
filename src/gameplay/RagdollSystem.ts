/** Ragdoll system: per-part state machine, contact damping, sleep/wake policy, LOD (GDD §7.2, §7.4). */
import type RAPIER from '@dimforge/rapier2d-compat';
import { PHYS } from '../config/balance';
import type { ArchetypeId } from '../config/difficulty';
import type { HumanVariant } from '../config/palette';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { RagdollBuild, RagdollGeometry } from '../physics/RagdollFactory';
import type { PieceBuild } from '../physics/PieceFactory';

export type PartRole = 'head' | 'torso' | 'legs' | 'limb';
export type PartState = 'falling' | 'landing' | 'settling' | 'settled';

export interface PartRecord {
  id: number;
  /** null → independent piece (detached block, GDD §11.3) */
  humanId: number | null;
  role: PartRole;
  isCore: boolean;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  state: PartState;
  isPiece: boolean;
  alive: boolean;
  archetypeId: ArchetypeId;
  variant: HumanVariant;
  halfW: number;
  halfH: number;
  scale: number;
  offX: number;
  offY: number;
  baseLinDamp: number;
  settleTimer: number;
  landTimer: number;
  /** render interpolation (physics → pose → render, GDD §46): prev = post-previous-step */
  prevX: number;
  prevY: number;
  prevAngle: number;
  curX: number;
  curY: number;
  curAngle: number;
  prevVx: number;
  prevVy: number;
  prevW: number;
  lastImpactDv: number;
  /** контузия: секунды «ударился» после сильного импакта (выражение лица) */
  exprTimer: number;
  squash: number;
  /** limbs: owning core record (LOD1 freeze / destroy-with-core) */
  limbOf: PartRecord | null;
  /** rest rotation — pooled respawn resets to it (anchor coincidence) */
  restAngle: number;
}

export interface RagdollHandle {
  humanId: number;
  archetypeId: ArchetypeId;
  variant: HumanVariant;
  parts: PartRecord[];
  limbs: PartRecord[];
  joints: { joint: RAPIER.ImpulseJoint; aHandle: number; bHandle: number }[];
  alive: boolean;
  pooled: boolean;
  geometry: RagdollGeometry;
}

export interface RagdollHooks {
  onImpact(part: PartRecord, dv: number): void;
  onSettled(part: PartRecord): void;
  onWake(part: PartRecord): void;
}

const CORE_ROLES = 3; // head, torso, pelvis(legs)

export class RagdollSystem {
  humans: RagdollHandle[] = [];
  parts = new Map<number, PartRecord>();
  destroyedIds: number[] = [];
  private nextPartId = 1;
  private nextHumanId = 1;
  private watchdogTimer = 0;
  private coreScratch: PartRecord[] = [];

  constructor(
    private world: PhysicsWorld,
    private hooks: RagdollHooks,
  ) {}

  claimHumanId(): number {
    return this.nextHumanId++;
  }

  addRagdoll(build: RagdollBuild, spawnVy: number): RagdollHandle {
    const records = build.parts.map((bp) => this.makeRecord(bp, build));
    const handle: RagdollHandle = {
      humanId: build.humanId,
      archetypeId: build.archetype.id,
      variant: build.variant,
      parts: records,
      limbs: records.slice(CORE_ROLES),
      joints: build.joints,
      alive: true,
      pooled: false,
      geometry: build.geometry,
    };
    for (const r of records) {
      const t = r.body.translation();
      r.prevX = t.x;
      r.prevY = t.y;
      r.prevAngle = r.body.rotation();
      r.curX = t.x;
      r.curY = t.y;
      r.curAngle = r.body.rotation();
      r.prevVy = spawnVy;
      this.parts.set(r.id, r);
      if (r.isCore) r.body.setLinvel({ x: 0, y: spawnVy }, true);
      else r.body.setLinvel({ x: 0, y: spawnVy * 1.1 }, true);
    }
    // конечности принадлежат своим core: руки → торс, ноги → таз (LOD1 freeze / destroy-with-core)
    if (records.length >= CORE_ROLES + 4) {
      const torsoRec = records[1];
      const pelvisRec = records[2];
      for (let i = CORE_ROLES; i < records.length; i++) {
        records[i].limbOf = i < CORE_ROLES + 2 ? torsoRec : pelvisRec;
      }
    }
    this.humans.push(handle);
    return handle;
  }

  private makeRecord(bp: RagdollBuild['parts'][number], build: RagdollBuild): PartRecord {
    const role: PartRole = bp.role === 'head' ? 'head' : bp.role === 'torso' ? 'torso' : bp.role === 'legs' ? 'legs' : 'limb';
    const rec: PartRecord = {
      id: this.nextPartId++,
      humanId: bp.isCore ? build.humanId : null,
      role,
      isCore: bp.isCore,
      body: bp.body,
      collider: bp.collider,
      state: 'falling',
      isPiece: false,
      alive: true,
      archetypeId: build.archetype.id,
      variant: build.variant,
      halfW: bp.halfW,
      halfH: bp.halfH,
      scale: build.archetype.scale,
      offX: bp.offX,
      offY: bp.offY,
      baseLinDamp: bp.baseLinDamp,
      settleTimer: 0,
      landTimer: 0,
      prevX: 0,
      prevY: 0,
      prevAngle: 0,
      curX: 0,
      curY: 0,
      curAngle: 0,
      prevVx: 0,
      prevVy: 0,
      prevW: 0,
      lastImpactDv: 0,
      exprTimer: 0,
      squash: 0,
      limbOf: null,
      restAngle: bp.restAngle,
    };
    return rec;
  }

  part(id: number): PartRecord | undefined {
    return this.parts.get(id);
  }

  /** Alive core parts (grid sampling, resolve, stomp). Reused scratch array. */
  coreParts(): PartRecord[] {
    const out = this.coreScratch;
    out.length = 0;
    for (const p of this.parts.values()) {
      if (p.alive && p.isCore) out.push(p);
    }
    return out;
  }

  coreUnits(): number {
    return this.coreParts().length;
  }

  /** Total joints across active humans (debug overlay). */
  jointCount(): number {
    let n = 0;
    for (const h of this.humans) n += h.joints.length;
    return n;
  }

  /** Register a standalone single-body piece (deterministic scenarios / debug hooks). */
  registerPiece(build: PieceBuild, variant: HumanVariant): PartRecord {
    const rec: PartRecord = {
      id: this.nextPartId++,
      humanId: null,
      role: build.role === 'head' ? 'head' : build.role === 'torso' ? 'torso' : 'legs',
      isCore: true,
      body: build.body,
      collider: build.collider,
      state: 'falling',
      isPiece: true,
      alive: true,
      archetypeId: 'normal',
      variant,
      halfW: build.halfW,
      halfH: build.halfH,
      scale: 1,
      offX: 0,
      offY: 0,
      baseLinDamp: 0.8,
      settleTimer: 0,
      landTimer: 0,
      prevX: 0,
      prevY: 0,
      prevAngle: 0,
      curX: 0,
      curY: 0,
      curAngle: 0,
      prevVx: 0,
      prevVy: 0,
      prevW: 0,
      lastImpactDv: 0,
      exprTimer: 0,
      squash: 0,
      limbOf: null,
      restAngle: 0,
    };
    const t = build.body.translation();
    rec.prevX = rec.curX = t.x;
    rec.prevY = rec.curY = t.y;
    rec.prevAngle = rec.curAngle = build.body.rotation();
    rec.prevVy = build.body.linvel().y;
    this.parts.set(rec.id, rec);
    return rec;
  }

  update(dt: number): void {
    for (const p of this.parts.values()) {
      if (!p.alive) continue;
      if (p.isCore) {
        if (p.body.isEnabled()) this.updateCore(p, dt);
      } else if (p.body.isEnabled()) {
        // конечности тоже снепшотятся для рендера (GDD §46) — иначе рисуются замороженными
        p.prevX = p.curX;
        p.prevY = p.curY;
        p.prevAngle = p.curAngle;
        const tr = p.body.translation();
        p.curX = tr.x;
        p.curY = tr.y;
        p.curAngle = p.body.rotation();
        this.world.clampVelocity(p.body);
      }
    }
    this.watchdog(dt);
    this.capAll();
  }

  private updateCore(p: PartRecord, dt: number): void {
    // interpolation snapshot: prev = post-previous-step, cur = post-this-step
    p.prevX = p.curX;
    p.prevY = p.curY;
    p.prevAngle = p.curAngle;
    const tr = p.body.translation();
    p.curX = tr.x;
    p.curY = tr.y;
    p.curAngle = p.body.rotation();

    const v = p.body.linvel();
    const w = p.body.angvel();
    const speed = Math.hypot(v.x, v.y);
    const dv = Math.hypot(v.x - p.prevVx, v.y - p.prevVy);
    p.lastImpactDv = dv;
    const sleeping = p.body.isSleeping();

    if (p.state === 'settled') {
      if (!sleeping) {
        // Rapier woke it (external contact) → back to settling (GDD §7.2)
        p.state = 'settling';
        this.freezeLimbsOf(p, false);
        this.hooks.onWake(p);
      }
    } else if (dv > PHYS.wakeDv && p.state !== 'falling') {
      this.hooks.onImpact(p, dv);
    }

    if (p.state === 'falling') {
      if (dv > PHYS.landingDv) {
        p.state = 'landing';
        p.landTimer = PHYS.landingDampTime;
        p.body.setLinearDamping(p.baseLinDamp * 2.2);
        if (dv > PHYS.landingDv * 2.5) p.exprTimer = 1.6; // контузия после сильного удара
        this.hooks.onImpact(p, dv);
      }
    } else if (p.state === 'landing') {
      p.landTimer -= dt;
      if (p.landTimer <= 0) {
        p.state = 'settling';
        p.body.setLinearDamping(p.baseLinDamp);
      }
    }

    if (p.state === 'settling' || p.state === 'landing') {
      const contact = this.world.contactCount(p.body.handle) > 0;
      if (speed < PHYS.settlingLinVel && contact) {
        // contact damping (GDD §8.2): the pile "viscously" settles
        p.body.setLinvel({ x: v.x * PHYS.contactDamp, y: v.y * PHYS.contactDamp }, false);
        p.settleTimer += dt;
        if (p.settleTimer >= PHYS.sleepSec && Math.abs(w) < PHYS.sleepAngVel) {
          p.state = 'settled';
          p.settleTimer = 0;
          p.body.sleep();
          this.freezeLimbsOf(p, true); // LOD1: limb bodies out of the sim (GDD §7.4)
          this.hooks.onSettled(p);
        }
      } else {
        p.settleTimer = 0;
      }
    }

    p.prevVx = v.x;
    p.prevVy = v.y;
    p.prevW = w;
    if (p.exprTimer > 0) p.exprTimer = Math.max(0, p.exprTimer - dt);
  }

  /** LOD1: limb bodies enabled/disabled with their core's settle state (GDD §7.4). */
  private freezeLimbsOf(p: PartRecord, frozen: boolean): void {
    for (const l of this.parts.values()) {
      if (l.alive && l.limbOf === p) l.body.setEnabled(!frozen);
    }
  }

  /** Anti-float watchdog: sleeping core with zero contacts wakes up (GDD §8.6). */
  private watchdog(dt: number): void {
    this.watchdogTimer += dt;
    if (this.watchdogTimer < 1.0) return;
    this.watchdogTimer = 0;
    for (const p of this.parts.values()) {
      if (!p.alive || !p.isCore || !p.body.isEnabled()) continue;
      if (p.body.isSleeping() && this.world.contactCount(p.body.handle) === 0) {
        this.freezeLimbsOf(p, false);
        p.body.wakeUp();
        p.state = 'settling';
        this.hooks.onWake(p);
      }
    }
  }

  /** Anti-explosion velocity caps on every awake body (GDD §8.4). */
  private capAll(): void {
    for (const p of this.parts.values()) {
      if (p.alive && p.body.isEnabled() && !p.body.isSleeping()) this.world.clampVelocity(p.body);
    }
  }

  /** Wake a settled piece/core (support removed, stomp, detach — GDD §11.4). */
  thawPiece(p: PartRecord): void {
    if (p.state === 'settled') {
      p.state = 'settling';
      this.freezeLimbsOf(p, false);
    }
    p.body.wakeUp();
  }

  /** Destroy a part: cut attached joints, remove body; its limbs die with it. */
  destroyPart(p: PartRecord): void {
    if (!p.alive) return;
    const h = p.humanId !== null ? this.humans.find((x) => x.humanId === p.humanId && !x.pooled) : null;
    if (h) {
      h.joints = h.joints.filter((j) => {
        if (j.aHandle === p.body.handle || j.bHandle === p.body.handle) {
          this.world.removeJoint(j);
          return false;
        }
        return true;
      });
    }
    this.world.removeBody(p.body);
    p.alive = false;
    this.parts.delete(p.id);
    this.destroyedIds.push(p.id);
    if (p.isCore) {
      for (const l of [...this.parts.values()]) {
        if (l.alive && l.limbOf === p) this.destroyPart(l);
      }
      if (h && !h.parts.some((r) => r.alive)) h.alive = false;
    }
  }

  /** Park a ragdoll (game reset): bodies disabled off-screen, records dropped, handle reusable.
   * Records stay alive=true so respawnRagdoll can reactivate the handle. */
  parkRagdoll(h: RagdollHandle): void {
    for (const p of h.parts) {
      if (!p.alive) continue;
      this.parts.delete(p.id);
      this.destroyedIds.push(p.id);
      if (p.body.isSleeping()) p.body.wakeUp();
      p.body.setEnabled(false);
      p.body.setTranslation({ x: -1000 + Math.random() * 100, y: -3000 }, false);
      p.body.setLinvel({ x: 0, y: 0 }, false);
      p.body.setAngvel(0, false);
    }
    h.pooled = true;
    h.alive = true;
  }

  /** Reactivate a pooled ragdoll at spawn point. Returns false if the handle is partial. */
  respawnRagdoll(h: RagdollHandle, x: number, y: number, spawnVy: number, angImpulse: number): boolean {
    if (!h.parts.every((p) => p.alive)) return false;
    for (const p of h.parts) {
      const px = x + p.offX * p.scale;
      const py = y + p.offY * p.scale;
      p.body.setEnabled(true);
      p.body.setTranslation({ x: px, y: py }, true);
      p.body.setRotation(p.restAngle, true);
      p.body.setLinvel({ x: 0, y: spawnVy * (p.isCore ? 1 : 1.1) }, true);
      p.body.setAngvel(angImpulse * (p.isCore ? 1 : 1.4), true);
      p.body.setLinearDamping(p.baseLinDamp);
      p.state = 'falling';
      p.settleTimer = 0;
      p.landTimer = 0;
      p.exprTimer = 0;
      p.prevX = px;
      p.prevY = py;
      p.prevAngle = p.restAngle;
      p.curX = px;
      p.curY = py;
      p.curAngle = p.restAngle;
      p.prevVx = 0;
      p.prevVy = spawnVy;
      p.prevW = 0;
      p.squash = 0;
    }
    for (const p of h.parts) {
      p.id = this.nextPartId++;
      this.parts.set(p.id, p);
    }
    h.pooled = false;
    return true;
  }

  /** Re-enable alive bodies so world.resetDynamic() removes them (partial humans on reset). */
  discardAll(): void {
    for (const p of this.parts.values()) {
      if (p.alive && !p.body.isEnabled()) p.body.setEnabled(true);
    }
  }

  reset(): void {
    this.humans = [];
    this.parts.clear();
    this.destroyedIds = [];
    this.watchdogTimer = 0;
  }
}
