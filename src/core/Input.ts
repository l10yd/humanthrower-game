/** Input: keyboard + touch → per-fixed-step InputState with edge events (GDD §4). */
import type { InputState } from '../gameplay/PlayerController';

export class Input {
  private keys = new Set<string>();
  private jumpEdge = false;
  private jumpReleasedEdge = false;
  private diveEdge = false;
  private touchLeftDown = false;
  private touchRightDown = false;
  private touchJumpDown = false;
  private pauseEdge = false;
  private debugEdge = false;

  private onKeyDown = (e: Event): void => {
    const kb = e as KeyboardEvent;
    const c = kb.code;
    if (c === 'Space' || c === 'ArrowUp' || c === 'ArrowLeft' || c === 'ArrowRight' || c === 'ArrowDown' || c === 'Backquote' || c === 'F3') {
      e.preventDefault();
    }
    if (kb.repeat) return;
    this.keys.add(c);
    if (c === 'Space' || c === 'KeyW' || c === 'ArrowUp') {
      this.jumpEdge = true;
      this.diveEdge = true;
    }
    if (c === 'KeyS' || c === 'ArrowDown') this.diveEdge = true;
    if (c === 'KeyP' || c === 'Escape') this.pauseEdge = true;
    if (c === 'Backquote' || c === 'F3') this.debugEdge = true;
  };

  private onKeyUp = (e: Event): void => {
    const c = (e as KeyboardEvent).code;
    this.keys.delete(c);
    if (c === 'Space' || c === 'KeyW' || c === 'ArrowUp') this.jumpReleasedEdge = true;
  };

  attach(target: HTMLElement | Window): void {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
  }

  detach(target: HTMLElement | Window): void {
    target.removeEventListener('keydown', this.onKeyDown);
    target.removeEventListener('keyup', this.onKeyUp);
  }

  touchLeft(v: boolean): void {
    this.touchLeftDown = v;
  }

  touchRight(v: boolean): void {
    this.touchRightDown = v;
  }

  touchJump(down: boolean): void {
    if (down && !this.touchJumpDown) {
      this.jumpEdge = true;
      this.diveEdge = true;
    }
    if (!down && this.touchJumpDown) this.jumpReleasedEdge = true;
    this.touchJumpDown = down;
  }

  /** Build per-fixed-step input state; edge flags consumed. */
  consume(): InputState {
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.touchLeftDown;
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.touchRightDown;
    const state: InputState = {
      moveX: (right ? 1 : 0) - (left ? 1 : 0),
      jumpPressed: this.jumpEdge,
      jumpHeld: this.keys.has('Space') || this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.touchJumpDown,
      jumpReleased: this.jumpReleasedEdge,
      divePressed: this.diveEdge,
      crouchHeld: this.keys.has('KeyS') || this.keys.has('ArrowDown') || (this.touchLeftDown && this.touchRightDown),
    };
    this.jumpEdge = false;
    this.jumpReleasedEdge = false;
    this.diveEdge = false;
    return state;
  }

  consumePause(): boolean {
    const p = this.pauseEdge;
    this.pauseEdge = false;
    return p;
  }

  consumeDebug(): boolean {
    const d = this.debugEdge;
    this.debugEdge = false;
    return d;
  }
}
