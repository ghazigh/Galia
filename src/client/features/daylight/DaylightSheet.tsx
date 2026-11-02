import { moonPhaseName, sunPosition } from '@shared/astro';
import { zonedNow } from '@shared/dates';
import { DHUHR_REMINDER_MINUTES } from '@shared/reminders';
import { PRAYER_NAMES, PRAYERS } from '@shared/prayer';
import { BellRing, MapPin, Play, Sunrise, Sunset } from 'lucide-react';
import { useMemo } from 'react';
import { Sheet } from '../../components/Sheet';
import { Button, cx } from '../../components/ui';
import { formatClock, PHASE_LABEL, useDaylight, type Daylight } from '../../lib/daylight';
import { MoonIcon } from './MoonIcon';

const DAY_MIN = 1440;

function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

function SunChart({ midnight, lat, lng, now, sunrise, sunset }: { midnight: number; lat: number; lng: number; now: number; sunrise: Date | null; sunset: Date | null }) {
  const width = 320;
  const height = 120;
  const horizon = 78;
  const scale = 1.05; // px per degree of altitude
  const points = useMemo(() => {
    const out: [number, number][] = [];
    for (let m = 0; m <= DAY_MIN; m += 12) {
      const alt = (sunPosition(new Date(midnight + m * 60_000), lat, lng).altitude * 180) / Math.PI;
      out.push([(m / DAY_MIN) * width, horizon - alt * scale]);
    }
    return out;
  }, [midnight, lat, lng]);
  const path = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const nowMin = Math.max(0, Math.min(DAY_MIN, (now - midnight) / 60_000));
  const nowAlt = (sunPosition(new Date(now), lat, lng).altitude * 180) / Math.PI;
  const nx = (nowMin / DAY_MIN) * width;
  const ny = horizon - nowAlt * scale;
  const tick = (date: Date | null) => (date ? ((date.valueOf() - midnight) / 60_000 / DAY_MIN) * width : null);
  const rise = tick(sunrise);
  const set = tick(sunset);
  return (
    <svg viewBox={`0 -8 ${width} ${height + 8}`} className="w-full" role="img" aria-label="The sun's height through the day">
      <defs>
        <linearGradient id="sun-day" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffb257" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffb257" stopOpacity="0" />
        </linearGradient>
        <clipPath id="sun-above">
          <rect x="0" y="-10" width={width} height={horizon + 10} />
        </clipPath>
      </defs>
      <path d={`${path} L${width},${horizon} L0,${horizon} Z`} fill="url(#sun-day)" clipPath="url(#sun-above)" />
      <path d={path} fill="none" stroke="var(--color-line-strong)" strokeWidth="1.5" strokeDasharray="2 4" />
      <path d={path} fill="none" stroke="#ffb257" strokeWidth="2" clipPath="url(#sun-above)" />
      <line x1="0" x2={width} y1={horizon} y2={horizon} stroke="var(--color-ink-3)" strokeOpacity="0.5" strokeWidth="1" />
      {[rise, set].map((x, i) => (x === null ? null : <line key={i} x1={x} x2={x} y1={horizon - 4} y2={horizon + 4} stroke="var(--color-ink-2)" strokeWidth="1.5" />))}
      {[0, 6, 12, 18, 24].map((h) => (
        <text key={h} x={Math.min(width - 10, Math.max(8, (h / 24) * width))} y={height - 2} textAnchor="middle" fontSize="10" fill="var(--color-ink-3)">
          {String(h % 24).padStart(2, '0')}
        </text>
      ))}
      <line x1={nx} x2={nx} y1={-6} y2={horizon} stroke="var(--color-accent-ink)" strokeOpacity="0.4" strokeWidth="1" />
      <circle cx={nx} cy={ny} r="9" fill="#ffcf7a" opacity={nowAlt > 0 ? 0.25 : 0.12} />
      <circle cx={nx} cy={ny} r="5" fill={nowAlt > 0 ? '#ffcf7a' : 'var(--color-ink-3)'} stroke="var(--color-surface)" strokeWidth="2" />
    </svg>
  );
}

