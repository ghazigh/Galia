import { todayIn, zonedNow, type Ymd } from '@shared/dates';
import { useEffect, useState } from 'react';

/** Today's date in the household time zone; rolls over at local midnight and on resume. */
export function useToday(timeZone: string): Ymd {
  const [today, setToday] = useState(() => todayIn(timeZone));
  useEffect(() => {
    const refresh = () => setToday(todayIn(timeZone));
    refresh();
    const { minutes } = zonedNow(timeZone);
    const timer = window.setTimeout(refresh, (24 * 60 - minutes) * 60_000 + 5_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [timeZone, today]);
  return today;
}

export function greeting(timeZone: string): string {
  const hour = Math.floor(zonedNow(timeZone).minutes / 60);
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
