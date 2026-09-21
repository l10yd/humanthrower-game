/** Game: orchestrator — fixed-step pipeline (GDD §22.1), state machine menu/playing/paused/gameover,
 * wiring of all systems. Gameplay never imports Pixi; render never imports Rapier (GDD §2). */
import { Graphics } from 'pixi.js';
import type { Application } from 'pixi.js';
import type RAPIER from '@dimforge/rapier2d-compat';
import { Clock } from './Clock';
import { Input } from './Input';
import { Rng, randomSeed } from './Rng';
import {
  CELL,
  DANGER_LINE_Y,
  GLASS_FLOOR_Y,
  GLASS_LEFT,
  GLASS_W,
  PHYS,
  ROWS,
  WARNING_ROW,
} from '../config/balance';
import { ROW_CLEAR } from '../config/rowClear';
import { PLAYER } from '../config/player';
import type { ArchetypeId } from '../config/difficulty';
import type { Settings, QualityTier } from '../config/settings';
import { QUALITY_PROFILES } from '../config/settings';
import { generateVariant } from '../config/palette';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { createPieceBody } from '../physics/PieceFactory';
import { RagdollSystem } from '../gameplay/RagdollSystem';
import { GridManager } from '../gameplay/GridManager';
import { detectCompletedRows } from '../gameplay/RowDetector';
import { ClearScheduler } from '../gameplay/ClearScheduler';
import { DetachmentSystem } from '../gameplay/DetachmentSystem';
import { HumanSpawner } from '../gameplay/HumanSpawner';
import { PlayerController } from '../gameplay/PlayerController';
import { StackManager, type GameOverReason } from '../gameplay/StackManager';
import { ScoreSystem } from '../gameplay/ScoreSystem';
import { DifficultyDirector } from '../gameplay/DifficultyDirector';
import { Renderer } from '../render/Renderer';
import { CameraSystem } from '../render/CameraSystem';
import { EnvironmentRenderer } from '../render/EnvironmentRenderer';
import { HumanRenderer } from '../render/HumanRenderer';
import { PlayerRenderer } from '../render/PlayerRenderer';
import { VfxSystem } from '../render/VfxSystem';
import { buildAtlas } from '../render/AtlasFactory';
import { AudioManager } from '../audio/AudioManager';
import { Save } from '../infra/Save';
import { PerformanceMonitor } from '../infra/PerformanceMonitor';
import { Ui } from '../ui/Ui';

export type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover';

export class Game {
  phase: GamePhase = 'menu';
  clock: Clock;
  input = new Input();
  rng: Rng;
  seed: number;
  world: PhysicsWorld;
  ragdolls: RagdollSystem;
  grid: GridManager;
  clearScheduler: ClearScheduler;
  detachment: DetachmentSystem;
  spawner: HumanSpawner;
  player: PlayerController;
  stack: StackManager;
  score: ScoreSystem;
  difficulty: DifficultyDirector;
  renderer: Renderer;
  camera: CameraSystem;
  env: EnvironmentRenderer;
  humanRenderer: HumanRenderer;
  playerRenderer: PlayerRenderer;
  vfx: VfxSystem;
  audio: AudioManager;
  perf = new PerformanceMonitor();
  save: Save;
  settings: Settings;
  ui: Ui;
  debug = false;
  private autoTier: QualityTier = 'high';
  private stepCounter = 0;
  private rowScratch: number[] = [];
  private lastNow = 0;
  private dodgeTimer = 0;
  private debugG: Graphics;