export function DaylightSheet({ open, onClose, onPreview }: { open: boolean; onClose: () => void; onPreview: () => void }) {
  const daylight = useDaylight();
  const { at, live, timeZone, today, illumination, location: where, prayers, nextPrayer } = daylight;
  const local = zonedNow(timeZone, at);
  const midnight = at.valueOf() - local.minutes * 60_000 - at.getUTCSeconds() * 1000;

  const phase = PHASE_LABEL[daylight.phase][daylight.morning ? 'morning' : 'evening'];
  const dayLength = today.sunrise && today.sunset ? today.sunset.valueOf() - today.sunrise.valueOf() : null;

  return (
    <Sheet open={open} onClose={onClose} title="Daylight" label="Daylight">
      <div className="pb-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-ink-3">{live ? 'Now' : `Preview · ${formatClock(at, timeZone)}`}</p>
            <p className="mt-1 font-display text-[28px] leading-tight font-semibold tracking-[-0.02em] text-ink">{phase}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-3">
              <MapPin className="size-3.5" /> {where.label}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1 pb-1">
            <MoonIcon phase={illumination.phase} size={40} className="text-[#e9e4d6]" />
            <span className="text-[11px] text-ink-3 tabular">{Math.round(illumination.fraction * 100)}%</span>
          </div>
        </div>

        <PrayerCard prayers={prayers} next={nextPrayer} now={at} timeZone={timeZone} />

        <div className="mt-5 rounded-2xl bg-sunken/60 p-4">
          <SunChart midnight={midnight} lat={where.lat} lng={where.lng} now={at.valueOf()} sunrise={today.sunrise} sunset={today.sunset} />
          <Button className="mt-3" variant="secondary" block icon={<Play className="size-4" fill="currentColor" />} onClick={onPreview}>
            Preview the day in 3D
          </Button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2">
          {[
            { label: 'Sunrise', value: formatClock(today.sunrise, timeZone), icon: <Sunrise className="size-4" /> },
            { label: 'Sunset', value: formatClock(today.sunset, timeZone), icon: <Sunset className="size-4" /> },
            { label: 'Golden hour', value: formatClock(today.goldenHour, timeZone) },
            { label: 'Dusk', value: formatClock(today.dusk, timeZone) },
            { label: 'Day length', value: dayLength ? duration(dayLength) : '—' },
            { label: 'Moon', value: `${moonPhaseName(illumination.phase)}` },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-sunken/60 px-3.5 py-3">
              <dt className="flex items-center gap-1.5 text-[12px] text-ink-3">
                {item.icon}
                {item.label}
              </dt>
              <dd className="mt-0.5 text-[15px] font-medium text-ink tabular">{item.value}</dd>
            </div>
          ))}
        </dl>

        <p className={cx('mt-3 px-1 text-[12px] text-ink-3')}>
          The 3D sky follows the real sun and moon over the house, in Montréal time — light, shadows and the moon’s phase update through the day.
        </p>
      </div>
    </Sheet>
  );
}

function countdown(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/** Today's five prayers (and sunrise), the next one highlighted with a countdown. */
function PrayerCard({ prayers, next, now, timeZone }: { prayers: Daylight['prayers']; next: Daylight['nextPrayer']; now: Date; timeZone: string }) {
  const reminder = new Date(prayers.asr.valueOf() - DHUHR_REMINDER_MINUTES * 60_000);
  const rows = [
    ...PRAYERS.map((prayer) => ({ id: prayer, label: PRAYER_NAMES[prayer], at: prayers[prayer], prayer: true })),
    { id: 'sunrise', label: 'Sunrise', at: prayers.sunrise, prayer: false },
  ].sort((a, b) => a.at.valueOf() - b.at.valueOf());
  const tomorrow = next.at.valueOf() > prayers.isha.valueOf();
  return (
    <section aria-label="Prayer times" className="mt-5 rounded-2xl bg-sunken/60 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[15px] font-semibold text-ink">Prayer times</h3>
        <p className="text-[12.5px] text-ink-3">
          Next: <span className="font-medium text-accent-ink">{PRAYER_NAMES[next.prayer]}</span> {countdown(next.at.valueOf() - now.valueOf())}
          {tomorrow && ' (tomorrow)'}
        </p>
      </div>
      <ul className="mt-2">
        {rows.map((row) => {
          const isNext = row.prayer && row.id === next.prayer && !tomorrow;
          const past = row.at.valueOf() <= now.valueOf();
          return (
            <li
              key={row.id}
              className={cx(
                'flex items-center justify-between rounded-xl px-2.5 py-2 text-[15px]',
                isNext && 'bg-accent/15 ring-1 ring-accent/30',
                !row.prayer && 'text-[13px]',
              )}
            >
              <span className={cx(row.prayer ? 'font-medium' : 'text-ink-3', past && !isNext ? 'text-ink-3' : 'text-ink')}>{row.label}</span>
              <span className={cx('tabular', past && !isNext ? 'text-ink-3' : 'text-ink', !row.prayer && 'text-ink-3')}>{formatClock(row.at, timeZone)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 flex items-center gap-1.5 px-1 text-[12px] text-ink-3">
        <BellRing className="size-3.5" />
        Reminder to pray Dhuhr at {formatClock(reminder, timeZone)}, {DHUHR_REMINDER_MINUTES} min before Asr
      </p>
      <p className="mt-1 px-1 text-[11.5px] text-ink-3">ISNA · Fajr and Isha at 15° · standard Asr · Saint-Philippe, QC</p>
    </section>
  );
}
