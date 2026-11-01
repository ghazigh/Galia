import { dueLabel } from '@shared/format';
import { rankTasks } from '@shared/priority';
import { houseHealth, summarizeZones, taskTiming } from '@shared/status';
import type { FixtureId, Task, ZoneId } from '@shared/types';
import { isZoneId, zoneDef } from '@shared/zones';
import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router';
import { useAppData } from '../../app/context';
import { useModalOpen } from '../../components/Sheet';
import { SnapSheet } from '../../components/SnapSheet';
import { useDaylight } from '../../lib/daylight';
import { useIsDesktop } from '../../lib/media';
import { usePrefs } from '../../lib/prefs';
import { usePrefersReducedMotion } from '../../lib/theme';
import type { FixtureTask } from '../../scene/HouseScene';
import { HouseStage } from '../../scene/HouseStage';
import { EXTERIOR, sameView, viewForZone, type SceneView } from '../../scene/layout';
import type { LabelTone } from '../../scene/Labels';
import { DaylightSheet } from '../daylight/DaylightSheet';
import { SkyScrubber } from '../daylight/SkyScrubber';
import { useOpenTask } from '../tasks/actions';
import { FloorRail } from './FloorRail';
import { HealthSheet } from './HealthSheet';
import { HomeHeader } from './HomeHeader';
import { levelName, LevelPanel, OverviewPanel, PanelTitle, QuickActions, RoomPanel, zoneStatus } from './panels';

const TONE: Record<string, LabelTone> = { overdue: 'overdue', today: 'today', soon: 'soon', upcoming: 'muted', unscheduled: 'muted', done: 'ok' };

function useViewportHeight(): number {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('resize', onChange);
      return () => window.removeEventListener('resize', onChange);
    },
    () => window.innerHeight,
    () => 800,
  );
}

function usePageVisible(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener('visibilitychange', onChange);
      return () => document.removeEventListener('visibilitychange', onChange);
    },
    () => document.visibilityState === 'visible',
    () => true,
  );
}

/** The view a selection needs (the whole-house smoke alarms are inside every storey). */
function viewForSelection(zone: ZoneId, fixture: FixtureId | null | undefined): SceneView {
  if (zone === 'house') return fixture === 'smoke-detectors' ? { kind: 'exploded' } : EXTERIOR;
  return viewForZone(zone);
}

