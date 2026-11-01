import { zonedNow } from '@shared/dates';
import { Pause, Play, RotateCcw, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { formatClock, PHASE_LABEL, setSkyPreview, useDaylight } from '../../lib/daylight';

const DAY_MIN = 1440;

/** Floating time control over the 3D house: drag through the day or play it as a time-lapse. */
export function SkyScrubber({ onClose }: { onClose: () => void }) {
  const daylight = useDaylight();
  const { timeZone } = daylight;
  // Anchor the scrubber to the local day it opened on.
  const [midnight] = useState(() => {
    const now = new Date();
    return now.valueOf() - zonedNow(timeZone, now).minutes * 60_000 - now.getUTCSeconds() * 1000;
  });
  const [minutes, setMinutes] = useState(() => zonedNow(timeZone).minutes);
  const [playing, setPlaying] = useState(false);
  const frame = useRef(0);

  useEffect(() => {
    setSkyPreview(new Date(midnight + minutes * 60_000));
  }, [midnight, minutes]);

  useEffect(() => () => setSkyPreview(null), []);

  // A full day in about 16 seconds.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setMinutes((m) => (m + dt * 0.09) % DAY_MIN);
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [playing]);

  const phase = PHASE_LABEL[daylight.phase][daylight.morning ? 'morning' : 'evening'];
  const sunrise = daylight.today.sunrise ? (daylight.today.sunrise.valueOf() - midnight) / 60_000 / DAY_MIN : null;
  const sunset = daylight.today.sunset ? (daylight.today.sunset.valueOf() - midnight) / 60_000 / DAY_MIN : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className="rounded-[22px] bg-black/45 p-3 text-white ring-1 ring-white/10 backdrop-blur-xl"
      role="group"
      aria-label="Sky preview"
    >
      <div className="flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause the time-lapse' : 'Play the day as a time-lapse'}
          className="flex size-9 items-center justify-center rounded-full bg-white text-[#111214] active:scale-95"
        >
          {playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="ml-0.5 size-4" fill="currentColor" />}
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[15px] font-medium tabular">{formatClock(daylight.at, timeZone)}</p>
          <p className="truncate text-[12px] text-white/60">{phase}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setMinutes(zonedNow(timeZone).minutes);
          }}
          className="flex h-8 items-center gap-1 rounded-full px-3 text-[12.5px] font-medium text-white/85 hover:bg-white/10"
        >
          <RotateCcw className="size-3.5" /> Now
        </button>
        <button type="button" onClick={onClose} aria-label="Close the sky preview" className="flex size-8 items-center justify-center rounded-full hover:bg-white/10">
          <X className="size-4" />
        </button>
      </div>
      <div className="relative mt-2 px-1">
        {/* Daylight band behind the slider: night, day, night. */}
        {sunrise !== null && sunset !== null && (
          <div
            className="pointer-events-none absolute inset-x-1 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
            style={{
              background: `linear-gradient(90deg, #1b2440 0%, #1b2440 ${sunrise * 100 - 3}%, #f0a35e ${sunrise * 100}%, #8fb4e8 ${sunrise * 100 + 6}%, #8fb4e8 ${sunset * 100 - 6}%, #f0a35e ${sunset * 100}%, #1b2440 ${sunset * 100 + 3}%, #1b2440 100%)`,
            }}
          />
        )}
        <input
          type="range"
          min={0}
          max={DAY_MIN - 1}
          step={1}
          value={Math.round(minutes)}
          aria-label="Time of day"
          onChange={(event) => {
            setPlaying(false);
            setMinutes(Number(event.target.value));
          }}
          className="relative w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgb(255_255_255/0.2)]"
        />
      </div>
    </motion.div>
  );
}
