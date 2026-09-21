/** Player controller: hybrid locomotion — forces to a dynamic capsule body, never raw physics
 * (GDD §5.2). Coyote time, jump buffer, variable jump, crouch, dive-stomp (GDD §5.3, §33.5). */
import type RAPIER from '@dimforge/rapier2d-compat';
import { GLASS_FLOOR_Y, GLASS_LEFT, GLASS_W } from '../config/balance';
import { PLAYER } from '../config/player';
import { createPlayerBody } from '../physics/PieceFactory';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

export interface InputState {
  moveX: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  jumpReleased: boolean;
  divePressed: boolean;
  crouchHeld: boolean;
}

export interface PlayerHooks {
  onJump(): void;
  onLand(x: number, y: number, dv: number, onBodies: boolean): void;
  onStomp(x: number, y: number, count: number, active: boolean): void;
}

interface StompCfg {
  radiusPx: number;
  maxDv: number;
  downBias: number;
  maxBodies: number;
}

export class PlayerController {
  body: RAPIER.RigidBody | null = null;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  grounded = false;
  onBodies = false;
  diving = false;
  crouching = false;
  facing = 1;
  alive = false;
  coyoteTimer = 0;
  jumpBufferTimer = 0;
  stompCooldown = 0;
  squash = 0;
  /** вырубание: > 0 → управление выключено, тело обмякает (GDD §5.4) */
  stunTimer = 0;
  /** ?debug=1: тестовый полёт вверх — игрок никогда не grounded (e2e-проверка смерти от очистки) */
  debugFly = false;
  private wasGrounded = false;
  private prevVy = 0;

  constructor(
    private world: PhysicsWorld,
    private hooks: PlayerHooks,
  ) {}

  spawn(): void {
    const sx = GLASS_LEFT + GLASS_W / 2;
    const sy = GLASS_FLOOR_Y - PLAYER.heightPx * 0.55;
    this.body = createPlayerBody(this.world, sx, sy);
    this.alive = true;
    this.x = sx;
    this.y = sy;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.wasGrounded = false;
    this.diving = false;
    this.crouching = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.stompCooldown = 0;
    this.prevVy = 0;
    this.squash = 0;
    this.facing = 1;
    this.debugFly = false;
  }

  despawn(): void {
    if (this.body) {
      this.world.removeBody(this.body);
      this.body = null;
    }
    this.alive = false;
  }

  update(dt: number, input: InputState): void {
    if (!this.body || !this.alive) return;
    const v = this.body.linvel();
    this.vx = v.x;
    this.vy = v.y;
    const t = this.body.translation();
    this.x = t.x;
    this.y = t.y;

    // debugFly (?debug=1): тестовый полёт вверх — grounded=false, смерть от очистки не срабатывает
    if (this.debugFly) {
      this.body.setLinvel({ x: 0, y: -140 }, true);
      this.vx = 0;
      this.vy = -140;
      this.grounded = false;
      this.onBodies = false;
      this.wasGrounded = false;
      this.diving = false;
      this.squash = Math.max(0, this.squash - dt * 1.2);
      return;
    }

    // вырублен (рэгдолл-режим): управление выключено, тело обмякает и кувыркается (GDD §5.4)
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      const rayLen = PLAYER.heightPx * 0.5 + 10;
      const hit = this.world.groundRay(this.x, this.y, rayLen);
      this.grounded = hit !== null;
      this.onBodies = hit !== null && hit.kind !== 'static';
      this.wasGrounded = this.grounded;
      this.prevVy = this.vy;
      if (this.stunTimer <= 0) {
        this.stunTimer = 0;
        this.lockRot(true);
        this.body.setRotation(0, true);
      }
      this.squash = Math.max(0, this.squash - dt * 1.2);
      return;
    }

    // external push clamp (GDD §5.2): bodies may push, controller clamps
    if (Math.abs(this.vx) > PLAYER.maxPushSpeed) {
      const s = Math.sign(this.vx);
      this.body.setLinvel({ x: s * PLAYER.maxPushSpeed, y: this.vy }, true);
      this.vx = s * PLAYER.maxPushSpeed;
    }

    // grounded via downward ray
    const rayLen = PLAYER.heightPx * 0.5 + 10;
    const hit = this.world.groundRay(this.x, this.y, rayLen);
    this.grounded = hit !== null;
    this.onBodies = hit !== null && hit.kind !== 'static';
    if (this.grounded) this.coyoteTimer = PLAYER.coyoteSec;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

    this.crouching = input.crouchHeld && this.grounded;

