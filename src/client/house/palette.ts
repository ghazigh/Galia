import { shade } from './iso';

export type FloorMaterial = 'oak' | 'tile' | 'mosaic' | 'stone' | 'concrete' | 'epoxy';

export interface HousePalette {
  dark: boolean;
  /** Cut surfaces: slab edges and wall tops (the architectural "poché"). */
  poche: string;
  wallBack: string;
  wallLeft: string;
  wallExterior: string;
  floors: Record<FloorMaterial, { base: string; line: string }>;
  grass: string;
  grassStripe: string;
  soil: string;
  roof: string;
  roofLine: string;
  ridge: string;
  gable: string;
  metal: string;
  glass: string;
  windowFrame: string;
  shadow: string;
  accent: string;
  status: { overdue: string; today: string; soon: string; ok: string };
  /** Maps an object color for the current theme (night dims and cools it). */
  tint: (color: string) => string;
}

const day: HousePalette = {
  dark: false,
  poche: '#2b2e34',
  wallBack: '#ecebe8',
  wallLeft: '#dfddd9',
  wallExterior: '#d2d0cc',
  floors: {
    oak: { base: '#e3d0b3', line: '#d4bf9f' },
    tile: { base: '#eceeef', line: '#dcdfe2' },
    mosaic: { base: '#dde6ea', line: '#c9d6dc' },
    stone: { base: '#e2ded8', line: '#d2cdc5' },
    concrete: { base: '#d8d7d5', line: '#c8c7c4' },
    epoxy: { base: '#d7dce1', line: '#c6ccd3' },
  },
  grass: '#9fc27e',
  grassStripe: '#94b973',
  soil: '#9b8068',
  roof: '#3b3f47',
  roofLine: '#33373e',
  ridge: '#2a2d33',
  gable: '#dedcd8',
  metal: '#aab1ba',
  glass: '#c6dbe8',
  windowFrame: '#ffffff',
  shadow: 'rgba(23, 26, 32, 0.12)',
  accent: '#3e6ae1',
  status: { overdue: '#e8372f', today: '#f07d2a', soon: '#e8ad2e', ok: '#2fb57a' },
  tint: (color) => color,
};

const night: HousePalette = {
  dark: true,
  poche: '#3a3d45',
  wallBack: '#2a2c31',
  wallLeft: '#24262b',
  wallExterior: '#202226',
  floors: {
    oak: { base: '#463d33', line: '#3c342b' },
    tile: { base: '#33363c', line: '#2c2f34' },
    mosaic: { base: '#2e3940', line: '#283238' },
    stone: { base: '#3a3733', line: '#32302c' },
    concrete: { base: '#343538', line: '#2d2e31' },
    epoxy: { base: '#30353c', line: '#2a2e34' },
  },
  grass: '#2f4630',
  grassStripe: '#2b412c',
  soil: '#3b3028',
  roof: '#1d1f23',
  roofLine: '#1a1c1f',
  ridge: '#141518',
  gable: '#26282d',
  metal: '#5c636e',
  glass: '#ffc46e',
  windowFrame: '#3a3d45',
  shadow: 'rgba(0, 0, 0, 0.35)',
  accent: '#6f93ff',
  status: { overdue: '#ff5a52', today: '#ff9f43', soon: '#f2c14e', ok: '#3ccf8e' },
  tint: (color) => shade(color, -0.55),
};

export function getPalette(dark: boolean): HousePalette {
  return dark ? night : day;
}

/** Object colors (before theme tinting). */
export const C = {
  sofa: '#8798bd',
  cushion: '#a3b2d2',
  linen: '#fbf8f3',
  pillow: '#ffffff',
  terracotta: '#d6977f',
  sage: '#94b5a0',
  lavender: '#b6a8d2',
  wood: '#c9a27a',
  woodDark: '#9e7752',
  cabinet: '#f7f4ef',
  counter: '#c3b8aa',
  appliance: '#f8f9fa',
  steel: '#cdd4dc',
  car: '#ee6b4d',
  carGlass: '#a9c6d8',
  tire: '#2f3239',
  plant: '#6fa36a',
  pot: '#d99060',
  rug: '#dcc8b3',
  rugBlue: '#c4d0dc',
  heatPump: '#dfe4ea',
  tank: '#f2f4f6',
  copper: '#c78a5d',
  red: '#e5484d',
  panel: '#b9c0ca',
  duct: '#c9cfd6',
  door: '#b98a62',
  garageDoor: '#e9ecef',
  water: '#9fd1ea',
  porcelain: '#ffffff',
  fence: '#d7b48c',
  trunk: '#8a6748',
  leaves: '#7fb36f',
  leavesDark: '#6da15e',
  stone: '#cfc7bb',
  mat: '#8c7a68',
} as const;
