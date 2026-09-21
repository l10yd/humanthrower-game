/** Ragdoll factory: 3 core bodies + 4 limb bodies, 6 revolute joints with angular limits (GDD §7.1). */
import type RAPIER from '@dimforge/rapier2d-compat';
import type { Archetype } from '../config/archetypes';
import type { HumanVariant } from '../config/palette';
import type { Rng } from '../core/Rng';
import { COLLISION, MATERIALS } from '../config/physics';
import type { PhysicsWorld } from './PhysicsWorld';

export interface RagdollGeometry {
  headR: number;
  torsoHalfH: number;
  torsoR: number;
  pelvisHalfH: number;
  pelvisR: number;
  armHalfH: number;
  armR: number;
  legHalfH: number;
  legR: number;
}

/** Proportions derived from archetype height (h = heightPx × scale). */
export function ragdollGeometry(a: Archetype, v: HumanVariant): RagdollGeometry {
  const h = a.heightPx * a.scale;
  const hf = a.hFactor;
  return {
    headR: 0.136 * h * v.headScale,
    torsoHalfH: 0.082 * h,
    torsoR: 0.182 * h * hf,
    pelvisHalfH: 0.055 * h,
    pelvisR: 0.118 * h * hf,
    armHalfH: 0.09 * h,
    armR: 0.05 * h,
    legHalfH: 0.1 * h,
    legR: 0.05 * h,
  };
}

function capsuleArea(r: number, halfH: number): number {
  return 4 * r * halfH + Math.PI * r * r;
}

function ballArea(r: number): number {
  return Math.PI * r * r;
}

export type RagdollRole = 'head' | 'torso' | 'legs' | 'limb';

export interface RagdollPartBuild {
  role: RagdollRole;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  halfW: number;
  halfH: number;
  isCore: boolean;
  /** offset from pelvis centre — used for pooled respawn */
  offX: number;
  offY: number;
  /** rest rotation — pooled respawn resets to it (anchor coincidence) */
  restAngle: number;
  baseLinDamp: number;
}

export interface RagdollJointBuild {
  joint: RAPIER.ImpulseJoint;
  aHandle: number;
  bHandle: number;
}

export interface RagdollBuild {
  humanId: number;
  archetype: Archetype;
  variant: HumanVariant;
  parts: RagdollPartBuild[]; // [head, torso, pelvis, armL, armR, legL, legR]
  joints: RagdollJointBuild[];
  geometry: RagdollGeometry;
}

const MASS_SHARES = { head: 0.13, torso: 0.47, pelvis: 0.25, limb: 0.0375 } as const;

