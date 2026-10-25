import type { FixtureId, Household, ZoneId } from './types';

export type LevelId = 'roof' | 'upper' | 'ground' | 'basement' | 'outside' | 'house';

export interface LevelDef {
  id: LevelId;
  name: string;
  /** Short marker for the floor rail (+1, 0, −1 …). */
  badge: string;
}

/** Top-to-bottom, the order the house view stacks them. */
export const LEVELS: readonly LevelDef[] = [
  { id: 'roof', name: 'Roof', badge: '▲' },
  { id: 'upper', name: 'Upper floor', badge: '+1' },
  { id: 'ground', name: 'Ground floor', badge: '0' },
  { id: 'basement', name: 'Basement', badge: '−1' },
  { id: 'outside', name: 'Outside', badge: '✿' },
  { id: 'house', name: 'Whole house', badge: '⌂' },
];

export interface ZoneDef {
  id: ZoneId;
  name: string;
  level: LevelId;
  blurb: string;
}

export const ZONES: readonly ZoneDef[] = [
  { id: 'roof', name: 'Roof & gutters', level: 'roof', blurb: 'Shingles, gutters and downspouts' },
  { id: 'bedroom1', name: 'Primary bedroom', level: 'upper', blurb: 'Upper floor' },
  { id: 'bedroom2', name: 'Bedroom 2', level: 'upper', blurb: 'Upper floor' },
  { id: 'bathroom', name: 'Bathroom', level: 'upper', blurb: 'Shower, bathtub and vanity' },
  { id: 'bedroom3', name: 'Bedroom 3', level: 'upper', blurb: 'Upper floor' },
  { id: 'entry', name: 'Entry', level: 'ground', blurb: 'Front door and stairs' },
  { id: 'living', name: 'Living room', level: 'ground', blurb: 'Ground floor' },
  { id: 'kitchen', name: 'Kitchen', level: 'ground', blurb: 'Dishwasher, range and fridge' },
  { id: 'garage', name: 'Garage', level: 'basement', blurb: 'Parking and garage door' },
  {
    id: 'mechanical',
    name: 'Mechanical room',
    level: 'basement',
    blurb: 'Heat pump, hot water tank and laundry',
  },
  { id: 'backyard', name: 'Backyard', level: 'outside', blurb: 'Lawn and heat pump outdoor unit' },
  { id: 'house', name: 'Whole house', level: 'house', blurb: 'Detectors and house-wide checks' },
];

export const ZONE_IDS = ZONES.map((zone) => zone.id) as readonly ZoneId[];

const ZONE_BY_ID = new Map(ZONES.map((zone) => [zone.id, zone]));

export function zoneDef(id: ZoneId): ZoneDef {
  const zone = ZONE_BY_ID.get(id);
  if (!zone) throw new Error(`Unknown zone: ${id}`);
  return zone;
}

export function isZoneId(value: unknown): value is ZoneId {
  return typeof value === 'string' && ZONE_BY_ID.has(value as ZoneId);
}

/** Display name, honoring per-household renames ("Bedroom 3" → "Office"). */
export function zoneName(id: ZoneId, household?: Pick<Household, 'zoneNames'> | null): string {
  return household?.zoneNames?.[id]?.trim() || zoneDef(id).name;
}

export function zonesOnLevel(level: LevelId): ZoneDef[] {
  return ZONES.filter((zone) => zone.level === level);
}

export interface FixtureDef {
  id: FixtureId;
  name: string;
  zoneId: ZoneId;
}

export const FIXTURES: readonly FixtureDef[] = [
  { id: 'garage-door', name: 'Garage door', zoneId: 'garage' },
  { id: 'car', name: 'Car', zoneId: 'garage' },
  { id: 'heat-pump', name: 'Heat pump (indoor unit)', zoneId: 'mechanical' },
  { id: 'water-heater', name: 'Hot water tank', zoneId: 'mechanical' },
  { id: 'dryer', name: 'Clothes dryer', zoneId: 'mechanical' },
  { id: 'dryer-vent', name: 'Dryer exhaust vent', zoneId: 'mechanical' },
  { id: 'washer', name: 'Washing machine', zoneId: 'mechanical' },
  { id: 'electrical-panel', name: 'Electrical panel', zoneId: 'mechanical' },
  { id: 'water-main', name: 'Main water shutoff', zoneId: 'mechanical' },
  { id: 'front-door', name: 'Front door', zoneId: 'entry' },
  { id: 'dishwasher', name: 'Dishwasher', zoneId: 'kitchen' },
  { id: 'range-hood', name: 'Range hood', zoneId: 'kitchen' },
  { id: 'fridge', name: 'Refrigerator', zoneId: 'kitchen' },
  { id: 'fire-extinguisher', name: 'Fire extinguisher', zoneId: 'kitchen' },
  { id: 'bath-fan', name: 'Bathroom exhaust fan', zoneId: 'bathroom' },
  { id: 'bathtub', name: 'Bathtub', zoneId: 'bathroom' },
  { id: 'shower', name: 'Shower', zoneId: 'bathroom' },
  { id: 'gutters', name: 'Gutters', zoneId: 'roof' },
  { id: 'lawn', name: 'Lawn', zoneId: 'backyard' },
  { id: 'heat-pump-outdoor', name: 'Heat pump (outdoor unit)', zoneId: 'backyard' },
  { id: 'hose-bib', name: 'Outdoor faucet', zoneId: 'backyard' },
  { id: 'smoke-detectors', name: 'Smoke & CO detectors', zoneId: 'house' },
  { id: 'windows', name: 'Windows & doors', zoneId: 'house' },
];

const FIXTURE_BY_ID = new Map(FIXTURES.map((fixture) => [fixture.id, fixture]));

export function fixtureDef(id: FixtureId): FixtureDef {
  const fixture = FIXTURE_BY_ID.get(id);
  if (!fixture) throw new Error(`Unknown fixture: ${id}`);
  return fixture;
}

export function isFixtureId(value: unknown): value is FixtureId {
  return typeof value === 'string' && FIXTURE_BY_ID.has(value as FixtureId);
}
