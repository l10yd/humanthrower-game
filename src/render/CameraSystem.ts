/** Camera: fixed, micro-shake by trauma system, subtle zoom pulse (GDD §15.3, §32). */
import { Container } from 'pixi.js';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../config/balance';

export class CameraSystem {
  trauma = 0;
  private zoomPulse = 0;

  constructor(private root: Container) {
    this.root.pivot.set(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
    this.root.position.set(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
  }

  addImpact(strength: number): void {
    this.trauma = Math.min(1, this.trauma + strength);
  }

  addZoomPulse(): void {
    this.zoomPulse = 1;
  }

  update(dtMs: number, reducedMotion: boolean): void {
    this.trauma = Math.max(0, this.trauma - 1.2 * (dtMs / 1000));
    this.zoomPulse = Math.max(0, this.zoomPulse - 5 * (dtMs / 1000));
    const shake = reducedMotion ? 0 : this.trauma * this.trauma * 9;
    this.root.position.set(
      LOGICAL_WIDTH / 2 + (Math.random() * 2 - 1) * shake,
      LOGICAL_HEIGHT / 2 + (Math.random() * 2 - 1) * shake,
    );
    const zoom = reducedMotion ? 1 : 1 + this.zoomPulse * 0.012;
    this.root.scale.set(zoom);
  }

  reset(): void {
    this.trauma = 0;
    this.zoomPulse = 0;
    this.root.position.set(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
    this.root.scale.set(1);
  }
}
