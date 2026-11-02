import { addDays } from '@shared/dates';
import { HOME } from '@shared/home';
import { PRAYERS, prayerTimes, toPrayerTimes, type PrayerDay, type PrayerSource, type PrayerTimes } from '@shared/prayer';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from './api';
import type { Daylight, NextPrayer } from './daylight';

export interface Prayers {
  /** The day's adhan times: ICC Brossard's timetable, or the calculation if it couldn't be read. */
  times: PrayerTimes;
  source: PrayerSource;
  next: NextPrayer;
}

/** Today's adhan times as the server has them (the mosque's), for the moment the sky shows. */
export function usePrayers(daylight: Daylight): Prayers {
  const date = daylight.prayers.date;
  const { data } = useQuery({
    queryKey: ['prayer-times', date],
    queryFn: () => api<{ today: PrayerDay; tomorrow: PrayerDay }>('/prayer-times'),
    staleTime: 15 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: 1,
  });
  const at = daylight.at.valueOf();
  return useMemo(() => {
    const today = data?.today.date === date ? data.today : null;
    const times = today ? toPrayerTimes(today) : daylight.prayers;
    const tomorrowDate = addDays(date, 1);
    const tomorrow = data?.tomorrow.date === tomorrowDate ? toPrayerTimes(data.tomorrow) : prayerTimes(tomorrowDate, HOME.lat, HOME.lng);
    const upcoming = PRAYERS.find((prayer) => times[prayer].valueOf() > at);
    const next: NextPrayer = upcoming ? { prayer: upcoming, at: times[upcoming] } : { prayer: 'fajr', at: tomorrow.fajr };
    return { times, source: today?.source ?? 'calculated', next };
  }, [data, date, daylight.prayers, at]);
}
