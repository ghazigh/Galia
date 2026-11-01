import { formatShortDate } from '@shared/format';
import type { RankedTask } from '@shared/priority';
import type { HouseHealth, ZoneHealth, ZoneSummary } from '@shared/status';
import type { Task, ZoneId } from '@shared/types';
import { LEVELS, zoneDef } from '@shared/zones';
import {
  Activity,
  ArrowRight,
  ChevronRight,
  ListChecks,
  Moon,
  Plus,
  Settings,
  Sparkles,
  SunMedium,
  Target,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAppData, useUi } from '../../app/context';
import { NavRow, QuickAction } from '../../components/nav';
import { Button, cx, EmptyState, IconButton } from '../../components/ui';
import { formatClock, PHASE_LABEL, type Daylight } from '../../lib/daylight';
import { ROOMS } from '../../scene/layout';
import { useOpenTask } from '../tasks/actions';
import { TaskRow } from '../tasks/TaskRow';
import { moonPhaseName } from '@shared/astro';

export const HEALTH_RANK: Record<ZoneHealth, number> = { overdue: 4, today: 3, soon: 2, ok: 1, empty: 0 };
export const HEALTH_DOT: Record<ZoneHealth, string> = {
  overdue: 'bg-overdue',
  today: 'bg-today',
  soon: 'bg-soon',
  ok: 'bg-ok',
  empty: 'bg-line-strong',
};

