/** Boot: feature detect → Rapier init → Pixi app init → Game construct → rAF (GDD §22, §49). */
import RAPIER from '@dimforge/rapier2d-compat';
import { Application } from 'pixi.js';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './config/balance';
import { Game } from './core/Game';
import './ui/ui.css';

async function boot(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) return;

  // feature detect (GDD §49)
  const probe = document.createElement('canvas');
  const hasWebGL2 = !!probe.getContext('webgl2');
  const hasWasm = typeof WebAssembly === 'object';
  if (!hasWebGL2 || !hasWasm) {
    container.innerHTML =
      '<div class="ht-unsupported">Браузер не поддерживает WebGL2 / WebAssembly.<br/>Обновите браузер или включите аппаратное ускорение.</div>';
    return;
  }

  // WASM engine
  await RAPIER.init();

  const params = new URLSearchParams(window.location.search);
  const pref = params.get('gpu') === '1' ? 'webgpu' : 'webgl';
  const app = new Application();
  try {
    await app.init({
      width: LOGICAL_WIDTH,
      height: LOGICAL_HEIGHT,
      background: 0x0a0d18,
      antialias: true,
      preference: pref as 'webgpu' | 'webgl',
    });
  } catch {
    await app.init({
      width: LOGICAL_WIDTH,
      height: LOGICAL_HEIGHT,
      background: 0x0a0d18,
      antialias: true,
      preference: 'webgl',
    });
  }

  const game = new Game(RAPIER, app, container);
  game.attachCanvas(app.canvas);
  game.resize();
  window.addEventListener('resize', () => game.resize());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.onHidden();
  });
  game.applyUrlParams(params);

  const loop = (now: number): void => {
    game.frame(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void boot();
