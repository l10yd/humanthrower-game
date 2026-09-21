/** Save system: localStorage, tolerant of private mode (GDD §51). */
import type { Settings } from '../config/settings';

export interface SaveData {
  version: 1;
  bestScore: number;
  settings: Settings;
  tutorialSeen: boolean;
}

const KEY = 'ht.save.v1';

const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  soundVolume: 0.8,
  musicVolume: 0.6,
  reducedMotion: false,
  quality: 'auto',
  haptics: true,
};

function defaults(): SaveData {
  return { version: 1, bestScore: 0, settings: { ...DEFAULT_SETTINGS }, tutorialSeen: false };
}

export class Save {
  data: SaveData;

  constructor() {
    this.data = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        this.data = {
          version: 1,
          bestScore: typeof parsed.bestScore === 'number' ? parsed.bestScore : 0,
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
          tutorialSeen: parsed.tutorialSeen === true,
        };
      }
    } catch {
      this.data = defaults();
    }
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // private mode — настройки живут в сессии
    }
  }
}
