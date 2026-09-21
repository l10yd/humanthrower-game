/** Touch controls: virtual left/right/jump buttons (GDD §4.2, §56). Unobtrusive, ≥ 64 px. */
interface TouchInput {
  touchLeft(v: boolean): void;
  touchRight(v: boolean): void;
  touchJump(down: boolean): void;
}

export class TouchControls {
  root = document.createElement('div');
  private bind = (el: HTMLButtonElement, down: () => void, up: () => void): void => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      down();
    });
    el.addEventListener('pointerup', () => up());
    el.addEventListener('pointercancel', () => up());
    el.addEventListener('lostpointercapture', () => up());
  };

  constructor(private input: TouchInput) {
    this.root.className = 'ht-touch';
    const left = document.createElement('button');
    left.className = 'ht-touch-btn';
    left.textContent = '◀';
    left.setAttribute('aria-label', 'Влево');
    const right = document.createElement('button');
    right.className = 'ht-touch-btn';
    right.textContent = '▶';
    right.setAttribute('aria-label', 'Вправо');
    const jump = document.createElement('button');
    jump.className = 'ht-touch-btn ht-touch-jump';
    jump.textContent = 'JUMP';
    jump.setAttribute('aria-label', 'Прыжок (в воздухе — dive)');
    this.bind(left, () => this.input.touchLeft(true), () => this.input.touchLeft(false));
    this.bind(right, () => this.input.touchRight(true), () => this.input.touchRight(false));
    this.bind(jump, () => this.input.touchJump(true), () => this.input.touchJump(false));
    const cluster = document.createElement('div');
    cluster.className = 'ht-touch-cluster';
    cluster.append(left, right);
    this.root.append(cluster, jump);
    this.root.style.display = 'none';
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? 'flex' : 'none';
  }
}
