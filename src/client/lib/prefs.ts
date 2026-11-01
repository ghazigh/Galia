import { isValidGeoPoint } from '@shared/geo';
import { useSyncExternalStore } from 'react';

// Preferences that belong to this device rather than the account: how the app looks, how hard
// the 3D scene works the GPU, and (only if asked for) this device's precise location for the sky.

export type ThemeMode = 'dark' | 'light' | 'system' | 'sun';
export type SceneQuality = 'high' | 'balanced' | 'saver';

export type LocationPref =
  | { mode: 'auto' }
  | { mode: 'device'; lat: number; lng: number; updatedAt: string };

export interface DevicePrefs {
  theme: ThemeMode;
  location: LocationPref;
  /** Compass bearing (degrees) the front of the house faces; null lets the app choose. */
  facing: number | null;
  quality: SceneQuality;
  labels: boolean;
  autoRotate: boolean;
}

export const DEFAULT_PREFS: DevicePrefs = {
  theme: 'dark',
  location: { mode: 'auto' },
  facing: null,
  quality: 'balanced',
  labels: true,
  autoRotate: false,
};

const KEY = 'household:prefs';
const THEMES: readonly ThemeMode[] = ['dark', 'light', 'system', 'sun'];
const QUALITIES: readonly SceneQuality[] = ['high', 'balanced', 'saver'];

function sanitize(raw: unknown): DevicePrefs {
  const value = raw && typeof raw === 'object' ? (raw as Partial<DevicePrefs>) : {};
  const location: LocationPref =
    value.location?.mode === 'device' && isValidGeoPoint(value.location)
      ? { mode: 'device', lat: value.location.lat, lng: value.location.lng, updatedAt: String(value.location.updatedAt ?? '') }
      : { mode: 'auto' };
  return {
    theme: THEMES.includes(value.theme as ThemeMode) ? (value.theme as ThemeMode) : DEFAULT_PREFS.theme,
    location,
    facing: typeof value.facing === 'number' && Number.isFinite(value.facing) ? ((value.facing % 360) + 360) % 360 : null,
    quality: QUALITIES.includes(value.quality as SceneQuality) ? (value.quality as SceneQuality) : DEFAULT_PREFS.quality,
    labels: typeof value.labels === 'boolean' ? value.labels : DEFAULT_PREFS.labels,
    autoRotate: typeof value.autoRotate === 'boolean' ? value.autoRotate : DEFAULT_PREFS.autoRotate,
  };
}

function read(): DevicePrefs {
  try {
    const stored = window.localStorage.getItem(KEY);
    return sanitize(stored ? JSON.parse(stored) : null);
  } catch {
    return DEFAULT_PREFS;
  }
}

let current: DevicePrefs | null = null;
const listeners = new Set<() => void>();

export function getPrefs(): DevicePrefs {
  if (!current) current = typeof window === 'undefined' ? DEFAULT_PREFS : read();
  return current;
}

export function setPrefs(patch: Partial<DevicePrefs>): void {
  current = sanitize({ ...getPrefs(), ...patch });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private mode or storage full: the change still applies for this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    current = read();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function usePrefs(): DevicePrefs {
  return useSyncExternalStore(subscribe, getPrefs, () => DEFAULT_PREFS);
}
