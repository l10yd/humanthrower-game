/** Music director: lookahead step sequencer with intensity layers gated by danger (GDD §16.3). */
import { AUDIO } from '../config/audio';

export class MusicDirector {
  private ctx: AudioContext | null = null;
  private dest: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private stepIndex = 0;
  private intensity = 0;
  private playing = false;

  start(ctx: AudioContext, dest: GainNode): void {
    this.ctx = ctx;
    this.dest = dest;
    this.playing = true;
    if (this.timer) return;
    this.nextStepTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), AUDIO.scheduleIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.playing = false;
  }

  setIntensity(level: number): void {
    this.intensity = Math.max(0, Math.min(3, level));
  }

  private schedule(): void {
    if (!this.ctx || !this.dest || !this.playing) return;
    const stepSec = 60 / AUDIO.bpm / 4; // 16th notes
    while (this.nextStepTime < this.ctx.currentTime + AUDIO.scheduleAheadSec) {
      this.scheduleStep(this.stepIndex, this.nextStepTime, stepSec);
      this.nextStepTime += stepSec;
      this.stepIndex = (this.stepIndex + 1) % 32;
    }
  }

  private scheduleStep(step: number, time: number, stepSec: number): void {
    const ctx = this.ctx!;
    const dest = this.dest!;
    // L0: bass
    const b = AUDIO.bassPattern[step % AUDIO.bassPattern.length];
    if (b >= 0) this.note(ctx, dest, 110 * Math.pow(2, b / 12), time, AUDIO.bassNoteSec, 0.15, 'triangle');
    // L1: hats
    if (this.intensity >= AUDIO.layers.hats && step % 2 === 1) this.noise(ctx, dest, time, 0.03, 0.045, 6000);
    // L2: pads at bar starts
    if (this.intensity >= AUDIO.layers.pads && step % 16 === 0) {
      const chord = AUDIO.padChords[Math.floor(step / 16) % AUDIO.padChords.length];
      for (const semi of chord) this.note(ctx, dest, 220 * Math.pow(2, semi / 12), time, stepSec * 15, 0.04, 'sine');
    }
    // L3: kick
    if (this.intensity >= AUDIO.layers.kick && step % 8 === 0) this.kick(ctx, dest, time);
  }

  private note(ctx: AudioContext, dest: GainNode, freq: number, time: number, dur: number, vol: number, type: OscillatorType): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  private noise(ctx: AudioContext, dest: GainNode, time: number, dur: number, vol: number, filterHz: number): void {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, Math.max(1, len), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = filterHz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(dest);
    src.start(time);
  }

  private kick(ctx: AudioContext, dest: GainNode, time: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + 0.2);
  }
}