  constructor(ra: typeof RAPIER, app: Application, container: HTMLElement) {
    this.save = new Save();
    this.settings = this.save.data.settings;
    this.seed = randomSeed();
    this.rng = new Rng(this.seed);
    this.clock = new Clock(1 / PHYS.fixedHz, PHYS.maxSubsteps);

    // --- gameplay systems ---
    this.world = new PhysicsWorld(ra);
    this.ragdolls = new RagdollSystem(this.world, {
      onImpact: (part, dv) => {
        if (dv > 350) {
          this.camera.addImpact(Math.min(0.5, dv / 3000));
          this.audio.play('impact', Math.min(1, 0.3 + dv / 2200));
          this.vfx.dust(part.curX, part.curY + part.halfH, 3 + Math.floor(dv / 500));
        } else {
          this.audio.play('bump', 0.55);
        }
      },
      onSettled: () => {},
      onWake: () => {},
    });

    this.grid = new GridManager();
    this.clearScheduler = new ClearScheduler({
      onPhase: (rows, phase) => {
        if (this.phase === 'menu') return;
        void rows;
        this.audio.play(phase === 'warning' ? 'warning' : 'tension');
        if (phase === 'dangerous') this.vfx.hitStop(40);
      },
      revalidate: (rows) => {
        const live = rows.filter((r) => this.grid.coverage(r) >= ROW_CLEAR.fillCoverage);
        return live.length > 0 ? live : null;
      },
      applyMutations: (rows) => this.applyClear(rows),
      onCancel: () => {},
    });

    this.detachment = new DetachmentSystem(this.world, this.ragdolls, this.grid, {
      onDestroyed: (x, y, _role, variant) => {
        this.vfx.confetti(x, y, 8, [variant.shirt, variant.pants, variant.skin]);
        this.audio.play('pop', 0.6);
      },
      onDetached: (x, y) => {
        this.vfx.ring(x, y, 26);
        this.audio.play('pop', 0.5);
      },
    });

    this.player = new PlayerController(this.world, {
      onJump: () => this.audio.play('jump'),
      onLand: (x, y, dv, onBodies) => {
        if (dv > 250) {
          this.camera.addImpact(Math.min(0.4, dv / 3500));
          this.audio.play('bump', Math.min(1, 0.4 + dv / 1800));
          if (onBodies) this.vfx.dust(x, y + 26, 4);
        }
      },
      onStomp: (x, y, count, active) => {
        if (active) {
          this.audio.play('stomp');
          this.vfx.ring(x, y, 90);
          this.vfx.dust(x, y + 18, 10);
          this.camera.addImpact(0.35);
        }
        this.score.onStomp(count);
      },
    });

    this.spawner = new HumanSpawner(this.world, this.ragdolls, this.rng, {
      onSpawned: () => {},
    });
    this.stack = new StackManager(this.grid, this.ragdolls, {
      onGameOver: (reason) => this.gameOver(reason),
    });
    this.score = new ScoreSystem(this.save);
    this.difficulty = new DifficultyDirector();

    // --- render layer ---
    this.renderer = new Renderer(app);
    this.camera = new CameraSystem(this.renderer.worldRoot);
    this.env = new EnvironmentRenderer(this.renderer.layers.env);
    const atlas = buildAtlas(app);
    this.humanRenderer = new HumanRenderer(this.renderer.layers.pile, atlas);
    this.playerRenderer = new PlayerRenderer(this.renderer.layers.player, atlas, this.player);
    this.vfx = new VfxSystem(this.renderer.layers.fx, this.clock, { spark: atlas.spark, dust: atlas.dust });
    this.debugG = new Graphics();
    this.renderer.layers.debug.addChild(this.debugG);

    // --- audio + ui ---
    this.audio = new AudioManager(this.settings);
    this.ui = new Ui(
      container,
      {
        onPlay: () => this.startRun(),
        onRetry: () => this.startRun(),
        onMenu: () => this.toMenu(),
        onResume: () => this.resume(),
        onRestart: () => this.startRun(),
        onPauseToggle: () => (this.phase === 'playing' ? this.pause() : this.resume()),
        onSettingsChange: (s) => this.applySettings(s),
      },
      this.settings,
      this.input,
    );
    this.ui.onAudioUnlock(() => this.audio.unlock());
    this.ui.showScreen('menu', { best: Math.floor(this.score.best) });
    this.input.attach(window);
  }

  // ---------- lifecycle ----------

  attachCanvas(canvas: HTMLCanvasElement): void {
    this.ui.attachCanvas(canvas);
  }

