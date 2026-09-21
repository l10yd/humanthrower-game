/** Settings (GDD §17.3, §50) — persisted via Save. */
export type Quality = 'auto' | 'high' | 'medium' | 'low';

export type Settings = {
  sound: boolean;
  music: boolean;
  soundVolume: number;
  musicVolume: number;
  reducedMotion: boolean;
  quality: Quality;
  haptics: boolean;
};

/** Auto-quality tiers (GDD §23.4): never degrade gameplay physics. */
export type QualityTier = 'high' | 'medium' | 'low';

export interface QualityProfile {
  dprCap: number;
  particleScale: number;
  shadows: boolean;
  limbPlayerCollisions: boolean;
  bgAnimated: boolean;
}

export const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  high: { dprCap: 2, particleScale: 1, shadows: true, limbPlayerCollisions: true, bgAnimated: true },
  medium: { dprCap: 1.5, particleScale: 0.7, shadows: true, limbPlayerCollisions: true, bgAnimated: false },
  low: { dprCap: 1, particleScale: 0.4, shadows: false, limbPlayerCollisions: false, bgAnimated: false },
};