export function createRagdoll(
  world: PhysicsWorld,
  a: Archetype,
  v: HumanVariant,
  humanId: number,
  x: number,
  y: number,
  rng: Rng,
): RagdollBuild {
  const g = ragdollGeometry(a, v);
  const parts: RagdollPartBuild[] = [];
  const joints: RagdollJointBuild[] = [];

  const pelvisTotalHalf = g.pelvisHalfH + g.pelvisR;
  const torsoTotalHalf = g.torsoHalfH + g.torsoR;
  const torsoY = y - pelvisTotalHalf - torsoTotalHalf + 5;
  const headY = torsoY - torsoTotalHalf - g.headR + 6;

  // Конечности: руки свисают ПО СТОРОНАМ от торса (вне его коллайдера), ноги — от бёдер.
  // Поза под углом (restAngle) → руки/ноги видны и болтаются, якоря совпадают (GDD §7.1).
  const ARM_SPREAD = g.torsoR - 2; // якорь плеча на торсе
  const ARM_LEN = g.armHalfH + g.armR - 3; // от центра руки до якоря
  const armAngle = 0.72; // разворот руки наружу-вниз
  const shoulderWY = torsoY - (torsoTotalHalf - 8);
  const LEG_SPREAD = g.pelvisR * 0.6; // якорь бедра на тазе
  const LEG_LEN = g.legHalfH + g.legR - 3;
  const legAngle = 0.42;
  const hipLocalY = pelvisTotalHalf - 6; // локальный якорь бедра (относительно центра таза)
  const hipWY = y + hipLocalY; // мировая точка бедра

  const coreLinDamp = 0.8 * a.fallResistance;
  const limbLinDamp = 1.0;

  const makeBody = (
    role: RagdollRole, isCore: boolean, bx: number, by: number, halfW: number, halfH: number,
    linDamp: number, matName: string, massShare: number, ccd: boolean, restAngle = 0,
  ): RagdollPartBuild => {
    const body = world.createDynamic(isCore ? 'core' : 'limb', {
      x: bx, y: by, linDamp, angDamp: isCore ? 2.0 : 1.5, ccd,
    });
    if (restAngle !== 0) body.setRotation(restAngle, true);
    const area = role === 'head' ? ballArea(halfW) : capsuleArea(halfW, halfH);
    const density = Math.max(0.0001, (massShare * a.mass) / area);
    const mat = (MATERIALS as Record<string, { restitution: number; friction: number }>)[matName];
    const collider = world.createCollider(
      (role === 'head'
        ? world.ra.ColliderDesc.ball(halfW)
        : world.ra.ColliderDesc.capsule(halfH, halfW)
      )
        .setRestitution(Math.min(mat.restitution, a.restitution + 0.04))
        .setFriction(Math.max(mat.friction, a.friction * 0.7))
        .setDensity(density)
        .setCollisionGroups(isCore ? COLLISION.core : COLLISION.limb),
      body,
    );
    return { role, body, collider, halfW, halfH, isCore, offX: bx - x, offY: by - y, restAngle, baseLinDamp: linDamp };
  };

  // Центр конечности: якорь на теле − rotate((0, −len), restAngle), чтобы якоря совпали.
  const limbCenter = (ax: number, ay: number, len: number, restAngle: number): { x: number; y: number } => {
    return { x: ax - len * Math.sin(restAngle), y: ay + len * Math.cos(restAngle) };
  };

  // Spawn order: core bodies first (bottom-up), then limbs.
  const pelvis = makeBody('legs', true, x, y, g.pelvisR, g.pelvisHalfH, coreLinDamp, 'pelvis', MASS_SHARES.pelvis, true);
  const torso = makeBody('torso', true, x, torsoY, g.torsoR, g.torsoHalfH, coreLinDamp, 'torso', MASS_SHARES.torso, true);
  const head = makeBody('head', true, x, headY, g.headR, g.headR, coreLinDamp, 'head', MASS_SHARES.head, true);

  // restAngle > 0 → конечность свисает влево-вниз, < 0 → вправо-вниз (наружу от тела).
  const armLc = limbCenter(x - ARM_SPREAD, shoulderWY, ARM_LEN, armAngle);
  const armRc = limbCenter(x + ARM_SPREAD, shoulderWY, ARM_LEN, -armAngle);
  const armL = makeBody('limb', false, armLc.x, armLc.y, g.armR, g.armHalfH, limbLinDamp, 'armLimb', MASS_SHARES.limb, false, armAngle);
  const armR = makeBody('limb', false, armRc.x, armRc.y, g.armR, g.armHalfH, limbLinDamp, 'armLimb', MASS_SHARES.limb, false, -armAngle);

  const legLc = limbCenter(x - LEG_SPREAD, hipWY, LEG_LEN, legAngle);
  const legRc = limbCenter(x + LEG_SPREAD, hipWY, LEG_LEN, -legAngle);
  const legL = makeBody('limb', false, legLc.x, legLc.y, g.legR, g.legHalfH, limbLinDamp, 'legLimb', MASS_SHARES.limb, false, legAngle);
  const legR = makeBody('limb', false, legRc.x, legRc.y, g.legR, g.legHalfH, limbLinDamp, 'legLimb', MASS_SHARES.limb, false, -legAngle);
  parts.push(head, torso, pelvis, armL, armR, legL, legR);

  // Joints: anchors coincide in world space at rest pose (GDD §7.1).
  const rev = (
    a2: RagdollPartBuild, b2: RagdollPartBuild,
    lax: number, lay: number, lbx: number, lby: number,
    limits: [number, number],
  ): void => {
    joints.push(world.createRevolute(a2.body, b2.body, lax, lay, lbx, lby, limits));
  };

  // neck: torso(0, −(torsoTotalHalf−6)) ↔ head(0, +headR)
  rev(torso, head, 0, -(torsoTotalHalf - 6), 0, g.headR, [-0.7, 0.7]);
  // shoulders: torso(±ARM_SPREAD, −(torsoTotalHalf−8)) ↔ arm(0, −ARM_LEN) — якоря совпадают при restAngle ±armAngle
  rev(torso, armL, -ARM_SPREAD, -(torsoTotalHalf - 8), 0, -ARM_LEN, [-2.8, 1.0]);
  rev(torso, armR, ARM_SPREAD, -(torsoTotalHalf - 8), 0, -ARM_LEN, [-2.8, 1.0]);
  // spine: pelvis(0, −(pelvisTotalHalf−4)) ↔ torso(0, torsoTotalHalf−1)
  rev(pelvis, torso, 0, -(pelvisTotalHalf - 4), 0, torsoTotalHalf - 1, [-0.5, 0.7]);
  // hips: pelvis(±LEG_SPREAD, hipLocalY) ↔ leg(0, −LEG_LEN) — якорь таза ЛОКАЛЬНЫЙ (hipLocalY = pelvisTotalHalf−6),
  // мировая точка бедра = y + hipLocalY — совпадает с позой спавна (legCenter от hipWY). GDD §7.1.
  rev(pelvis, legL, -LEG_SPREAD, hipLocalY, 0, -LEG_LEN, [-1.4, 0.9]);
  rev(pelvis, legR, LEG_SPREAD, hipLocalY, 0, -LEG_LEN, [-1.4, 0.9]);

  // Toppling bias: small random angular impulse at spawn (GDD §6.2).
  const w = rng.range(-1, 1) * 1.2 * a.toppleBias;
  for (const p of parts) {
    p.body.setAngvel(w * (p.isCore ? 1 : 1.4), true);
  }

  return { humanId, archetype: a, variant: v, parts, joints, geometry: g };
}