  /** Letterbox resize; returns the computed world→screen scale. */
  resize(): number {
    const scale = this.renderer.resize(this.qualityTier());
    this.ui.resize(scale);
    return scale;
  }

  qualityTier(): QualityTier {
    return this.settings.quality === 'auto' ? this.autoTier : this.settings.quality;
  }

  applySettings(s: Settings): void {
    this.settings = s;
    this.save.data.settings = s;
    this.save.save();
    this.audio.applySettings(s);
    this.resize();
  }

  /** ?seed / ?scenario / ?debug=1 / ?autostart=1 (GDD §54). */
  applyUrlParams(params: URLSearchParams): void {
    if (params.get('debug') === '1') {
      this.debug = true;
      this.ui.debug.setVisible(true);
      this.exposeDebugHooks();
    }
    const scenarioId = params.get('scenario');
    if (scenarioId) {
      void import('../../tests/scenarios')
        .then((mod) => {
          const scenario = mod.SCENARIOS[scenarioId];
          if (scenario) {
            this.seed = scenario.seed;
            this.spawner.scenarioMode = true;
            this.spawner.scenarioSpawns = scenario.spawns;
            this.startRun(scenario.seed);
          }
        })
        .catch(() => {});
      return;
    }
    if (params.get('autostart') === '1') this.startRun();
  }

  startRun(seed?: number): void {
    this.seed = seed ?? randomSeed();
    this.rng = new Rng(this.seed);
    this.player.despawn();
    this.spawner.poolAll();
    this.ragdolls.discardAll();
    this.world.resetDynamic();
    this.ragdolls.reset();
    this.grid.reset();
    this.clearScheduler.reset();
    this.spawner.reset();
    this.stack.reset();
    this.score.reset();
    this.difficulty.reset();
    this.camera.reset();
    this.vfx.reset();
    this.player.spawn();
    this.phase = 'playing';
    this.ui.showScreen(null);
    this.audio.unlock();
  }

  toMenu(): void {
    this.phase = 'menu';
    this.player.despawn();
    this.ui.showScreen('menu', { best: Math.floor(this.score.best) });
    this.audio.unlock();
  }

  pause(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.ui.showScreen('pause');
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.clock.reset();
    this.ui.showScreen(null);
  }

  onHidden(): void {
    if (this.phase === 'playing') this.pause();
  }

  gameOver(reason: GameOverReason): void {
    if (this.phase !== 'playing') return;
    this.phase = 'gameover';
    this.player.kill();
    this.save.data.bestScore = Math.floor(this.score.best);
    this.save.save();
    this.vfx.slowMo(0.3, 0.8);
    this.audio.play('gameover');
    this.ui.showScreen('gameover', {
      score: Math.floor(this.score.score),
      best: Math.floor(this.score.best),
      newBest: this.score.newBest,
      reason,
    });
  }

  // ---------- fixed-step pipeline (GDD §22.1) ----------

  private fixedStep(dt: number): void {
    // 1–2: clear phases + transaction at the safe boundary (before physics step)
    this.clearScheduler.tick(dt);
    // 3: player controller
    this.player.update(dt, this.input.consume());
    // 4: spawn director
    this.spawner.update(dt, this.difficulty.t, this.player, this.stack.dangerActive);
    // 5: physics step (collision events drained inside)
    this.world.step();
    // 6–7: ragdoll FSM
    this.ragdolls.update(dt);
    this.headHitCheck();
    // 8: grid resample (every 3rd fixed step, GDD §9.2)
    this.stepCounter++;
    if (this.stepCounter % 3 === 0) this.sampleGrid();
    // 9: row detection
    detectCompletedRows((r) => this.grid.coverage(r), ROWS, ROW_CLEAR.fillCoverage, this.rowScratch);
    for (const row of this.rowScratch) this.clearScheduler.onRowCompleted(row);
    // 10: stack (danger band / trapped)
    this.stack.update(dt, this.player.x, this.player.y, this.player.alive);
    if (this.phase !== 'playing') return;
    if (this.spawner.blockedGrace >= PHYS.spawnBlockedGraceSec) this.gameOver('spawnBlocked');
    if (this.phase !== 'playing') return;
    // 11–12: score + difficulty
    this.score.update(dt);
    this.difficulty.update(dt);
    this.dodgeCheck(dt);
    this.audio.setIntensity(this.musicLevel());
    this.drainScoreEvents();
  }

