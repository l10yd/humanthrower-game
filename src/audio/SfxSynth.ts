/** SFX synth: WebAudio graphs from data-driven params (GDD §16.2). No assets in baseline. */
import type { SfxParams } from '../config/audio';

export class SfxSynth {
  private noiseBuffer: AudioBuffer;

  constructor(
    private ctx: AudioContext,
    private dest: GainNode,
  ) {
    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  play(p: SfxParams, volumeScale = 1, pitchScale = 1): void {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.001;
    const dur = p.durationSec;

    if (p.volume > 0.001) {
      const osc = ctx.createOscillator();
      osc.type = p.oscType;
      osc.frequency.setValueAtTime(Math.max(20, p.freq * pitchScale), t0);
      osc.frequency.linearRampToValueAtTime(Math.max(20, p.freqEnd * pitchScale), t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(p.volume * volumeScale, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(this.dest);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    if (p.noise > 0.001) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = p.noiseFilter;
      const g = ctx.createGain();
      g.gain.setValueAtTime(p.noise * p.volume * volumeScale, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filt);
      filt.connect(g);
      g.connect(this.dest);
      src.start(t0);
      src.stop(t0 + dur + 0.05);
    }
  }
}
