/** Menus: main menu / settings / pause / game over screens (GDD §17.3). */
import type { Settings } from '../config/settings';
import type { GameOverReason } from '../gameplay/StackManager';

export type ScreenName = 'menu' | 'settings' | 'pause' | 'gameover' | null;

export interface MenuCallbacks {
  onPlay(): void;
  onRetry(): void;
  onMenu(): void;
  onResume(): void;
  onRestart(): void;
  onPauseToggle(): void;
  onSettings(s: Settings): void;
}

const REASONS: Record<GameOverReason, string> = {
  overflow: 'Стакан переполнился',
  crushed: 'Тебя засыпало',
  spawnBlocked: 'Некуда падать',
  swept: 'Смыло очисткой ряда',
};

export class Menus {
  menuEl = document.createElement('div');
  settingsEl = document.createElement('div');
  pauseEl = document.createElement('div');
  gameoverEl = document.createElement('div');
  private goScore = document.createElement('div');
  private goBest = document.createElement('div');
  private goReason = document.createElement('div');
  private bestValue = document.createElement('div');
  private current: ScreenName = 'menu';
  private bound = false;

  constructor(private callbacks: MenuCallbacks) {
    this.buildMenu();
    this.buildSettings();
    this.buildPause();
    this.buildGameOver();
    for (const el of [this.menuEl, this.settingsEl, this.pauseEl, this.gameoverEl]) el.classList.add('ht-screen');
    this.menuEl.classList.add('on');
  }

  private button(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `ht-btn ${className}`;
    b.textContent = label;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  private buildMenu(): void {
    this.menuEl.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'ht-title';
    title.innerHTML = 'HUMAN<br/>THROWER';
    const sub = document.createElement('div');
    sub.className = 'ht-subtitle';
    sub.textContent = 'Ты — человечек на дне стакана. Переживи падающих людей.';
    this.bestValue.className = 'ht-menu-best';
    const play = this.button('PLAY', 'primary', () => this.callbacks.onPlay());
    const settings = this.button('НАСТРОЙКИ', 'ghost', () => this.show('settings'));
    this.menuEl.append(title, sub, this.bestValue, play, settings);
  }

  private buildSettings(): void {
    this.settingsEl.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'ht-screen-title';
    title.textContent = 'НАСТРОЙКИ';
    const rows = document.createElement('div');
    rows.className = 'ht-settings-rows';
    rows.append(
      this.toggleRow('Звук', 'sound'),
      this.sliderRow('Громкость звука', 'soundVolume'),
      this.toggleRow('Музыка', 'music'),
      this.sliderRow('Громкость музыки', 'musicVolume'),
      this.toggleRow('Reduced motion', 'reducedMotion'),
      this.toggleRow('Haptics (вибрация)', 'haptics'),
      this.qualityRow(),
    );
    const back = this.button('НАЗАД', 'ghost', () => {
      this.callbacks.onSettings(this.readSettings());
      this.show(this.current === 'settings' ? 'menu' : 'pause');
    });
    this.settingsEl.append(title, rows, back);
  }

  private toggleRow(label: string, key: 'sound' | 'music' | 'reducedMotion' | 'haptics'): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'ht-setting-row';
    const lab = document.createElement('span');
    lab.textContent = label;
    const t = document.createElement('button');
    t.className = 'ht-toggle';
    t.dataset.key = key;
    t.addEventListener('click', () => {
      t.classList.toggle('on');
    });
    row.append(lab, t);
    return row;
  }