    // horizontal approach control (hybrid locomotion)
    const desired = input.moveX * PLAYER.maxSpeed * (this.crouching ? PLAYER.crouchSpeed : 1);
    const approach = this.grounded ? PLAYER.velApproachGround : PLAYER.velApproachAir * PLAYER.airControl;
    const newVx = this.vx + (desired - this.vx) * approach;
    this.body.setLinvel({ x: newVx, y: this.vy }, true);
    this.vx = newVx;
    if (input.moveX !== 0) this.facing = input.moveX;

    // jump: buffer + coyote
    this.jumpBufferTimer = input.jumpPressed ? PLAYER.jumpBufferSec : Math.max(0, this.jumpBufferTimer - dt);
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0 && this.vy > -140) {
      this.body.setLinvel({ x: this.vx, y: -PLAYER.jumpVelocity }, true);
      this.vy = -PLAYER.jumpVelocity;
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.hooks.onJump();
    }
    // variable jump cut
    if (input.jumpReleased && this.vy < -200) {
      this.body.setLinvel({ x: this.vx, y: this.vy * PLAYER.jumpCut }, true);
      this.vy *= PLAYER.jumpCut;
    }

    // dive: past apex, airborne (GDD §5.3)
    if (input.divePressed && !this.grounded && this.vy > -100 && this.stompCooldown <= 0) {
      this.diving = true;
      this.body.setLinvel({ x: this.vx, y: PLAYER.diveSpeed }, true);
      this.vy = PLAYER.diveSpeed;
    }

    // landing → active stomp (dive) or passive compress (GDD §5.3)
    if (this.grounded && !this.wasGrounded) {
      const impactDv = Math.abs(this.prevVy);
      if (this.diving && this.stompCooldown <= 0) {
        this.stompCooldown = PLAYER.stomp.cooldownSec;
        const count = this.stompImpulse(this.x, this.y, {
          radiusPx: PLAYER.stomp.radiusPx,
          maxDv: PLAYER.stomp.maxDv,
          downBias: PLAYER.stomp.downBias,
          maxBodies: PLAYER.stomp.maxBodies,
        });
        this.hooks.onStomp(this.x, this.y, count, true);
      } else {
        const count = this.stompImpulse(this.x, this.y, {
          radiusPx: PLAYER.landCompress.radiusPx,
          maxDv: PLAYER.landCompress.maxDv,
          downBias: 0.35,
          maxBodies: PLAYER.landCompress.maxBodies,
        });
        if (count > 0) this.hooks.onStomp(this.x, this.y, count, false);
      }
      this.diving = false;
      this.squash = Math.min(0.16, impactDv / 6000);
      this.hooks.onLand(this.x, this.y, impactDv, this.onBodies);
    }
    this.wasGrounded = this.grounded;
    this.prevVy = this.vy;
    this.stompCooldown = Math.max(0, this.stompCooldown - dt);
    this.squash = Math.max(0, this.squash - dt * 1.2);
  }

  /** GDD §33.5 — controlled stomp: clamp-нутый Δv (радиально + down-байас), максимум тел. */
  stompImpulse(x: number, y: number, cfg: StompCfg): number {
    let affected = 0;
    for (const b of this.world.bodiesInRadius(x, y, cfg.radiusPx)) {
      if (b.kind === 'static' || b.kind === 'player') continue;
      if (affected >= cfg.maxBodies) break;
      const falloff = 1 - b.dist / cfg.radiusPx;
      const dv = falloff * cfg.maxDv;
      if (dv < 4) continue;
      let dx = b.dist > 0.001 ? (b.pos.x - x) / b.dist : 0;
      let dy = b.dist > 0.001 ? (b.pos.y - y) / b.dist : 0.5;
      const keep = 1 - cfg.downBias;
      dx *= keep;
      dy = dy * keep + cfg.downBias;
      const m = b.body.mass();
      b.body.applyImpulse({ x: dx * dv * m, y: dy * dv * m }, true);
      affected++;
    }
    return affected;
  }

  /** Вырубание: освобождаем вращение — тело обмякает и кувыркается; управление вернётся через stunSec. */
  stun(sec: number): void {
    if (!this.body || !this.alive) return;
    this.stunTimer = Math.max(this.stunTimer, sec);
    this.diving = false;
    this.lockRot(false);
    this.body.setAngvel((Math.random() - 0.5) * 7, true);
  }

  private lockRot(lock: boolean): void {
    if (!this.body) return;
    try {
      (this.body as unknown as { lockRotations?: (lock: boolean, wake: boolean) => void }).lockRotations?.(lock, true);
    } catch {
      // binding drift — вращение остаётся как есть
    }
  }

  /** Game over: игрок перестаёт управляться, тело обмякает, остаётся физическим объектом. */
  kill(): void {
    this.alive = false;
    this.lockRot(false);
    if (this.body) this.body.setAngvel((Math.random() - 0.5) * 5, true);
  }
}
