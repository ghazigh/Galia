import { HOME } from '@shared/home';
import type { ZoneSummary } from '@shared/status';
import type { FixtureId, ZoneId } from '@shared/types';
import { FIXTURES, zoneName } from '@shared/zones';
import { useMemo, useRef, useState } from 'react';
import { computeDaylight, useSkyLocation } from '../lib/daylight';
import type { SceneQuality } from '../lib/prefs';
import { HouseStage } from '../scene/HouseStage';
import { EXTERIOR, type SceneView } from '../scene/layout';

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
  house: summary('house', { open: 2, soon: 1, health: 'soon' }),
};

const VIEWS: Record<string, SceneView> = {
  exterior: EXTERIOR,
  exploded: { kind: 'exploded' },
  upper: { kind: 'level', level: 'upper' },
  ground: { kind: 'level', level: 'ground' },
  basement: { kind: 'level', level: 'basement' },
  roof: { kind: 'roof' },
  yard: { kind: 'yard' },
};

/** Dev-only page for the 3D house (visit /__scene?view=ground&hour=21.5&inset=360). */
export function ScenePlayground() {
  const params = new URLSearchParams(window.location.search);
  const timeZone = HOME.timeZone;
  const [view, setView] = useState<SceneView>(VIEWS[params.get('view') ?? 'exterior'] ?? EXTERIOR);
  const [zone, setZone] = useState<ZoneId | null>((params.get('zone') as ZoneId) || null);
  const [fixture, setFixture] = useState<FixtureId | null>((params.get('fixture') as FixtureId) || null);
  const [hour, setHour] = useState(params.has('hour') ? Number(params.get('hour')) : null);
  const date = params.get('date') ?? '2026-11-01';
  const quality = (params.get('quality') as SceneQuality) || 'balanced';
  const inset = useRef(Number(params.get('inset') ?? 0));
  const location = useSkyLocation();

  const daylight = useMemo(() => {
    const at = hour === null ? new Date() : new Date(new Date(`${date}T00:00:00-04:00`).valueOf() + hour * 3_600_000);
    return computeDaylight(at, hour === null, timeZone, location);
  }, [hour, date, timeZone, location]);

  return (
    <div className="fixed inset-0 bg-canvas text-ink">
      <HouseStage
        className="absolute inset-0"
        summaries={SUMMARIES}
        view={view}
        selectedZone={zone}
        highlightFixture={fixture}
        zoneLabel={(z) => zoneName(z)}
        daylight={daylight}
        facing={params.has('facing') ? Number(params.get('facing')) : null}
        quality={quality}
        showLabels={params.get('labels') !== '0'}
        autoRotate={false}
        active
        reducedMotion={params.has('still')}
        insetBottom={inset}
        insetTop={90}
        fixtureTasks={{ dryer: { taskId: 'x', title: 'Clean the lint trap', due: 'Tomorrow', tone: 'soon' }, 'dryer-vent': { taskId: 'y', title: 'Clean the dryer exhaust vent', due: '3 days late', tone: 'overdue' } }}
        onSelectZone={setZone}
        onViewChange={(next) => {
          setZone(null);
          setView(next);
        }}
        onFixtureTap={setFixture}
      />
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center gap-2 bg-black/50 p-3 text-xs text-white" style={{ height: inset.current || undefined }}>
        {Object.keys(VIEWS).map((key) => (
          <button key={key} className="rounded-full border border-white/30 px-3 py-1" onClick={() => { setZone(null); setView(VIEWS[key]); }}>
            {key}
          </button>
        ))}
        <select className="rounded bg-black/40 px-2 py-1" value={fixture ?? ''} onChange={(e) => setFixture((e.target.value as FixtureId) || null)}>
          <option value="">fixture…</option>
          {FIXTURES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <input type="range" min={0} max={24} step={0.25} value={hour ?? 12} onChange={(e) => setHour(Number(e.target.value))} />
        <span>
          {daylight.phase} · sun {(daylight.sun.altitude * 57.3).toFixed(1)}° · zone {zone ?? 'none'}
        </span>
      </div>
    </div>
  );
}
