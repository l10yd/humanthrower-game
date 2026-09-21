/** Collision groups (16-bit membership | 16-bit filter) and material presets (GDD §8.3, §38). */

export const G = {
  PLAYER: 0x0001,
  CORE: 0x0002,
  LIMB: 0x0004,
  PIECE: 0x0008,
  STATIC: 0x0010,
} as const;

export function interactionGroups(membership: number, filter: number): number {
  return (((membership << 16) | filter) >>> 0);
}

export const COLLISION = {
  player: interactionGroups(G.PLAYER, G.CORE | G.LIMB | G.PIECE | G.STATIC),
  core: interactionGroups(G.CORE, G.PLAYER | G.CORE | G.LIMB | G.PIECE | G.STATIC),
  limb: interactionGroups(G.LIMB, G.PLAYER | G.CORE | G.LIMB | G.PIECE | G.STATIC),
  piece: interactionGroups(G.PIECE, G.PLAYER | G.CORE | G.LIMB | G.PIECE | G.STATIC),
  static: interactionGroups(G.STATIC, G.PLAYER | G.CORE | G.LIMB | G.PIECE),
} as const;

export type Material = { restitution: number; friction: number };

/** Data-driven material presets (§8.3). */
export const MATERIALS: Record<string, Material> = {
  head: { restitution: 0.1, friction: 0.6 },
  torso: { restitution: 0.05, friction: 0.85 },
  pelvis: { restitution: 0.04, friction: 0.9 },
  armLimb: { restitution: 0.08, friction: 0.5 },
  legLimb: { restitution: 0.05, friction: 0.7 },
  piece: { restitution: 0.05, friction: 0.85 },
  floor: { restitution: 0.0, friction: 0.9 },
  glass: { restitution: 0.05, friction: 0.2 },
};
