import { useEffect, useSyncExternalStore } from 'react';
import { useDaylight } from './daylight';
import { usePrefs, type ThemeMode } from './prefs';

const darkQuery = '(prefers-color-scheme: dark)';

function useSystemDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(darkQuery);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(darkQuery).matches,
    () => true,
  );
}

export type ResolvedTheme = 'dark' | 'light';

export function resolveTheme(mode: ThemeMode, systemDark: boolean, sunDown: boolean): ResolvedTheme {
  if (mode === 'system') return systemDark ? 'dark' : 'light';
  if (mode === 'sun') return sunDown ? 'dark' : 'light';
  return mode;
}

/** The theme in effect: the user's choice, the system's, or the sun's at the household. */
export function useResolvedTheme(): ResolvedTheme {
  const { theme } = usePrefs();
  const systemDark = useSystemDark();
  const daylight = useDaylight();
  // "Follow the sun" switches at sunset and back at sunrise.
  return resolveTheme(theme, systemDark, daylight.isNight);
}

/** Whether the dark palette is showing (kept for the illustrated house and charts). */
export function useDarkMode(): boolean {
  return useResolvedTheme() === 'dark';
}

const THEME_COLOR: Record<ResolvedTheme, string> = { dark: '#0d0e10', light: '#f4f4f5' };

/** Applies the resolved theme to the document (data-theme, color-scheme, browser chrome color). */
export function ThemeController() {
  const theme = useResolvedTheme();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.content = THEME_COLOR[theme];
      meta.removeAttribute('media');
    }
  }, [theme]);
  return null;
}

const reducedQuery = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(reducedQuery);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );
}
