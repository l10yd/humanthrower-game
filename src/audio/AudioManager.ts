/** Audio manager: WebAudio graph, gesture unlock, data-driven SFX + music (GDD §16). */
import type { Settings } from '../config/settings';
import type { SfxName } from '../config/audio';
import { AUDIO, SFX } from '../config/audio';
import { SfxSynth } from './SfxSynth';
import { MusicDirector } from './MusicDirector';

export class AudioManager {
  music = new MusicDirector();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private synth: SfxSynth | null = null;

  constructor(private settings: Settings) {}

  /** Call on first user gesture (pointerdown/keydown). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = AUDIO.masterVolume;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.settings.music ? this.settings.musicVolume : 0;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.settings.sound ? this.settings.soundVolume : 0;
      this.sfxGain.connect(this.master);
      this.synth = new SfxSynth(this.ctx, this.sfxGain);
      this.music.start(this.ctx, this.musicGain);
    } catch {
      this.ctx = null;
    }
  }

  applySettings(s: Settings): void {
    this.settings = s;
    if (!this.ctx) return;
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(s.music ? s.musicVolume : 0, this.ctx.currentTime, 0.05);
    if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(s.sound ? s.soundVolume : 0, this.ctx.currentTime, 0.05);
    if (s.music) this.music.start(this.ctx, this.musicGain!);
    else this.music.stop();
  }

  play(name: SfxName, volumeScale = 1, pitchScale = 1): void {
    if (!this.synth || !this.settings.sound) return;
    this.synth.play(SFX[name], volumeScale, pitchScale);
  }

  setIntensity(level: number): void {
    this.music.setIntensity(level);
  }
}