export function zoneStatus(summary: ZoneSummary | undefined, fallback: string): string {
  if (!summary || summary.open === 0) return fallback;
  return [
    `${summary.open} open`,
    summary.overdue ? `${summary.overdue} overdue` : null,
    summary.today ? `${summary.today} due today` : null,
    summary.soon ? `${summary.soon} coming up` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ── Sheet headers ─────────────────────────────────────────────────────────────────────────────

export function QuickActions({ onDaylight, daylight }: { onDaylight: () => void; daylight: Daylight }) {
  const { openComposer, setExpertOpen } = useUi();
  return (
    <div className="flex justify-around px-3 pt-1 pb-3">
      <QuickAction icon={Plus} label="New task" accent onClick={() => openComposer()} />
      <QuickAction icon={Zap} label="Quick wins" to="/focus?quick=1" />
      <QuickAction icon={Sparkles} label="Expert" onClick={() => setExpertOpen(true)} />
      <QuickAction icon={daylight.isNight ? Moon : SunMedium} label="Daylight" onClick={onDaylight} />
    </div>
  );
}

export function PanelTitle({ eyebrow, title, detail, onClose, closeLabel }: { eyebrow: string; title: string; detail?: ReactNode; onClose?: () => void; closeLabel?: string }) {
  return (
    <div className="flex items-start gap-3 px-5 pt-1 pb-3">
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-ink-3">{eyebrow}</p>
        <h2 className="mt-1 font-display text-[24px] leading-tight font-semibold tracking-[-0.02em] text-ink">{title}</h2>
        {detail && <p className="mt-0.5 text-[13px] text-ink-3">{detail}</p>}
      </div>
      {onClose && (
        <IconButton label={closeLabel ?? 'Close'} onClick={onClose} className="mt-1 bg-sunken">
          <X className="size-[18px]" />
        </IconButton>
      )}
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────────────────────

export function OverviewPanel({
  attention,
  health,
  summaries,
  daylight,
  highlightedId,
  onRowTap,
  onZone,
  onDaylight,
  onHealth,
}: {
  attention: RankedTask[];
  health: HouseHealth;
  summaries: Record<ZoneId, ZoneSummary>;
  daylight: Daylight;
  highlightedId: string | null;
  onRowTap: (task: Task) => void;
  onZone: (zone: ZoneId) => void;
  onDaylight: () => void;
  onHealth: () => void;
}) {
  const { tasks, today, partner, zoneLabel, me } = useAppData();
  const openTask = useOpenTask();
  const open = tasks.filter((t) => !t.completedAt);
  const maintenance = open.filter((t) => t.kind === 'maintenance');
  const nextMaintenance = [...maintenance]
    .filter((t) => t.dueDate)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))[0];
  const todos = open.filter((t) => t.kind === 'todo');
  const fromPartner = partner ? todos.filter((t) => t.assigneeId === me.id && t.assignedById === partner.id).length : 0;
  const urgent = attention.filter((r) => r.timing.state === 'overdue' || r.timing.state === 'today').length;
  const next = daylight.next;
  const phase = PHASE_LABEL[daylight.phase][daylight.morning ? 'morning' : 'evening'];

  return (
    <div className="px-2 pb-4">
      <section aria-labelledby="attention-title" className="mt-1">
        <div className="flex items-end justify-between px-3 pt-2 pb-1">
          <div>
            <h2 id="attention-title" className="font-display text-[19px] font-semibold tracking-[-0.015em] text-ink">
              Needs attention
            </h2>
            <p className="text-[13px] text-ink-3">
              {attention.length === 0
                ? 'Nothing urgent around the house'
                : `${health.overdue ? `${health.overdue} overdue · ` : ''}${attention.length} in the next few days`}
            </p>
          </div>
          <Link to="/focus" className="flex items-center gap-1 pb-0.5 text-[13px] font-medium text-accent-ink">
            Focus <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="space-y-0.5">
          <AnimatePresence initial={false}>
            {attention.slice(0, 5).map(({ task }) => (
              <TaskRow key={task.id} task={task} onOpen={onRowTap} selected={highlightedId === task.id}>
                {highlightedId === task.id && (
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
          <EmptyState icon={<Sparkles className="size-5" />} title="Your house is in great shape" body="Tap a room to see what's coming up there." />
        )}
      </section>

      <nav aria-label="Sections" className="mt-4 border-t border-line pt-2">
        <NavRow
          icon={Target}
          title="Focus"
          subtitle={attention[0] ? `Up next: ${attention[0].task.title}` : 'Nothing pressing right now'}
          to="/focus"
          badge={urgent}
        />
        <NavRow
          icon={Wrench}
          title="Maintenance"
          subtitle={
            nextMaintenance?.dueDate
              ? `${maintenance.length} in the plan · next ${formatShortDate(nextMaintenance.dueDate, today)}`
              : `${maintenance.length} in the plan`
          }
          to="/tasks?list=maintenance"
        />
        <NavRow
          icon={ListChecks}
          title="To-dos"
          subtitle={`${todos.length} open${fromPartner ? ` · ${fromPartner} from ${partner?.name}` : ''}`}
          to="/tasks?list=household"
        />
        <NavRow icon={Activity} title="House health" subtitle={`${health.score} · ${health.label}`} onClick={onHealth} />
        <NavRow
          icon={daylight.isNight ? Moon : SunMedium}
          title="Daylight"
          subtitle={`${phase}${next ? ` · ${next.kind === 'sunset' ? 'Sunset' : 'Sunrise'} ${formatClock(next.at, daylight.timeZone)}` : ''} · ${moonPhaseName(daylight.illumination.phase)}`}
          onClick={onDaylight}
        />
        <NavRow icon={Settings} title="Settings" subtitle="Reminders, household, appearance" to="/settings" />
      </nav>

      <section aria-label="Rooms" className="mt-3 border-t border-line px-3 pt-4">
        <p className="eyebrow text-ink-3">Rooms</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.values(summaries)
            .filter((s) => s.open > 0)
            .sort((a, b) => HEALTH_RANK[b.health] - HEALTH_RANK[a.health])
            .map((s) => (
              <button
                key={s.zoneId}
                type="button"
                onClick={() => onZone(s.zoneId)}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-sunken px-3.5 text-[13px] font-medium text-ink-2 transition hover:text-ink active:scale-[0.97]"
              >
                <span className={cx('size-2 rounded-full', s.health === 'ok' ? 'bg-ok/60' : HEALTH_DOT[s.health])} />
                {zoneLabel(s.zoneId)}
                <span className="text-ink-3 tabular">{s.open}</span>
              </button>
            ))}
        </div>
      </section>
    </div>
  );
}

// ── A floor ───────────────────────────────────────────────────────────────────────────────────

export function LevelPanel({
  level,
  summaries,
  onZone,
}: {
  level: 'upper' | 'ground' | 'basement';
  summaries: Record<ZoneId, ZoneSummary>;
  onZone: (zone: ZoneId) => void;
}) {
  const { zoneLabel } = useAppData();
  return (
    <div className="px-2 pb-4">
      {ROOMS[level].map((room) => {
        const summary = summaries[room.zone];
        const health = summary?.health ?? 'empty';
        return (
          <button
            key={room.zone}
            type="button"
            onClick={() => onZone(room.zone)}
            className="flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-surface-2 active:bg-sunken"
          >
            <span className={cx('size-2.5 shrink-0 rounded-full', health === 'empty' ? 'bg-line-strong' : HEALTH_DOT[health])} />
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] leading-tight font-medium text-ink">{zoneLabel(room.zone)}</span>
              <span className="mt-0.5 block truncate text-[13px] text-ink-3">{zoneStatus(summary, zoneDef(room.zone).blurb)}</span>
            </span>
            <ChevronRight className="size-[18px] shrink-0 text-ink-3/70" strokeWidth={1.8} />
          </button>
        );
      })}
    </div>
  );
}

export function levelName(level: string): string {
  return LEVELS.find((l) => l.id === level)?.name ?? level;
}

// ── A room ────────────────────────────────────────────────────────────────────────────────────

export function RoomPanel({
  zone,
  tasks,
  highlightedId,
  onRowTap,
}: {
  zone: ZoneId;
  tasks: Task[];
  highlightedId: string | null;
  onRowTap: (task: Task) => void;
}) {
  const { zoneLabel } = useAppData();
  const { openComposer } = useUi();
  const openTask = useOpenTask();
  return (
    <div className="px-2 pb-4">
      <div className="space-y-0.5">
        <AnimatePresence initial={false}>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onOpen={onRowTap} showZone={false} selected={highlightedId === task.id}>
              {highlightedId === task.id && (
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
      {tasks.length === 0 && (
        <EmptyState title={`Nothing scheduled in the ${zoneLabel(zone).toLowerCase()}`} body="Add something you want to remember for this spot." />
      )}
      <div className="mt-3 px-2">
        <Button variant="secondary" size="lg" block icon={<Plus className="size-4" />} onClick={() => openComposer({ mode: 'create', defaults: { zoneId: zone, kind: 'maintenance' } })}>
          Add to {zoneLabel(zone)}
        </Button>
      </div>
    </div>
  );
}
