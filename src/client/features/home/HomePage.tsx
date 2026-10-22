import { formatDayDate } from '@shared/format';
import { rankTasks } from '@shared/priority';
import { houseHealth, summarizeZones, taskTiming, type ZoneHealth, type ZoneSummary } from '@shared/status';
import type { Task, ZoneId } from '@shared/types';
import { isZoneId, LEVELS, zoneDef, type LevelId } from '@shared/zones';
import { ArrowRight, ChevronRight, Expand, Plus, Shrink, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAppData, useUi } from '../../app/context';
import { Button, Chip, cx, EmptyState, IconButton } from '../../components/ui';
import { HouseView } from '../../house/HouseView';
import type { FocusTarget } from '../../house/model';
import { greeting } from '../../lib/today';
import { useDarkMode } from '../../lib/theme';
import { useOpenTask } from '../tasks/actions';
import { TaskRow } from '../tasks/TaskRow';
import { HealthRing } from './HealthRing';

const RAIL: { focus: FocusTarget; label: string; level: LevelId | null }[] = [
  { focus: 'overview', label: 'All', level: null },
  { focus: 'roof', label: 'Roof', level: 'roof' },
  { focus: 'upper', label: '+1', level: 'upper' },
  { focus: 'ground', label: '0', level: 'ground' },
  { focus: 'basement', label: '−1', level: 'basement' },
  { focus: 'yard', label: 'Yard', level: 'outside' },
];

const HEALTH_RANK: Record<ZoneHealth, number> = { overdue: 4, today: 3, soon: 2, ok: 1, empty: 0 };
const DOT: Record<ZoneHealth, string> = {
  overdue: 'bg-overdue',
  today: 'bg-today',
  soon: 'bg-soon',
  ok: 'bg-ok',
  empty: 'bg-transparent',
};

function worstOnLevel(summaries: Record<ZoneId, ZoneSummary>, level: LevelId): ZoneHealth {
  let worst: ZoneHealth = 'empty';
  for (const summary of Object.values(summaries)) {
    if (zoneDef(summary.zoneId).level === level && HEALTH_RANK[summary.health] > HEALTH_RANK[worst]) worst = summary.health;
  }
  return worst;
}

