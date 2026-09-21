/** HUD: score / best / combo / danger chip / struggle meter / pause (GDD §17.2). DOM, ≤ 10 Hz updates. */
import type { ScoreSystem } from '../gameplay/ScoreSystem';
import type { StackManager } from '../gameplay/StackManager';

export class Hud {
  root = document.createElement('div');
  private scoreEl = document.createElement('div');
  private bestEl = document.createElement('div');
  private comboEl = document.createElement('div');
  private comboBar = document.createElement('div');
  private dangerEl = document.createElement('div');
  private struggleEl = document.createElement('div');
  private struggleBar = document.createElement('div');
  private pauseBtn = document.createElement('button');

  constructor(onPause: () => void) {
    this.root.className = 'ht-hud';

    const left = document.createElement('div');
    left.className = 'ht-hud-left';
    this.scoreEl.className = 'ht-score';
    this.scoreEl.textContent = '0';
    this.bestEl.className = 'ht-best';
    this.bestEl.textContent = 'BEST 0';
    this.comboEl.className = 'ht-combo';
    this.comboEl.textContent = '×1';
    this.comboBar = document.createElement('div');
    this.comboBar.className = 'ht-combo-bar';
    const comboBarFill = document.createElement('div');
    comboBarFill.className = 'ht-combo-bar-fill';
    this.comboBar.appendChild(comboBarFill);
    left.append(this.scoreEl, this.bestEl, this.comboEl, this.comboBar);

    this.dangerEl = document.createElement('div');
    this.dangerEl.className = 'ht-danger';
    this.dangerEl.textContent = 'DANGER';

    this.struggleEl = document.createElement('div');
    this.struggleEl.className = 'ht-struggle';
    this.struggleEl.textContent = 'ЗАСЫПАЕТ!';
    this.struggleBar = document.createElement('div');
    this.struggleBar.className = 'ht-struggle-bar';
    const struggleFill = document.createElement('div');
    struggleFill.className = 'ht-struggle-bar-fill';
    this.struggleBar.appendChild(struggleFill);
    this.struggleEl.appendChild(this.struggleBar);

    this.pauseBtn = document.createElement('button');
    this.pauseBtn.className = 'ht-pause-btn';
    this.pauseBtn.textContent = '❚❚';
    this.pauseBtn.setAttribute('aria-label', 'Пауза');
    this.pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onPause();
    });

    this.root.append(left, this.dangerEl, this.struggleEl, this.pauseBtn);
    this.root.style.display = 'none';
  }

  update(score: ScoreSystem, stack: StackManager): void {
    this.scoreEl.textContent = String(Math.floor(score.score));
    this.bestEl.textContent = `BEST ${Math.floor(score.best)}`;
    const mult = score.multiplier();
    if (mult > 1) {
      this.comboEl.textContent = `×${mult.toFixed(2).replace(/\.?0+$/, '')} · ${score.combo}`;
      this.comboEl.classList.add('on');
    } else {
      this.comboEl.classList.remove('on');
    }
    const bar = this.comboBar.querySelector('.ht-combo-bar-fill') as HTMLElement;
    bar.style.width = `${Math.round(Math.min(1, score.comboTimer / 5) * 100)}%`;
    this.dangerEl.classList.toggle('on', stack.dangerActive);
    const trappedFrac = stack.trappedTimer / 4;
    this.struggleEl.classList.toggle('on', trappedFrac > 0.05);
    const sbar = this.struggleEl.querySelector('.ht-struggle-bar-fill') as HTMLElement;
    sbar.style.width = `${Math.round(Math.min(1, trappedFrac) * 100)}%`;
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? 'flex' : 'none';
  }

  reset(): void {
    this.scoreEl.textContent = '0';
  }
}
