/** Debug overlay: DOM panel + grid minimap (GDD §25). Toggle: ` / F3. */
import { COLS, ROWS } from '../config/balance';
import type { GridManager } from '../gameplay/GridManager';
import type { ClearScheduler } from '../gameplay/ClearScheduler';
import type { DifficultyDirector } from '../gameplay/DifficultyDirector';
import type { HumanSpawner } from '../gameplay/HumanSpawner';
import type { PlayerController } from '../gameplay/PlayerController';
import type { RagdollSystem } from '../gameplay/RagdollSystem';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { PerformanceMonitor } from '../infra/PerformanceMonitor';

export interface DebugDeps {
  clockFps: number;
  perf: PerformanceMonitor;
  world: PhysicsWorld;
  ragdolls: RagdollSystem;
  grid: GridManager;
  clearScheduler: ClearScheduler;
  spawner: HumanSpawner;
  player: PlayerController;
  difficulty: DifficultyDirector;
}

export class DebugOverlay {
  root = document.createElement('div');
  private minimap = document.createElement('canvas');
  private text = document.createElement('div');
  visible = false;

  constructor() {
    this.root.className = 'ht-debug';
    this.minimap.width = COLS * 10;
    this.minimap.height = ROWS * 10;
    this.minimap.className = 'ht-debug-minimap';
    this.text.className = 'ht-debug-text';
    this.root.append(this.minimap, this.text);
    this.root.style.display = 'none';
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.style.display = v ? 'flex' : 'none';
  }

  update(d: DebugDeps): void {
    if (!this.visible) return;
    const counts = d.world.counts();
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    let joints = 0;
    for (const h of d.ragdolls.humans) joints += h.joints.length;
    const rows: string[] = [];
    for (const r of d.clearScheduler.warningRows()) rows.push(`W${r}`);
    for (const r of d.clearScheduler.dangerousRows()) rows.push(`D${r}`);
    this.text.innerHTML =
      `FPS ${d.clockFps} · frame ${d.perf.frameMs().toFixed(1)}ms · step ${d.perf.stepMsAvg.toFixed(2)}ms<br/>` +
      `bodies ${d.world.dynamicCount()} (awake ${counts.awake} / sleep ${counts.sleeping} / frozen ${counts.frozen}) · joints ${joints}<br/>` +
      `grid occupied ${d.grid.totalOccupied()} · rows [${rows.join(' ') || '—'}]<br/>` +
      `player ${d.player.alive ? `${d.player.grounded ? 'ground' : 'air'}${d.player.diving ? ' dive' : ''}${d.player.crouching ? ' crouch' : ''}` : '—'} · spawn ${d.spawner.lastSpawnArchetype ?? '—'} #${d.spawner.spawnCount}<br/>` +
      `difficulty D${d.difficulty.level}${mem ? ` · heap ${(mem.usedJSHeapSize / 1048576).toFixed(1)}MB` : ''}`;

    const ctx = this.minimap.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.minimap.width, this.minimap.height);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!d.grid.isOccupied(c, r)) continue;
        ctx.fillStyle = r >= 10 ? '#ff4c5c' : '#8fa8d0';
        ctx.fillRect(c * 10, (ROWS - 1 - r) * 10, 9, 9);
      }
    }
  }
}
