import type { ZoneHealth, ZoneSummary } from '@shared/status';
import type { ZoneId } from '@shared/types';
import { House, Layers, LocateFixed } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ComponentType } from 'react';
import { cx } from '../../components/ui';
import { levelZones, type SceneView } from '../../scene/layout';

type RailItem = {
  key: string;
  label: string;
  aria: string;
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  view?: SceneView;
  zone?: ZoneId;
  health: ZoneHealth;
};

const RANK: Record<ZoneHealth, number> = { overdue: 4, today: 3, soon: 2, ok: 1, empty: 0 };
const DOT: Partial<Record<ZoneHealth, string>> = { overdue: 'bg-[#ff5a52]', today: 'bg-[#ff9f43]', soon: 'bg-[#f2c14e]' };

function worst(healths: (ZoneHealth | undefined)[]): ZoneHealth {
  return healths.reduce<ZoneHealth>((acc, h) => (h && RANK[h] > RANK[acc] ? h : acc), 'empty');
}

export function railItems(summaries: Partial<Record<ZoneId, ZoneSummary>>): RailItem[] {
  const level = (key: 'upper' | 'ground' | 'basement') => worst(levelZones(key).map((zone) => summaries[zone]?.health));
  return [
    { key: 'house', label: 'House', aria: 'Show the outside of the house', icon: House, view: { kind: 'exterior' }, health: 'empty' },
    { key: 'floors', label: 'Floors', aria: 'Show all floors', icon: Layers, view: { kind: 'exploded' }, health: 'empty' },
    { key: 'roof', label: 'Roof', aria: 'Show the roof', zone: 'roof', health: summaries.roof?.health ?? 'empty' },
    { key: 'upper', label: '+1', aria: 'Show the upper floor', view: { kind: 'level', level: 'upper' }, health: level('upper') },
    { key: 'ground', label: '0', aria: 'Show the ground floor', view: { kind: 'level', level: 'ground' }, health: level('ground') },
    { key: 'basement', label: '−1', aria: 'Show the basement', view: { kind: 'level', level: 'basement' }, health: level('basement') },
    { key: 'yard', label: 'Yard', aria: 'Show the backyard', zone: 'backyard', health: summaries.backyard?.health ?? 'empty' },
  ];
}

export function FloorRail({
  summaries,
  view,
  selectedZone,
  moved,
  onView,
  onZone,
  onReset,
}: {
  summaries: Partial<Record<ZoneId, ZoneSummary>>;
  view: SceneView;
  selectedZone: ZoneId | null;
  moved: boolean;
  onView: (view: SceneView) => void;
  onZone: (zone: ZoneId) => void;
  onReset: () => void;
}) {
  const items = railItems(summaries);
  const isActive = (item: RailItem) => {
    if (item.zone) return selectedZone === item.zone;
    if (!item.view || (selectedZone && selectedZone !== 'house')) return false;
    if (item.view.kind === 'level') return view.kind === 'level' && view.level === item.view.level;
    return item.view.kind === view.kind;
  };
  return (
    <div className="flex items-center gap-2">
      <nav aria-label="House views" className="scrollbar-none flex min-w-0 gap-0.5 overflow-x-auto rounded-full bg-black/35 p-1 backdrop-blur-xl ring-1 ring-white/10">
        {items.map((item) => {
          const active = isActive(item);
          const dot = DOT[item.health];
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              aria-label={item.aria}
              title={item.aria}
              onClick={() => (item.zone ? onZone(item.zone) : item.view && onView(item.view))}
              className={cx(
                'relative flex h-8 min-w-9 shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-[13px] font-medium tabular transition-colors',
                active ? 'bg-white text-[#111214]' : 'text-white/75 hover:bg-white/10 hover:text-white',
              )}
            >
              {item.icon ? <item.icon className="size-4" strokeWidth={1.8} /> : item.label}
              {dot && <span className={cx('size-1.5 rounded-full', dot)} />}
            </button>
          );
        })}
      </nav>
      <AnimatePresence>
        {moved && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={onReset}
            aria-label="Reset the view"
            title="Reset the view"
            className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-white/10 backdrop-blur-xl active:scale-95"
          >
            <LocateFixed className="size-[18px]" strokeWidth={1.8} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