  /** Menu idle scene: physics + spawning without player/game-over/score (GDD §17.3). */
  private demoStep(dt: number): void {
    this.clearScheduler.tick(dt);
    this.spawner.update(dt, this.difficulty.t, this.player, this.stack.dangerActive);
    this.world.step();
    this.ragdolls.update(dt);
    this.stepCounter++;
    if (this.stepCounter % 3 === 0) this.sampleGrid();
    detectCompletedRows((r) => this.grid.coverage(r), ROWS, ROW_CLEAR.fillCoverage, this.rowScratch);
    for (const row of this.rowScratch) this.clearScheduler.onRowCompleted(row);
    this.stack.update(dt, -1000, -1000, false);
    this.difficulty.update(dt);
    this.drainScoreEvents();
  }

  private sampleGrid(): void {
    for (const p of this.ragdolls.coreParts()) {
      if (!p.body.isEnabled()) continue;
      if (p.state === 'falling') continue; // летящее тело не заполняет (GDD §9.3 п.5)
      const weight = p.state === 'settled' ? 1.0 : 0.5;
      this.grid.submit({
        id: p.id,
        x: p.curX,
        y: p.curY,
        angle: p.curAngle,
        halfW: p.halfW,
        halfH: p.halfH,
        weight,
      });
    }
    if (this.ragdolls.destroyedIds.length > 0) {
      for (const id of this.ragdolls.destroyedIds) this.grid.removePart(id);
      this.ragdolls.destroyedIds = [];
    }
    this.grid.endSample();
  }