export function HomePage({ active }: { active: boolean }) {
  const { tasks, today, me, zoneLabel } = useAppData();
  const prefs = usePrefs();
  const daylight = useDaylight();
  const reducedMotion = usePrefersReducedMotion();
  const desktop = useIsDesktop();
  const visible = usePageVisible();
  const modalOpen = useModalOpen();
  const openTask = useOpenTask();
  const [params, setParams] = useSearchParams();
  const [manualView, setManualView] = useState<SceneView>(EXTERIOR);
  const [moved, setMoved] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [daylightOpen, setDaylightOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  // ── Selection (in the URL, so links like "Show in house" work) ───────────────────────────
  const zoneParam = params.get('zone');
  const selectedZone = zoneParam && isZoneId(zoneParam) ? zoneParam : null;
  const highlightId = params.get('highlight');
  const highlighted = highlightId ? (tasks.find((t) => t.id === highlightId) ?? null) : null;
  // A selection decides the view; otherwise it's whatever the floor rail last chose.
  const sceneZone = selectedZone ?? highlighted?.zoneId ?? null;
  const view = sceneZone ? viewForSelection(sceneZone, highlighted?.fixtureId) : manualView;

  const setSelection = useCallback(
    (zone: ZoneId | null, highlight: string | null = null) => {
      const next = new URLSearchParams(params);
      if (zone) next.set('zone', zone);
      else next.delete('zone');
      if (highlight) next.set('highlight', highlight);
      else next.delete('highlight');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  // ── Data ─────────────────────────────────────────────────────────────────────────────────
  const open = useMemo(() => tasks.filter((t) => !t.completedAt), [tasks]);
  const summaries = useMemo(() => summarizeZones(open, today), [open, today]);
  const health = useMemo(() => houseHealth(open, today), [open, today]);
  const attention = useMemo(
    () =>
      rankTasks(open, { today, userId: me.id }, { includeOthers: true }).filter(({ timing }) =>
        ['overdue', 'today', 'soon'].includes(timing.state),
      ),
    [open, today, me.id],
  );
  const zoneTasks = useMemo(() => {
    if (!selectedZone) return [];
    return open
      .filter((t) => t.zoneId === selectedZone)
      .sort((a, b) => (taskTiming(a, today).effectiveDue ?? '9999').localeCompare(taskTiming(b, today).effectiveDue ?? '9999'));
  }, [open, selectedZone, today]);
  const fixtureTasks = useMemo(() => {
    const out: Partial<Record<FixtureId, FixtureTask & { due0: string }>> = {};
    for (const task of open) {
      if (!task.fixtureId) continue;
      const timing = taskTiming(task, today);
      const key = timing.effectiveDue ?? '9999-12-31';
      const current = out[task.fixtureId];
      if (current && current.due0 <= key) continue;
      out[task.fixtureId] = { taskId: task.id, title: task.title, due: dueLabel(timing, today), tone: TONE[timing.state] ?? 'muted', due0: key };
    }
    return out as Partial<Record<FixtureId, FixtureTask>>;
  }, [open, today]);

  const onRowTap = (task: Task) => {
    if (highlighted?.id === task.id) {
      openTask(task);
      return;
    }
    setSelection(task.zoneId ?? selectedZone, task.id);
  };

  const onFixtureTap = (fixture: FixtureId) => {
    const task = fixtureTasks[fixture];
    if (task) setSelection(selectedZone ?? tasks.find((t) => t.id === task.taskId)?.zoneId ?? null, task.taskId);
  };

  const onView = (next: SceneView) => {
    if (!sameView(next, view) || selectedZone) setSelection(null);
    setManualView(next);
  };

  // ── Bottom sheet (phones) ────────────────────────────────────────────────────────────────
  const vh = useViewportHeight();
  const snaps = useMemo(() => [176, Math.round(Math.min(470, Math.max(330, vh * 0.46))), Math.max(420, vh - 112)], [vh]);
  const [snap, setSnap] = useState(1);
  const sheetHeight = useMotionValue(snaps[1]);
  const inset = useRef(desktop ? 0 : snaps[1]);
  useMotionValueEvent(sheetHeight, 'change', (value) => {
    if (!desktop) inset.current = value;
  });
  useEffect(() => {
    inset.current = desktop ? 0 : sheetHeight.get();
  }, [desktop, sheetHeight]);
  const railBottom = useTransform(sheetHeight, (h) => h + 12);
  const railOpacity = useTransform(sheetHeight, [snaps[1] + 40, snaps[2] - 60], [1, 0]);

  // A new selection brings the panel up from its collapsed state.
  useEffect(() => {
    if (selectedZone || view.kind === 'level') setSnap((s) => (s === 0 ? 1 : s));
  }, [selectedZone, view.kind]);

  // Render only while the house can be seen: not behind a page, a sheet, or a fully raised panel.
  const sceneVisible = active && visible && !modalOpen && (desktop || snap < 2);

  // ── Panel content ────────────────────────────────────────────────────────────────────────
  const zoneSummary = selectedZone ? summaries[selectedZone] : undefined;
  let title: { eyebrow: string; title: string; detail?: string; onClose?: () => void; closeLabel?: string } | null = null;
  let content: React.ReactNode;
  if (selectedZone) {
    title = {
      eyebrow: levelName(zoneDef(selectedZone).level),
      title: zoneLabel(selectedZone),
      detail: zoneStatus(zoneSummary, zoneDef(selectedZone).blurb),
      onClose: () => setSelection(null),
      closeLabel: 'Back to the whole house',
    };
    content = <RoomPanel zone={selectedZone} tasks={zoneTasks} highlightedId={highlighted?.id ?? null} onRowTap={onRowTap} />;
  } else if (view.kind === 'level') {
    title = {
      eyebrow: 'Floor',
      title: levelName(view.level),
      detail: 'Tap a room in the house or below',
      onClose: () => onView(EXTERIOR),
      closeLabel: 'Back to the outside view',
    };
    content = <LevelPanel level={view.level} summaries={summaries} onZone={(zone) => setSelection(zone)} />;
  } else {
    content = (
      <OverviewPanel
        attention={attention}
        health={health}
        summaries={summaries}
        daylight={daylight}
        highlightedId={highlighted?.id ?? null}
        onRowTap={onRowTap}
        onZone={(zone) => setSelection(zone)}
        onDaylight={() => setDaylightOpen(true)}
        onHealth={() => setHealthOpen(true)}
      />
    );
  }
  const header = title ? <PanelTitle {...title} /> : <QuickActions daylight={daylight} onDaylight={() => setDaylightOpen(true)} />;

  const stage = (
    <HouseStage
      className="absolute inset-0"
      summaries={summaries}
      fixtureTasks={fixtureTasks}
      view={view}
      selectedZone={selectedZone}
      highlightFixture={highlighted?.fixtureId ?? null}
      zoneLabel={zoneLabel}
      daylight={daylight}
      facing={prefs.facing}
      quality={prefs.quality}
      showLabels={prefs.labels}
      autoRotate={prefs.autoRotate}
      active={sceneVisible}
      reducedMotion={reducedMotion}
      insetBottom={inset}
      insetTop={desktop ? 120 : 132}
      resetKey={resetKey}
      onSelectZone={(zone) => setSelection(zone)}
      onViewChange={onView}
      onFixtureTap={onFixtureTap}
      onUserMove={setMoved}
    />
  );

  const scrubber = <AnimatePresence>{scrubbing && <SkyScrubber key="scrubber" onClose={() => setScrubbing(false)} />}</AnimatePresence>;

  const rail = (
    <FloorRail
      summaries={summaries}
      view={view}
      selectedZone={selectedZone}
      moved={moved}
      onView={onView}
      onZone={(zone) => setSelection(zone)}
      onReset={() => setResetKey((k) => k + 1)}
    />
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-canvas lg:left-[76px] lg:flex" role="group" aria-label="Your house. Select a room to see its tasks.">
      <div className="relative h-full overflow-hidden lg:flex-1">
        {stage}
        <HomeHeader health={health} attention={attention.length} daylight={daylight} onDaylight={() => setDaylightOpen(true)} />
        {desktop && (
          <div className="absolute inset-x-0 bottom-0 z-10 space-y-3 px-8 pb-6">
            <div className="max-w-md">{scrubber}</div>
            {rail}
          </div>
        )}
      </div>

      {desktop ? (
        <aside className="relative z-20 flex h-full w-[420px] shrink-0 flex-col border-l border-line bg-canvas">
          <div className="shrink-0 pt-6">{header}</div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-8">{content}</div>
        </aside>
      ) : (
        <>
          <motion.div className="absolute inset-x-0 z-10 space-y-3 px-4" style={{ bottom: railBottom, opacity: railOpacity }}>
            {scrubber}
            {rail}
          </motion.div>
          <SnapSheet snaps={snaps} snap={snap} onSnapChange={setSnap} height={sheetHeight} header={header} reducedMotion={reducedMotion} label="House panel">
            {content}
          </SnapSheet>
        </>
      )}

      <DaylightSheet
        open={daylightOpen}
        onClose={() => setDaylightOpen(false)}
        onPreview={() => {
          setDaylightOpen(false);
          setScrubbing(true);
          setSelection(null);
          setManualView(EXTERIOR);
          setSnap(0);
        }}
      />
      <HealthSheet open={healthOpen} onClose={() => setHealthOpen(false)} health={health} summaries={summaries} onZone={(zone) => setSelection(zone)} />
    </div>
  );
}
