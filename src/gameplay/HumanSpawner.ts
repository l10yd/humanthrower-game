/** Spawn director: timing, archetype pick (difficulty weights), corridor check, anti-frustration
 * (GDD §27, §33.3). Pools ragdolls per archetype. */
import { GLASS_LEFT, GLASS_W, PHYS, SPAWN_Y } from '../config/balance';
import { ARCHETYPES } from '../config/archetypes';
import {
  levelAt,
  pickArchetype,
  spawnIntervalAt,
  spawnVelocityAt,
  targetingPAt,
} from '../config/difficulty';
import type { ArchetypeId } from '../config/difficulty';
import { generateVariant } from '../config/palette';
import type { Rng } from '../core/Rng';
import { createRagdoll } from '../physics/RagdollFactory';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { RagdollHandle, RagdollSystem } from './RagdollSystem';
import type { PlayerController } from './PlayerController';

export interface SpawnHooks {
  onSpawned(handle: RagdollHandle): void;
}

export interface ScenarioSpawn {
  t: number;
  archetype: ArchetypeId;
  x: number; // offset from glass centre
}

export class HumanSpawner {
  private pools = new Map<ArchetypeId, RagdollHandle[]>();
  private timer = 1.1;
  private history: ArchetypeId[] = [];
  private scenarioIndex = 0;
  blockedGrace = 0;
  lastSpawnArchetype: ArchetypeId | null = null;
  spawnCount = 0;
  scenarioMode = false;
  scenarioSpawns: ScenarioSpawn[] = [];

  constructor(
    private world: PhysicsWorld,
    private ragdolls: RagdollSystem,
    private rng: Rng,
    private hooks: SpawnHooks,
  ) {}

  update(dt: number, t: number, player: PlayerController, dangerActive: boolean): void {
    if (this.ragdolls.coreUnits() >= PHYS.maxCoreUnits) return; // population cap (GDD §8.5)
    this.timer -= dt;
    if (this.timer > 0) return;

    if (this.scenarioMode) {
      this.runScenario(t);
      return;
    }

    const level = levelAt(t);
    let archetype = pickArchetype(this.rng, t);
    // anti-frustration relief: 5 последних не-NORMAL → гарантированный NORMAL (GDD §12.4)
    const last5 = this.history.slice(-5);
    if (last5.length === 5 && last5.every((id) => id !== 'normal')) archetype = 'normal';

    if (this.trySpawn(archetype, t, player, level, dangerActive)) {
      this.history.push(archetype);
      if (this.history.length > 8) this.history.shift();
      this.lastSpawnArchetype = archetype;
      this.spawnCount++;
      this.timer = spawnIntervalAt(level) * this.rng.range(0.85, 1.15);
    } else {
      this.blockedGrace += 0.25;
      this.timer = 0.25;
    }
  }

  private trySpawn(
    archetypeId: ArchetypeId,
    t: number,
    player: PlayerController,
    level: number,
    dangerActive: boolean,
  ): boolean {
    const a = ARCHETYPES[archetypeId];
    const targetingP = targetingPAt(level);
    const xMin = GLASS_LEFT + a.widthPx * 0.6 + 12;
    const xMax = GLASS_LEFT + GLASS_W - a.widthPx * 0.6 - 12;
    for (let attempt = 0; attempt < 6; attempt++) {
      let x: number;
      if (attempt === 0 && !dangerActive && player.alive && this.rng.chance(targetingP)) {
        x = Math.min(xMax, Math.max(xMin, player.x + this.rng.range(-34, 34)));
      } else {
        x = this.rng.range(xMin, xMax);
      }
      if (this.corridorFree(x, a)) {
        this.spawnAt(archetypeId, x, t);
        return true;
      }
    }
    // last resort: центр стакана
    const cx = GLASS_LEFT + GLASS_W / 2;
    if (this.corridorFree(cx, a)) {
      this.spawnAt(archetypeId, cx, t);
      return true;
    }
    return false;
  }

  /** GDD §33.3: corridor free = нет тел рядом с колонкой спавна (min separation). */
  private corridorFree(x: number, a: { widthPx: number; heightPx: number }): boolean {
    const radius = Math.max(a.widthPx * 0.7, 40) + 26;
    const near = this.world.bodiesInRadius(x, SPAWN_Y + a.heightPx * 0.4, radius);
    for (const b of near) {
      if (Math.abs(b.pos.x - x) < a.widthPx * 0.65 + 18 && b.pos.y > SPAWN_Y - 80) return false;
    }
    return true;
  }

  private spawnAt(archetypeId: ArchetypeId, x: number, t: number): void {
    const a = ARCHETYPES[archetypeId];
    const vy = spawnVelocityAt(levelAt(t));
    let pool = this.pools.get(archetypeId);
    if (!pool) {
      pool = [];
      this.pools.set(archetypeId, pool);
    }
    const pooled = pool.pop();
    if (pooled && this.ragdolls.respawnRagdoll(pooled, x, SPAWN_Y, vy, this.rng.range(-1, 1) * 1.2 * a.toppleBias)) {
      this.hooks.onSpawned(pooled);
      return;
    }
    const variant = generateVariant(this.rng);
    const build = createRagdoll(this.world, a, variant, this.ragdolls.claimHumanId(), x, SPAWN_Y, this.rng);
    const handle = this.ragdolls.addRagdoll(build, vy);
    this.hooks.onSpawned(handle);
  }

  /** Game reset: alive humans → pool (parked + disabled, GDD §35). */
  poolAll(): void {
    for (const h of [...this.ragdolls.humans]) {
      if (!h.alive) continue;
      if (h.parts.every((p) => p.alive)) {
        this.ragdolls.parkRagdoll(h);
        let pool = this.pools.get(h.archetypeId);
        if (!pool) {
          pool = [];
          this.pools.set(h.archetypeId, pool);
        }
        pool.push(h);
      }
    }
    this.ragdolls.humans = this.ragdolls.humans.filter((h) => h.alive && !h.pooled);
  }

  reset(): void {
    this.timer = 1.1;
    this.history = [];
    this.blockedGrace = 0;
    this.scenarioIndex = 0;
  }

  /** Debug/e2e hook: force a spawn. */
  forceSpawn(archetypeId: ArchetypeId | null, x?: number): void {
    const id = archetypeId ?? 'normal';
    this.spawnAt(id, x ?? GLASS_LEFT + GLASS_W / 2, 0);
    this.spawnCount++;
  }

  private runScenario(t: number): void {
    while (this.scenarioIndex < this.scenarioSpawns.length && this.scenarioSpawns[this.scenarioIndex].t <= t) {
      const s = this.scenarioSpawns[this.scenarioIndex++];
      this.spawnAt(s.archetype, GLASS_LEFT + GLASS_W / 2 + s.x, t);
      this.spawnCount++;
    }
    this.timer = 0.5;
  }
}