  private applyClear(rows: number[]): void {
    // Уничтожение ряда может накрыть игрока (GDD §33.6): торс в очищаемом ряду в момент
    // транзакции → смерть. В прыжке (в воздухе) — спасён.
    const torsoRow = this.player.alive && this.player.grounded
      ? (this.grid.cellAt(this.player.x, this.player.y - 10)?.row ?? -1)
      : -1;
    const caught = torsoRow >= 0 && rows.includes(torsoRow);
    const res = this.detachment.execute(rows);
    const top = Math.min(...rows);
    const y = GLASS_FLOOR_Y - (top + 0.5) * CELL;
    if (this.phase !== 'menu') this.score.onClear(rows.length, false, GLASS_LEFT + GLASS_W / 2, y);
    this.vfx.slice(top, this.score.combo);
    this.vfx.hitStop(60);
    this.vfx.slowMo(0.45, 0.14);
    this.camera.addZoomPulse();
    if (this.settings.haptics) (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(24);
    if (caught && this.phase === 'playing') {
      this.player.kill();
      this.gameOver('swept');
    }
    void res;
  }

  /** Удар падающей фигурки по голове игрока → вырубание: управление выключено, тело обмякает (GDD §5.4). */
  private headHitCheck(): void {
    if (!this.player.alive || this.player.stunTimer > 0) return;
    const headY = this.player.y - 26;
    for (const p of this.ragdolls.coreParts()) {
      if (p.state !== 'falling' && p.state !== 'landing') continue;
      if (p.curY > this.player.y - 12) continue; // часть должна быть выше игрока
      const d = Math.hypot(p.curX - this.player.x, p.curY - headY);
      if (d > 46) continue;
      const relVy = p.curY - p.prevY; // смещение за шаг (px) — вниз положительно
      if (relVy < 3.5) continue; // < 210 px/s — не засчитываем
      this.player.stun(PLAYER.stunSec);
      this.audio.play('bump', 1, 0.6);
      this.camera.addImpact(0.5);
      this.vfx.ring(this.player.x, headY, 44);
      return;
    }
  }

  private dodgeCheck(dt: number): void {
    this.dodgeTimer += dt;
    if (this.dodgeTimer < 0.3) return;
    this.dodgeTimer = 0;
    if (!this.player.alive || Math.abs(this.player.vx) < 120) return;
    for (const p of this.ragdolls.coreParts()) {
      if (p.state !== 'falling') continue;
      const d = Math.hypot(p.curX - this.player.x, p.curY - this.player.y);
      if (d < 75 && d > 30) {
        this.score.onDodge(this.player.x, this.player.y - 60);
        return;
      }
    }
  }

  private musicLevel(): number {
    if (this.stack.dangerActive) return 3;
    if (this.grid.coverage(WARNING_ROW) > 0.15) return 2;
    if (this.grid.coverage(Math.max(0, WARNING_ROW - 3)) > 0.1) return 1;
    return 0;
  }

  private drainScoreEvents(): void {
    if (this.score.events.size === 0) return;
    for (const ev of this.score.events.drain()) this.vfx.floating(ev.text, ev.x, ev.y, ev.color);
  }

  // ---------- frame ----------

  /** Called once per rAF from main. */
  frame(nowMs: number): void {
    const dtMs = Math.min(Math.max(nowMs - this.lastNow, 0), 100);
    this.lastNow = nowMs;
    let alpha = 0;
    if (this.phase === 'playing') {
      alpha = this.clock.frame(nowMs, (dt) => this.fixedStep(dt));
    } else if (this.phase === 'menu') {
      alpha = this.clock.frame(nowMs, (dt) => this.demoStep(dt));
    }

    // render path (always — menu idle scene, pause frozen pose)
    this.camera.update(dtMs, this.settings.reducedMotion);
    this.humanRenderer.sync(this.ragdolls);
    this.humanRenderer.update(alpha, this.ragdolls);
    this.playerRenderer.update(alpha, dtMs, this.settings.reducedMotion);
    this.env.update({
      warningRows: this.clearScheduler.warningRows(),
      dangerousRows: this.clearScheduler.dangerousRows(),
      dangerActive: this.stack.dangerActive,
      dangerLevel: this.difficulty.level,
      dtMs,
    });
    this.vfx.update(dtMs, QUALITY_PROFILES[this.qualityTier()].particleScale);
    const tierChange = this.perf.tick(dtMs, this.settings.quality === 'auto');
    if (tierChange === 'down') this.autoTierDown();
    else if (tierChange === 'up') this.autoTierUp();

    this.ui.hudUpdate(this.score, this.stack, dtMs);
    if (this.debug) {
      this.perf.stepMsAvg = this.clock.stepMsAvg;
      this.debugDraw();
      this.ui.debugUpdate({
        clockFps: this.clock.fps,
        perf: this.perf,
        world: this.world,
        ragdolls: this.ragdolls,
        grid: this.grid,
        clearScheduler: this.clearScheduler,
        spawner: this.spawner,
        player: this.player,
        difficulty: this.difficulty,
      });
    }
    if (this.input.consumeDebug()) {
      this.debug = !this.debug;
      this.ui.debug.setVisible(this.debug);
    }
    if (this.phase === 'playing' && this.input.consumePause()) this.pause();
    else if (this.phase === 'paused' && this.input.consumePause()) this.resume();
    this.renderer.render();
  }

  private autoTierDown(): void {
    this.autoTier = this.autoTier === 'high' ? 'medium' : 'low';
    this.resize();
  }

  private autoTierUp(): void {
    this.autoTier = this.autoTier === 'low' ? 'medium' : 'high';
    this.resize();
  }

  // ---------- debug ----------

  private debugDraw(): void {
    this.debugG.clear();
    for (let r = 0; r < this.grid.rows; r++) {
      for (let c = 0; c < this.grid.cols; c++) {
        if (!this.grid.isOccupied(c, r)) continue;
        const { x, y } = this.grid.cellCenter(c, r);
        this.debugG.rect(x - CELL / 2, y - CELL / 2, CELL, CELL).stroke({ width: 1, color: 0x44ff88, alpha: 0.7 });
      }
    }
    for (const p of this.ragdolls.parts.values()) {
      if (!p.alive || !p.body.isEnabled()) continue;
      const t = p.body.translation();
      const color = p.isPiece ? 0xffd24c : 0x66aaff;
      if (p.role === 'head') {
        this.debugG.circle(t.x, t.y, p.halfW).stroke({ width: 1, color, alpha: 0.9 });
      } else {
        const cos = Math.cos(p.curAngle);
        const sin = Math.sin(p.curAngle);
        const hw = p.halfW;
        const hh = p.halfH;
        const pts = [
          { x: t.x + cos * hw - sin * hh, y: t.y + sin * hw + cos * hh },
          { x: t.x - cos * hw - sin * hh, y: t.y - sin * hw + cos * hh },
          { x: t.x - cos * hw + sin * hh, y: t.y - sin * hw - cos * hh },
          { x: t.x + cos * hw + sin * hh, y: t.y + sin * hw - cos * hh },
        ];
        for (let i = 0; i < 4; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % 4];
          this.debugG.moveTo(a.x, a.y).lineTo(b.x, b.y);
        }
        this.debugG.stroke({ width: 1, color, alpha: 0.9 });
      }
    }
    if (this.player.body && this.player.alive) {
      const t = this.player.body.translation();
      this.debugG.rect(t.x - 25, t.y - 36, 50, 72).stroke({ width: 1.5, color: 0xffffff, alpha: 0.9 });
    }
    this.debugG
      .moveTo(GLASS_LEFT, DANGER_LINE_Y)
      .lineTo(GLASS_LEFT + GLASS_W, DANGER_LINE_Y)
      .stroke({ width: 1, color: 0xff4c5c, alpha: 0.8 });
  }

