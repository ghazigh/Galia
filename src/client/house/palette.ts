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
  poche: '#33384f',
  wallBack: '#eee6d9',
  wallLeft: '#e0d6c6',
  wallExterior: '#d8cdbb',
  floors: {
    oak: { base: '#e8d1a8', line: '#d7bc91' },
    tile: { base: '#eceff1', line: '#d8dde2' },
    mosaic: { base: '#dbe8ee', line: '#c3d6de' },
    stone: { base: '#e5ded3', line: '#d3cabd' },
    concrete: { base: '#d9d6d0', line: '#c8c4bd' },
    epoxy: { base: '#d6dde4', line: '#c4cdd6' },
  },
  grass: '#a8cf80',
  grassStripe: '#9cc674',
  soil: '#a88262',
  roof: '#5f6d88',
  roofLine: '#56637c',
  ridge: '#4b576e',
  gable: '#e3dacc',
  metal: '#aeb8c6',
  glass: '#c5e3f3',
  windowFrame: '#ffffff',
  shadow: 'rgba(44, 36, 28, 0.13)',
  accent: '#5b5bd6',
  status: { overdue: '#f04e54', today: '#f5843c', soon: '#f2b33a', ok: '#38b886' },
  tint: (color) => color,
};

const night: HousePalette = {
  dark: true,
  poche: '#3a415e',
  wallBack: '#2b3142',
  wallLeft: '#252a39',
  wallExterior: '#232838',
  floors: {
    oak: { base: '#4a3f33', line: '#40362b' },
    tile: { base: '#323946', line: '#2b313d' },
    mosaic: { base: '#2c3c47', line: '#26343e' },
    stone: { base: '#3b3732', line: '#33302b' },
    concrete: { base: '#35373b', line: '#2e3034' },
    epoxy: { base: '#303843', line: '#29303a' },
  },
  grass: '#2f4b36',
  grassStripe: '#2b4532',
  soil: '#3f3127',
  roof: '#262f42',
  roofLine: '#222a3b',
  ridge: '#1d2433',
  gable: '#2a2f3e',
  metal: '#59647a',
  glass: '#ffd27a',
  windowFrame: '#3a4152',
  shadow: 'rgba(0, 0, 0, 0.3)',
  accent: '#8e90ff',
  status: { overdue: '#ff6369', today: '#ff9651', soon: '#ffc451', ok: '#46d19b' },
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