  private sliderRow(label: string, key: 'soundVolume' | 'musicVolume'): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'ht-setting-row';
    const lab = document.createElement('span');
    lab.textContent = label;
    const s = document.createElement('input');
    s.type = 'range';
    s.min = '0';
    s.max = '100';
    s.dataset.key = key;
    row.append(lab, s);
    return row;
  }

  private qualityRow(): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'ht-setting-row';
    const lab = document.createElement('span');
    lab.textContent = 'Качество';
    const sel = document.createElement('select');
    sel.dataset.key = 'quality';
    for (const [v, label] of [['auto', 'Авто'], ['high', 'Высокое'], ['medium', 'Среднее'], ['low', 'Низкое']] as const) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = label;
      sel.appendChild(opt);
    }
    row.append(lab, sel);
    return row;
  }

  private readSettings(): Settings {
    const q = (this.settingsEl.querySelector('[data-key=quality]') as HTMLSelectElement).value;
    const toggle = (key: string) => (this.settingsEl.querySelector(`[data-key=${key}]`) as HTMLButtonElement).classList.contains('on');
    const slider = (key: string) => Number((this.settingsEl.querySelector(`[data-key=${key}]`) as HTMLInputElement).value) / 100;
    return {
      sound: toggle('sound'),
      music: toggle('music'),
      soundVolume: slider('soundVolume'),
      musicVolume: slider('musicVolume'),
      reducedMotion: toggle('reducedMotion'),
      quality: q as Settings['quality'],
      haptics: toggle('haptics'),
    };
  }

  /** Sync settings UI from persisted values (once, on first open). */
  private syncSettings(s: Settings): void {
    if (this.bound) return;
    this.bound = true;
    const t = (key: string) => (this.settingsEl.querySelector(`[data-key=${key}]`) as HTMLButtonElement);
    t('sound').classList.toggle('on', s.sound);
    t('music').classList.toggle('on', s.music);
    t('reducedMotion').classList.toggle('on', s.reducedMotion);
    t('haptics').classList.toggle('on', s.haptics);
    (this.settingsEl.querySelector('[data-key=soundVolume]') as HTMLInputElement).value = String(Math.round(s.soundVolume * 100));
    (this.settingsEl.querySelector('[data-key=musicVolume]') as HTMLInputElement).value = String(Math.round(s.musicVolume * 100));
    (this.settingsEl.querySelector('[data-key=quality]') as HTMLSelectElement).value = s.quality;
  }

  private buildPause(): void {
    this.pauseEl.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'ht-screen-title';
    title.textContent = 'ПАУЗА';
    this.pauseEl.append(
      title,
      this.button('ПРОДОЛЖИТЬ', 'primary', () => this.callbacks.onResume()),
      this.button('ЗАНОВО', 'ghost', () => this.callbacks.onRestart()),
      this.button('НАСТРОЙКИ', 'ghost', () => {
        this.show('settings');
        this.current = 'pause';
      }),
      this.button('В МЕНЮ', 'ghost', () => this.callbacks.onMenu()),
    );
  }

  private buildGameOver(): void {
    this.gameoverEl.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'ht-screen-title';
    title.textContent = 'GAME OVER';
    this.goScore.className = 'ht-go-score';
    this.goBest.className = 'ht-go-best';
    this.goReason.className = 'ht-go-reason';
    this.gameoverEl.append(
      title,
      this.goScore,
      this.goBest,
      this.goReason,
      this.button('ЕЩЁ РАЗ', 'primary', () => this.callbacks.onRetry()),
      this.button('В МЕНЮ', 'ghost', () => this.callbacks.onMenu()),
    );
  }

  show(which: ScreenName, data?: { score?: number; best?: number; newBest?: boolean; reason?: GameOverReason; settings?: Settings }): void {
    if (which) this.current = which;
    if (data?.settings) this.syncSettings(data.settings);
    this.menuEl.classList.toggle('on', which === 'menu');
    this.settingsEl.classList.toggle('on', which === 'settings');
    this.pauseEl.classList.toggle('on', which === 'pause');
    this.gameoverEl.classList.toggle('on', which === 'gameover');
    if (which === 'menu' && data?.best !== undefined) this.bestValue.textContent = `BEST ${data.best}`;
    if (which === 'gameover' && data) {
      this.goScore.textContent = String(data.score ?? 0);
      this.goBest.textContent = data.newBest ? 'NEW BEST!' : `BEST ${data.best ?? 0}`;
      this.goReason.textContent = data.reason ? REASONS[data.reason] : '';
    }
  }
}
