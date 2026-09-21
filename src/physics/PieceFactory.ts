/** Player body + standalone single-body pieces (for deterministic scenarios; detached pieces in
 * gameplay are surviving ragdoll bodies, GDD §11.3). */
import type RAPIER from '@dimforge/rapier2d-compat';
import { PLAYER } from '../config/player';
import { COLLISION, MATERIALS } from '../config/physics';
import type { PhysicsWorld } from './PhysicsWorld';
import type { RagdollRole } from './RagdollFactory';

export function createPlayerBody(world: PhysicsWorld, x: number, y: number): RAPIER.RigidBody {
  const halfH = (PLAYER.heightPx - PLAYER.widthPx) / 2; // 11
  const r = PLAYER.widthPx / 2; // 25
  const body = world.createDynamic('player', {
    x, y, linDamp: 0.4, angDamp: 4, ccd: true, lockRot: true,
  });
  const area = 4 * r * halfH + Math.PI * r * r;
  world.createCollider(
    world.ra.ColliderDesc.capsule(halfH, r)
      .setRestitution(0.0)
      .setFriction(0.6)
      .setDensity(PLAYER.mass / area)
      .setCollisionGroups(COLLISION.player),
    body,
  );
  return body;
}

export interface PieceBuild {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  role: RagdollRole;
  halfW: number;
  halfH: number;
}

/** Single-body independent piece (head / torso / legs proportions for a NORMAL human). */
export function createPieceBody(world: PhysicsWorld, role: 'head' | 'torso' | 'legs', x: number, y: number, h = 110): PieceBuild {
  let desc: RAPIER.ColliderDesc;
  let halfW: number;
  let halfH: number;
  if (role === 'head') {
    halfW = 0.136 * h;
    halfH = halfW;
    desc = world.ra.ColliderDesc.ball(halfW);
  } else if (role === 'torso') {
    halfW = 0.182 * h;
    halfH = 0.082 * h;
    desc = world.ra.ColliderDesc.capsule(halfH, halfW);
  } else {
    halfW = 0.118 * h;
    halfH = 0.055 * h;
    desc = world.ra.ColliderDesc.capsule(halfH, halfW);
  }
  const area = role === 'head' ? Math.PI * halfW * halfW : 4 * halfW * halfH + Math.PI * halfW * halfW;
  const mass = role === 'head' ? 8 : role === 'torso' ? 29 : 15;
  const body = world.createDynamic('piece', { x, y, linDamp: 0.8, angDamp: 2.0, ccd: true });
  const collider = world.createCollider(
    desc
      .setRestitution(MATERIALS.piece.restitution)
      .setFriction(MATERIALS.piece.friction)
      .setDensity(mass / area)
      .setCollisionGroups(COLLISION.piece),
    body,
  );
  return { body, collider, role, halfW, halfH };
}
