/** Player controller config (GDD §5.2, §5.3). Tuning values. */
export const PLAYER = {
  widthPx: 50,
  heightPx: 72,
  mass: 62,
  accel: 3200,
  maxSpeed: 420,
  groundDecel: 2600,
  airControl: 0.55,
  jumpVelocity: 940,
  jumpCut: 0.5,
  coyoteSec: 0.09,
  jumpBufferSec: 0.12,
  diveSpeed: 1350,
  crouchScale: 0.62,
  crouchSpeed: 0.55,
  /** вырубание: фигурка упала на голову → управление выключено, тело обмякает (GDD §5.4) */
  stunSec: 2.2,
  /** Per-step corrective velocity approach factors (hybrid locomotion, §5.2). */
  velApproachGround: 0.35,
  velApproachAir: 0.2,
  /** External bodies may push the player up to this speed before the controller clamps. */
  maxPushSpeed: 546,
  stomp: { radiusPx: 150, maxDv: 240, downBias: 0.35, maxBodies: 10, cooldownSec: 0.9 },
  landCompress: { radiusPx: 102, maxDv: 90, maxBodies: 8 },
} as const;
