import type { ZoneSummary } from '@shared/status';
import type { FixtureId, ZoneId } from '@shared/types';
import { FIXTURES, ZONES, zoneName } from '@shared/zones';
import { useState } from 'react';
import { HouseView } from '../house/HouseView';
import type { FocusTarget } from '../house/model';
import { useDarkMode } from '../lib/theme';

function summary(zoneId: ZoneId, partial: Partial<ZoneSummary>): ZoneSummary {
  return { zoneId, open: 1, overdue: 0, today: 0, soon: 0, fireOverdue: false, health: 'ok', nextDue: null, ...partial };
}

const SUMMARIES: Partial<Record<ZoneId, ZoneSummary>> = {
  mechanical: summary('mechanical', { open: 6, overdue: 1, soon: 1, fireOverdue: true, health: 'overdue' }),
  kitchen: summary('kitchen', { open: 4, soon: 2, health: 'soon' }),
  garage: summary('garage', { open: 2 }),
  bathroom: summary('bathroom', { open: 2, today: 1, health: 'today' }),
  backyard: summary('backyard', { open: 3, soon: 1, health: 'soon' }),
  roof: summary('roof', { open: 1, soon: 1, health: 'soon' }),
  living: summary('living', { open: 1 }),
  entry: summary('entry', { open: 1 }),
};

/** Dev-only page for working on the house illustration (visit /__house). */
export function HousePlayground() {
  const params = new URLSearchParams(window.location.search);
  const systemDark = useDarkMode();
  const dark = params.has('dark') ? params.get('dark') !== '0' : systemDark;
  const [selected, setSelected] = useState<ZoneId | null>((params.get('zone') as ZoneId) || null);
  const [focus, setFocus] = useState<FocusTarget>((params.get('focus') as FocusTarget) || 'overview');
  const [fixture, setFixture] = useState<FixtureId | null>((params.get('fixture') as FixtureId) || null);

  return (
    <div className={`min-h-dvh ${dark ? 'bg-[#0e1117] text-white' : 'bg-canvas'} p-4`}>
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {(['overview', 'upper', 'ground', 'basement', 'roof', 'yard'] as FocusTarget[]).map((f) => (
            <button key={f} className="rounded-full border px-3 py-1" onClick={() => { setSelected(null); setFocus(f); }}>
              {f}
            </button>
          ))}
          <select className="rounded border px-2" value={fixture ?? ''} onChange={(e) => setFixture((e.target.value as FixtureId) || null)}>
            <option value="">fixture…</option>
            {FIXTURES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <span className="opacity-60">selected: {selected ?? 'none'}</span>
        </div>
        <div className="aspect-[4/5] w-full max-w-[430px] sm:aspect-[16/10] sm:max-w-none" data-testid="house">
          <HouseView
            className="h-full w-full"
            summaries={SUMMARIES}
            selectedZone={selected}
            focus={focus}
            dark={dark}
            highlightFixture={fixture}
            zoneLabel={(zone) => zoneName(zone)}
            onSelectZone={setSelected}
          />
        </div>
        <div className="flex flex-wrap gap-1 text-xs opacity-70">
          {ZONES.map((z) => (
            <button key={z.id} className="rounded border px-2 py-0.5" onClick={() => setSelected(z.id)}>
              {z.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