export function HomePage() {
  const { tasks, today, me, zoneLabel, bootstrap } = useAppData();
  const { openComposer } = useUi();
  const dark = useDarkMode();
  const openTask = useOpenTask();
  const [params, setParams] = useSearchParams();
  const [focus, setFocus] = useState<FocusTarget>('overview');
  const [expanded, setExpanded] = useState(false);

  const zoneParam = params.get('zone');
  const selectedZone = zoneParam && isZoneId(zoneParam) ? zoneParam : null;
  const highlightId = params.get('highlight');
  const highlighted = highlightId ? (tasks.find((t) => t.id === highlightId) ?? null) : null;

  const setSelection = (zone: ZoneId | null, highlight: string | null = null) => {
    const next = new URLSearchParams(params);
    if (zone) next.set('zone', zone);
    else next.delete('zone');
    if (highlight) next.set('highlight', highlight);
    else next.delete('highlight');
    setParams(next, { replace: true });
  };

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
      .sort((a, b) => (taskTiming(a, today).effectiveDue ?? '9999') .localeCompare(taskTiming(b, today).effectiveDue ?? '9999'));
  }, [open, selectedZone, today]);

  const onRowTap = (task: Task) => {
    if (highlighted?.id === task.id) {
      openTask(task);
      return;
    }
    setSelection(task.zoneId ?? selectedZone, task.id);
  };

  const zoneSummary = selectedZone ? summaries[selectedZone] : null;
  const houseZone = selectedZone ?? (highlighted?.zoneId === 'house' ? null : (highlighted?.zoneId ?? null));

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* House */}
      <section
        className={cx(
          'relative shrink-0 overflow-hidden transition-[height] duration-500 ease-out lg:h-auto lg:flex-1',
          expanded ? 'h-[82%]' : 'h-[57%]',
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 px-5 pt-[max(env(safe-area-inset-top),16px)] lg:px-8 lg:pt-8">
          <div className="pointer-events-auto">
            <p className="text-[13px] font-medium text-ink-3">{formatDayDate(today)}</p>
            <h1 className="font-display text-[26px] leading-tight font-semibold tracking-tight text-ink lg:text-[32px]">
              {greeting(bootstrap.household.timeZone)}, {me.name.split(' ')[0]}
            </h1>
          </div>
          <div className="pointer-events-auto">
            <HealthRing health={health} />
          </div>
        </div>

        <HouseView
          className="absolute inset-0 h-full w-full pt-[72px] pb-11 lg:pt-28 lg:pb-16"
          summaries={summaries}
          selectedZone={houseZone}
          highlightFixture={highlighted?.fixtureId ?? null}
          focus={focus}
          dark={dark}
          zoneLabel={zoneLabel}
          onSelectZone={(zone) => setSelection(zone)}
        />

        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 px-4 pb-3 lg:px-8 lg:pb-6">
          <div className="scrollbar-none flex gap-1.5 overflow-x-auto rounded-full bg-surface/80 p-1 shadow-card backdrop-blur-md">
            {RAIL.map((item) => {
              const active = !selectedZone && focus === item.focus;
              const dot = item.level ? worstOnLevel(summaries, item.level) : 'empty';
              return (
                <button
                  key={item.focus}
                  onClick={() => {
                    setSelection(null);
                    setFocus(item.focus);
                  }}
                  className={cx(
                    'relative flex h-8 min-w-10 items-center justify-center gap-1 rounded-full px-3 text-[13px] font-semibold transition',
                    active ? 'bg-ink text-canvas' : 'text-ink-2 hover:bg-sunken',
                  )}
                  aria-pressed={active}
                  aria-label={item.level ? `Show ${LEVELS.find((l) => l.id === item.level)?.name}` : 'Show the whole house'}
                >
                  {item.label}
                  {dot !== 'empty' && dot !== 'ok' && <span className={cx('size-1.5 rounded-full', DOT[dot])} />}
                </button>
              );
            })}
          </div>
          <IconButton
            label={expanded ? 'Shrink house' : 'Expand house'}
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto bg-surface/80 shadow-card backdrop-blur-md lg:hidden"
          >
            {expanded ? <Shrink className="size-[18px]" /> : <Expand className="size-[18px]" />}
          </IconButton>
        </div>
      </section>

      {/* Tasks */}
      <section className="relative z-20 min-h-0 flex-1 overflow-y-auto rounded-t-[28px] border-t border-line/60 bg-surface shadow-sheet lg:w-[440px] lg:flex-none lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none">
        <AnimatePresence mode="wait" initial={false}>
          {selectedZone ? (
            <motion.div
              key={`zone-${selectedZone}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="px-3 pt-4 pb-6 lg:px-5 lg:pt-8"
            >
              <div className="flex items-start gap-3 px-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold tracking-[0.08em] text-ink-3 uppercase">
                    {LEVELS.find((l) => l.id === zoneDef(selectedZone).level)?.name}
                  </p>
                  <h2 className="font-display text-[24px] font-semibold tracking-tight text-ink">{zoneLabel(selectedZone)}</h2>
                  <p className="text-[13px] text-ink-3">
                    {zoneSummary && zoneSummary.open > 0
                      ? [
                          `${zoneSummary.open} open`,
                          zoneSummary.overdue ? `${zoneSummary.overdue} overdue` : null,
                          zoneSummary.today ? `${zoneSummary.today} due today` : null,
                          zoneSummary.soon ? `${zoneSummary.soon} coming up` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : zoneDef(selectedZone).blurb}
                  </p>
                </div>
                <IconButton label="Back to the whole house" onClick={() => setSelection(null)} className="bg-sunken">
                  <X className="size-[18px]" />
                </IconButton>
              </div>
              <div className="mt-3 space-y-0.5">
                <AnimatePresence initial={false}>
                  {zoneTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onOpen={onRowTap}
                      showZone={false}
                      selected={highlighted?.id === task.id}
                    >
                      {highlighted?.id === task.id && (
                        <div className="flex justify-end px-3 pb-3">
                          <Button size="sm" variant="soft" onClick={() => openTask(task)} icon={<ChevronRight className="size-4" />}>
                            Details & how-to
                          </Button>
                        </div>
                      )}
                    </TaskRow>
                  ))}
                </AnimatePresence>
              </div>
              {zoneTasks.length === 0 && (
                <EmptyState
                  title={`Nothing scheduled in the ${zoneLabel(selectedZone).toLowerCase()}`}
                  body="Add something you want to remember for this spot."
                />
              )}
              <div className="mt-3 px-2">
                <Button
                  variant="secondary"
                  block
                  icon={<Plus className="size-4" />}
                  onClick={() =>
                    openComposer({ mode: 'create', defaults: { zoneId: selectedZone, kind: 'maintenance' } })
                  }
                >
                  Add to {zoneLabel(selectedZone)}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="attention"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="px-3 pt-4 pb-6 lg:px-5 lg:pt-8"
            >
              <div className="flex items-end justify-between px-2">
                <div>
                  <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink">Needs attention</h2>
                  <p className="text-[13px] text-ink-3">
                    {attention.length === 0
                      ? 'Nothing urgent around the house'
                      : `${health.overdue ? `${health.overdue} overdue · ` : ''}${attention.length} in the next few days`}
                  </p>
                </div>
                <Link to="/focus" className="flex items-center gap-1 text-[13px] font-semibold text-accent">
                  Focus <ArrowRight className="size-4" />
                </Link>
              </div>
              <div className="mt-3 space-y-0.5">
                <AnimatePresence initial={false}>
                  {attention.slice(0, 8).map(({ task }) => (
                    <TaskRow key={task.id} task={task} onOpen={onRowTap} selected={highlighted?.id === task.id}>
                      {highlighted?.id === task.id && (
                        <div className="flex justify-end px-3 pb-3">
                          <Button size="sm" variant="soft" onClick={() => openTask(task)} icon={<ChevronRight className="size-4" />}>
                            Details & how-to
                          </Button>
                        </div>
                      )}
                    </TaskRow>
                  ))}
                </AnimatePresence>
              </div>
              {attention.length === 0 && (
                <EmptyState
                  icon={<Sparkles className="size-5" />}
                  title="Your house is in great shape"
                  body="Tap a room to see what's coming up there."
                />
              )}
              <div className="mt-4 flex flex-wrap gap-2 px-2">
                {Object.values(summaries)
                  .filter((s) => s.open > 0)
                  .sort((a, b) => HEALTH_RANK[b.health] - HEALTH_RANK[a.health])
                  .map((s) => (
                    <Chip
                      key={s.zoneId}
                      onClick={() => setSelection(s.zoneId)}
                      icon={<span className={cx('size-2 rounded-full', s.health === 'ok' ? 'bg-line-strong' : DOT[s.health])} />}
                    >
                      {zoneLabel(s.zoneId)} <span className="text-ink-3 tabular">{s.open}</span>
                    </Chip>
                  ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
