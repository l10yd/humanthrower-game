/** Human archetypes (GDD §6.2) — data-driven, tuning values. */
import type { ArchetypeId } from './difficulty';

export type Archetype = {
  id: ArchetypeId;
  scale: number;
  /** horizontal factor for FAT-style wide bodies */
  hFactor: number;
  mass: number;
  widthPx: number;
  heightPx: number;
  widthCells: number;
  heightCells: number;
  restitution: number;
  friction: number;
  /** × air linear damping — LIGHT falls slowly and readable, HEAVY fast (GDD §6.2). */
  fallResistance: number;
  /** × random spawn angular impulse — TALL/LIGHT topple more (GDD §6.2). */
  toppleBias: number;
  unlockDifficulty: number;
};

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  normal: { id: 'normal', scale: 1.0, hFactor: 1.0, mass: 62, widthPx: 62, heightPx: 110, widthCells: 1, heightCells: 1.7, restitution: 0.06, friction: 0.85, fallResistance: 1.0, toppleBias: 1.0, unlockDifficulty: 1 },
  small: { id: 'small', scale: 0.72, hFactor: 1.0, mass: 30, widthPx: 45, heightPx: 79, widthCells: 1, heightCells: 1.2, restitution: 0.08, friction: 0.9, fallResistance: 1.15, toppleBias: 1.2, unlockDifficulty: 2 },
  tall: { id: 'tall', scale: 1.15, hFactor: 0.95, mass: 70, widthPx: 64, heightPx: 150, widthCells: 1, heightCells: 2.6, restitution: 0.06, friction: 0.8, fallResistance: 1.0, toppleBias: 1.6, unlockDifficulty: 3 },
  fat: { id: 'fat', scale: 1.1, hFactor: 1.45, mass: 110, widthPx: 108, heightPx: 115, widthCells: 2, heightCells: 1.9, restitution: 0.04, friction: 0.95, fallResistance: 1.05, toppleBias: 0.6, unlockDifficulty: 4 },
  light: { id: 'light', scale: 0.95, hFactor: 1.0, mass: 18, widthPx: 59, heightPx: 105, widthCells: 1, heightCells: 1.6, restitution: 0.1, friction: 0.7, fallResistance: 1.7, toppleBias: 2.0, unlockDifficulty: 2 },
  heavy: { id: 'heavy', scale: 1.05, hFactor: 1.0, mass: 130, widthPx: 65, heightPx: 116, widthCells: 1, heightCells: 1.8, restitution: 0.02, friction: 0.95, fallResistance: 0.75, toppleBias: 0.5, unlockDifficulty: 3 },
};

export const ARCHETYPE_IDS = Object.keys(ARCHETYPES) as ArchetypeId[];

export function getArchetype(id: ArchetypeId): Archetype {
  return ARCHETYPES[id];
}
