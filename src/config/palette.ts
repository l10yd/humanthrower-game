/** Procedural human variation palettes (GDD §6.4). Visual only — ±6% scale, never physics. */
import type { Rng } from '../core/Rng';

export type HumanVariant = {
  skin: number;
  hairStyle: number;
  hairColor: number;
  shirt: number;
  shirtPattern: number; // 0 solid, 1 stripe, 2 duo-tone
  pants: number;
  shoes: number;
  face: number; // eyes/mouth combo index
  accessory: number; // 0 none, 1 cap, 2 glasses, 3 headphones
  headScale: number;
};

export const PALETTE = {
  skins: [0xf2c49b, 0xe0a878, 0xc98a5e, 0x8d5a3a, 0x6e4428, 0xf7d7b4],
  hairColors: [0x2b2118, 0x4a3524, 0x7a5230, 0xb08040, 0xd8c080, 0x99331f, 0x777777, 0x1f1f2b],
  shirts: [0xe2574c, 0x4c8de2, 0x53b06b, 0xe2a23c, 0x9b59d0, 0x3fb8a8, 0xd05a8c, 0x777f8c, 0x35415c, 0xc2c9d6, 0xe27d4c, 0x6b8f4c],
  pants: [0x3a4a6b, 0x4c4c55, 0x6b5a3a, 0x2f3d2f, 0x5c4a6b, 0x8c8c96, 0x33424c, 0x59452f],
  shoes: [0x2b2b33, 0xd6d6de, 0x8c5a3a, 0x4c6b8c],
  accessories: [0, 1, 2, 3],
} as const;

export function generateVariant(rng: Rng): HumanVariant {
  return {
    skin: rng.pick(PALETTE.skins),
    hairStyle: rng.int(0, 5),
    hairColor: rng.pick(PALETTE.hairColors),
    shirt: rng.pick(PALETTE.shirts),
    shirtPattern: rng.int(0, 3),
    pants: rng.pick(PALETTE.pants),
    shoes: rng.pick(PALETTE.shoes),
    face: rng.int(0, 12),
    accessory: rng.chance(0.25) ? rng.pick(PALETTE.accessories) : 0,
    headScale: rng.range(0.94, 1.06),
  };
}
