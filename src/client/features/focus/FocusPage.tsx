import { contactHref, dueSentence, formatMinutes, formatShortDate } from '@shared/format';
import { effectiveEstimate, rankTasks, type RankedTask } from '@shared/priority';
import { Check, ChevronRight, Clock3, Coffee, Flame, Phone, PartyPopper, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAppData } from '../../app/context';
import { Menu } from '../../components/Menu';
import { Button, Chip, cx, EmptyState, SectionTitle } from '../../components/ui';
import { DUE_TONE } from '../../lib/labels';
import { snoozeOptions, useCompleteWithUndo, useOpenTask, useSnoozeWithToast } from '../tasks/actions';
import { TaskRow } from '../tasks/TaskRow';

const TIME_FILTERS: { label: string; minutes: number | null }[] = [
  { label: 'Any time', minutes: null },
  { label: '5 min', minutes: 5 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
];

function NextUp({ item }: { item: RankedTask }) {
  const { today, zoneLabel } = useAppData();
  const complete = useCompleteWithUndo();
  const snooze = useSnoozeWithToast();
  const openTask = useOpenTask();
  const { task, timing, reasons } = item;
  const call = contactHref(task.contact);
  const estimate = effectiveEstimate(task);
  return (
    <motion.div
      key={task.id}
      layout
      initial={{ opacity: 0, scale: 0.98, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="relative overflow-hidden rounded-[28px] border border-line/70 bg-surface p-5 shadow-card"
    >
      <div
        className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            timing.state === 'overdue' ? 'var(--color-overdue-soft)' : task.quickWin ? 'var(--color-quick-soft)' : 'var(--color-accent-soft)',
        }}
      />
      <div className="relative">
        <p className="text-[12px] font-bold tracking-[0.1em] text-ink-3 uppercase">Up next</p>
        <button onClick={() => openTask(task)} className="mt-1 block text-left">
          <h2 className="font-display text-[23px] leading-tight font-semibold tracking-tight text-ink">{task.title}</h2>
        </button>
        <p className={cx('mt-1 text-[13.5px] font-medium', DUE_TONE[timing.state])}>
          {dueSentence(timing, today)}
          {task.zoneId && <span className="text-ink-3"> · {zoneLabel(task.zoneId)}</span>}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {reasons
            .filter((r) => r.kind !== 'overdue' && r.kind !== 'today' && r.kind !== 'soon')
            .map((reason) => (
              <span
                key={reason.label}
                className={cx(
                  'inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11.5px] font-semibold',
                  reason.kind === 'fire'
                    ? 'bg-fire-soft text-fire'
                    : reason.kind === 'quick'
                      ? 'bg-quick-soft text-quick'
                      : 'bg-sunken text-ink-2',
                )}
              >
                {reason.kind === 'fire' && <Flame className="size-3.5" />}
                {reason.kind === 'quick' && <Zap className="size-3.5" />}
                {reason.label}
              </span>
            ))}
          {!task.quickWin && estimate && (
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-sunken px-2 text-[11.5px] font-semibold text-ink-2">
              <Clock3 className="size-3.5" />
              {formatMinutes(estimate)}
            </span>
          )}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {call && (
            <a
              href={call}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-quick px-5 text-[15px] font-semibold text-white shadow-[0_6px_18px_-8px_var(--color-quick)] active:scale-[0.97]"
            >
              <Phone className="size-4" /> Call
            </a>
          )}
          <Button size="lg" icon={<Check className="size-5" />} onClick={() => complete(task)} className="flex-1 sm:flex-none">
            Done
          </Button>
          <Menu
            trigger={(props) => (
              <Button size="lg" variant="secondary" {...props}>
                Later
              </Button>
            )}
            items={snoozeOptions(today).map((option) => ({
              label: option.label,
              hint: formatShortDate(option.until, today),
              onSelect: () => snooze(task, option.until),
            }))}
          />
          <Button size="lg" variant="ghost" onClick={() => openTask(task)} icon={<ChevronRight className="size-4" />}>
            How-to
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function QuickWinCard({ item }: { item: RankedTask }) {
  const complete = useCompleteWithUndo();
  const openTask = useOpenTask();
  const call = contactHref(item.task.contact);
  const estimate = effectiveEstimate(item.task);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex w-56 shrink-0 snap-start flex-col rounded-3xl border border-line/70 bg-surface p-4 shadow-card"
    >
      <button onClick={() => openTask(item.task)} className="flex-1 text-left">
        <span className="inline-flex items-center gap-1 text-[12px] font-bold text-quick">
          <Zap className="size-3.5" /> {estimate ? formatMinutes(estimate) : 'Quick'}
        </span>
        <p className="mt-1 line-clamp-2 text-[15px] leading-snug font-semibold text-ink">{item.task.title}</p>
      </button>
      <div className="mt-3 flex gap-2">
        {call && (
          <a
            href={call}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-quick-soft text-[13px] font-semibold text-quick"
          >
            <Phone className="size-3.5" /> Call
          </a>
        )}
        <Button size="sm" variant={call ? 'secondary' : 'soft'} className="flex-1" icon={<Check className="size-3.5" />} onClick={() => complete(item.task)}>
          Done
        </Button>
      </div>
    </motion.div>
  );
}

export function FocusPage() {
  const { tasks, today, me, memberById } = useAppData();
  const openTask = useOpenTask();
  const [params] = useSearchParams();
  const [minutes, setMinutes] = useState<number | null>(params.get('quick') ? 15 : null);

  const ranked = useMemo(
    () =>
      rankTasks(tasks, { today, userId: me.id, memberName: (id) => memberById(id)?.name }, { availableMinutes: minutes }),
    [tasks, today, me.id, memberById, minutes],
  );
  const [next, ...rest] = ranked;
  const quickWins = minutes === null ? rest.filter((r) => r.task.quickWin) : [];
  const listed = minutes === null ? rest.filter((r) => !r.task.quickWin) : rest;

  const groups = [
    { title: 'Overdue', items: listed.filter((r) => r.timing.state === 'overdue') },
    { title: 'Today', items: listed.filter((r) => r.timing.state === 'today') },
    { title: 'This week', items: listed.filter((r) => r.timing.state === 'soon' || r.timing.state === 'upcoming') },
    { title: 'Anytime', items: listed.filter((r) => r.timing.state === 'unscheduled') },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-[max(env(safe-area-inset-top),20px)] pb-10 lg:px-8 lg:pt-10">
      <header className="px-1">
        <h1 className="font-display text-[30px] font-semibold tracking-tight text-ink">Focus</h1>
        <p className="text-[14px] text-ink-3">The most important thing, always obvious.</p>
      </header>

      <div className="mt-4 flex items-center gap-2">
        <span className="shrink-0 pl-1 text-[13px] font-semibold text-ink-2">I have</span>
        <div className="scrollbar-none -mr-4 flex gap-2 overflow-x-auto pr-4">
          {TIME_FILTERS.map((filter) => (
            <Chip key={filter.label} selected={minutes === filter.minutes} onClick={() => setMinutes(filter.minutes)}>
              {filter.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <AnimatePresence mode="popLayout">
          {next ? (
            <NextUp key={next.task.id} item={next} />
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="rounded-[28px] border border-line/70 bg-surface shadow-card">
                <EmptyState
                  icon={minutes ? <Coffee className="size-5" /> : <PartyPopper className="size-5" />}
                  title={minutes ? `Nothing that fits in ${minutes} minutes` : 'All clear'}
                  body={minutes ? 'Try a longer window, or enjoy the break.' : 'Nothing needs you right now. Enjoy it.'}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {quickWins.length > 0 && (
        <>
          <SectionTitle count={quickWins.length}>Quick wins</SectionTitle>
          <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
            <AnimatePresence initial={false}>
              {quickWins.map((item) => (
                <QuickWinCard key={item.task.id} item={item} />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {groups.map((group) => (
        <div key={group.title}>
          <SectionTitle count={group.items.length}>{group.title}</SectionTitle>
          <div className="space-y-0.5 rounded-3xl border border-line/70 bg-surface p-1.5 shadow-card">
            <AnimatePresence initial={false}>
              {group.items.map(({ task, reasons }) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onOpen={openTask}
                  reasons={reasons.filter((r) => r.kind === 'assigned').map((r) => r.label)}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      ))}
    </div>
  );
}
