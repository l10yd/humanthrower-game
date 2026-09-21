/** Audio system data (GDD §16): SFX synthesis params + music patterns. All data-driven. */

export const AUDIO = {
  masterVolume: 0.8,
  bpm: 116,
  scheduleAheadSec: 0.25,
  scheduleIntervalMs: 100,
  /** Music intensity layers gated by danger level (GDD §16.3). */
  layers: {
    bass: 0, // always
    hats: 1, // warning line (row 8+)
    pads: 2, // danger band (row 10+)
    kick: 3, // grace period
  },
  /** 8-step bass pattern (steps are 16th notes; -1 = rest), A minor. */
  bassPattern: [0, -1, 0, 7, -1, 0, 5, -1],
  bassNoteSec: 0.13,
  /** Pad chords per bar (semitone offsets from A2). */
  padChords: [[0, 3, 7], [-4, 0, 5], [3, 7, 10], [-2, 2, 5]],
} as const;

export type SfxName =
  | 'impact'
  | 'bump'
  | 'squeak'
  | 'warning'
  | 'tension'
  | 'clear'
  | 'pop'
  | 'tick'
  | 'stomp'
  | 'gameover'
  | 'click'
  | 'jump';

export type SfxParams = {
  /** base frequency Hz */
  freq: number;
  /** frequency sweep to Hz (or same → static) */
  freqEnd: number;
  durationSec: number;
  volume: number;
  /** noise burst level 0..1 */
  noise: number;
  /** lowpass filter Hz for noise */
  noiseFilter: number;
  oscType: OscillatorType;
  /** pitch grows with combo */
  comboPitch?: boolean;
};

/** Data-driven SFX table (GDD §16.2). */
export const SFX: Record<SfxName, SfxParams> = {
  impact: { freq: 120, freqEnd: 60, durationSec: 0.18, volume: 0.7, noise: 0.5, noiseFilter: 900, oscType: 'sine' },
  bump: { freq: 180, freqEnd: 120, durationSec: 0.08, volume: 0.25, noise: 0.3, noiseFilter: 1200, oscType: 'triangle' },
  squeak: { freq: 900, freqEnd: 1400, durationSec: 0.12, volume: 0.12, noise: 0.0, noiseFilter: 2000, oscType: 'sawtooth' },
  warning: { freq: 520, freqEnd: 520, durationSec: 0.14, volume: 0.3, noise: 0.0, noiseFilter: 3000, oscType: 'square' },
  tension: { freq: 140, freqEnd: 220, durationSec: 0.5, volume: 0.22, noise: 0.1, noiseFilter: 600, oscType: 'sawtooth' },
  clear: { freq: 660, freqEnd: 990, durationSec: 0.22, volume: 0.4, noise: 0.2, noiseFilter: 4000, oscType: 'triangle', comboPitch: true },
  pop: { freq: 420, freqEnd: 180, durationSec: 0.1, volume: 0.3, noise: 0.15, noiseFilter: 1500, oscType: 'triangle' },
  tick: { freq: 880, freqEnd: 880, durationSec: 0.05, volume: 0.12, noise: 0.0, noiseFilter: 4000, oscType: 'square' },
  stomp: { freq: 90, freqEnd: 40, durationSec: 0.3, volume: 0.8, noise: 0.6, noiseFilter: 500, oscType: 'sine' },
  gameover: { freq: 440, freqEnd: 110, durationSec: 0.9, volume: 0.5, noise: 0.1, noiseFilter: 800, oscType: 'triangle' },
  click: { freq: 700, freqEnd: 700, durationSec: 0.04, volume: 0.2, noise: 0.1, noiseFilter: 3000, oscType: 'square' },
  jump: { freq: 300, freqEnd: 520, durationSec: 0.12, volume: 0.22, noise: 0.0, noiseFilter: 2000, oscType: 'triangle' },
};