  /** window.__HT_DEBUG__ behind ?debug=1 (GDD §54, e2e hooks). */
  exposeDebugHooks(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__HT_DEBUG__ = {
      forceSpawn: (archetype?: string) => this.spawner.forceSpawn((archetype as ArchetypeId | undefined) ?? null),
      forceRowComplete: (row?: number) => this.forceFillRow(row ?? 1),
      killPlayer: () => this.gameOver('crushed'),
      fly: (on?: boolean) => {
        this.player.debugFly = on ?? true;
      },
      addScore: (n: number) => this.score.add(n),
      getState: () => ({
        phase: this.phase,
        score: Math.floor(this.score.score),
        best: Math.floor(this.score.best),
        bodies: this.world.dynamicCount(),
        humans: this.ragdolls.humans.filter((h) => !h.pooled).length,
      }),
      dumpParts: () => {
        const out: Array<Record<string, unknown>> = [];
        const jointBodies = new Set<number>();
        for (const h of this.ragdolls.humans) {
          if (h.pooled) continue;
          for (const j of h.joints) {
            jointBodies.add(j.aHandle);
            jointBodies.add(j.bHandle);
          }
        }
        for (const p of this.ragdolls.parts.values()) {
          out.push({
            id: p.id,
            role: p.role,
            state: p.state,
            x: Math.round(p.curX),
            y: Math.round(p.curY),
            rot: +p.curAngle.toFixed(2),
            hw: +p.halfW.toFixed(1),
            hh: +p.halfH.toFixed(1),
            enabled: p.body.isEnabled(),
            piece: p.isPiece,
            jointed: jointBodies.has(p.body.handle),
            handle: p.body.handle,
          });
        }
        const pl = this.player.body?.translation();
        if (pl) out.push({ id: 0, role: 'player', state: this.player.stunTimer > 0 ? 'stunned' : 'ok', x: Math.round(pl.x), y: Math.round(pl.y) });
        return out;
      },
    };
  }

  /** Debug/e2e: fill a row with single-body pieces at cell centers (drop 50 px → guaranteed
   * landing dv > 300 → settle → row completes). */
  forceFillRow(row: number): void {
    const r = Math.max(0, Math.min(this.grid.rows - 1, row));
    for (let c = 0; c < this.grid.cols; c++) {
      const { x, y } = this.grid.cellCenter(c, r);
      const build = createPieceBody(this.world, 'torso', x, y - 50);
      this.ragdolls.registerPiece(build, generateVariant(this.rng));
    }
  }
}
