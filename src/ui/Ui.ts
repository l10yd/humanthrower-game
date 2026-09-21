/** Ui: DOM overlay root — HUD / touch / screens / debug above the canvas (GDD §17). */
import type { Settings } from '../config/settings';
import type { QualityTier } from '../config/settings';
import type { ScoreSystem } from '../gameplay/ScoreSystem';
import type { StackManager, GameOverReason } from '../gameplay/StackManager';
import { Hud } from './Hud';
import { Menus, type ScreenName } from './Menus';
import { TouchControls } from './TouchControls';
import { DebugOverlay, type DebugDeps } from './DebugOverlay';

export interface UiCallbacks {
  onPlay(): void;
  onRetry(): void;
  onMenu(): void;
  onResume(): void;
  onRestart(): void;
  onPauseToggle(): void;
  onSettingsChange(s: Settings): void;
}

export class Ui {
  stage = document.createElement('div');
  hud: Hud;
  menus: Menus;
  touch: TouchControls;
  debug: DebugOverlay;
  private savedSettings: Settings;

  constructor(
    container: HTMLElement,
    callbacks: UiCallbacks,
    settings: Settings,
    touchInput: InputLike,
  ) {
    this.savedSettings = settings;
    this.stage.className = 'ht-stage';
    container.appendChild(this.stage);

    this.hud = new Hud(callbacks.onPauseToggle);
    this.menus = new Menus({
      onPlay: () => {
        this.audioUnlockHint();
        callbacks.onPlay();
      },
      onRetry: () => callbacks.onRetry(),
      onMenu: () => callbacks.onMenu(),
      onResume: () => callbacks.onResume(),
      onRestart: () => callbacks.onRestart(),
      onPauseToggle: () => callbacks.onPauseToggle(),
      onSettings: (s) => {
        this.savedSettings = s;
        callbacks.onSettingsChange(s);
      },
    });
    this.touch = new TouchControls(touchInput);
    this.debug = new DebugOverlay();

    // canvas is appended by main between world layers and DOM overlay
    this.stage.append(this.hud.root, this.touch.root, this.menus.menuEl, this.menus.settingsEl, this.menus.pauseEl, this.menus.gameoverEl, this.debug.root);

    // any gesture unlocks audio
    window.addEventListener('pointerdown', () => this.audioUnlockHint(), { passive: true });
  }

  private audioUnlockCb: (() => void) | null = null;
  onAudioUnlock(cb: () => void): void {
    this.audioUnlockCb = cb;
  }
  private audioUnlockHint(): void {
    this.audioUnlockCb?.();
  }

  /** Insert the canvas below DOM overlay elements. */
  attachCanvas(canvas: HTMLCanvasElement): void {
    canvas.className = 'ht-canvas';
    this.stage.insertBefore(canvas, this.hud.root);
  }

  resize(scale: number): void {
    const w = Math.round(720 * scale);
    const h = Math.round(1280 * scale);
    this.stage.style.width = `${w}px`;
    this.stage.style.height = `${h}px`;
    const fontScale = Math.max(0.75, Math.min(1.25, scale));
    this.stage.style.fontSize = `${fontScale * 16}px`;
  }

  showScreen(which: ScreenName, data?: { score?: number; best?: number; newBest?: boolean; reason?: GameOverReason }): void {
    this.menus.show(which, { ...data, settings: this.savedSettings });
    const inGame = which === null;
    this.hud.setVisible(inGame);
    this.touch.setVisible(inGame && 'ontouchstart' in window);
  }

  hudUpdate(score: ScoreSystem, stack: StackManager, throttleMs: number): void {
    void throttleMs;
    this.hud.update(score, stack);
  }

  debugUpdate(deps: DebugDeps): void {
    this.debug.update(deps);
  }
}

export type { QualityTier };
export interface InputLike {
  touchLeft(v: boolean): void;
  touchRight(v: boolean): void;
  touchJump(down: boolean): void;
}
