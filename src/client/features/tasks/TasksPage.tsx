import { MONTH_LONG, parseYmd } from '@shared/dates';
import { QUICK_WIN_IDEAS } from '@shared/seed';
import { taskTiming } from '@shared/status';
import type { Task } from '@shared/types';
import { LEVELS, zonesOnLevel } from '@shared/zones';
import { ChevronDown, ClipboardList, Plus, Search, Sparkles, Zap } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAppData, useUi } from '../../app/context';
import { useToast } from '../../components/Toast';
import { Avatar, Button, Chip, cx, EmptyState, Segmented, SectionTitle } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useCreateTask } from '../../lib/queries';
import { useOpenTask } from './actions';
import { TaskRow } from './TaskRow';

type ListKey = 'mine' | 'household' | 'maintenance';

function byUrgency(today: string) {
  return (a: Task, b: Task) => {
    const ta = taskTiming(a, today);
    const tb = taskTiming(b, today);
    const da = ta.effectiveDue ?? '9999-12-31';
    const db = tb.effectiveDue ?? '9999-12-31';
    return da.localeCompare(db) || a.title.localeCompare(b.title);
  };
}

function Group({ title, tasks, onOpen, count }: { title: string; tasks: Task[]; onOpen: (t: Task) => void; count?: boolean }) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <SectionTitle count={count ? tasks.length : undefined}>{title}</SectionTitle>
      <div className="space-y-0.5 rounded-3xl border border-line/70 bg-surface p-1.5 shadow-card">
        <AnimatePresence initial={false}>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onOpen={onOpen} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function QuickIdeas() {
  const create = useCreateTask();
  const toast = useToast();
  const { me } = useAppData();
  return (
    <div className="rounded-3xl border border-dashed border-line-strong p-4">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
        <Zap className="size-4 text-quick" /> Quick calls people forget
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_WIN_IDEAS.map((idea) => (
          <Chip
            key={idea.title}
            icon={<Plus className="size-3.5" />}
            onClick={() =>
              create.mutate(
                {
                  title: idea.title,
                  quickWin: true,
                  estimateMinutes: idea.estimateMinutes,
                  visibility: idea.visibility,
                  zoneId: idea.zoneId,
                  assigneeId: idea.visibility === 'personal' ? me.id : null,
                },
                {
                  onSuccess: () => toast(`Added “${idea.title}”`, { tone: 'success' }),
                  onError: (e) => toast(errorMessage(e), { tone: 'error' }),
                },
              )
            }
          >
            {idea.title}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function TasksPage() {
  const { tasks, today, me, partner, zoneLabel } = useAppData();
  const { openComposer, setExpertOpen } = useUi();
  const openTask = useOpenTask();
  const [params, setParams] = useSearchParams();
  const list = (params.get('list') as ListKey) || 'mine';
  const [query, setQuery] = useState('');
  const [who, setWho] = useState<'all' | 'me' | 'partner' | 'none'>('all');
  const [view, setView] = useState<'date' | 'room'>('date');
  const [showDone, setShowDone] = useState(false);

  const setList = (next: ListKey) => {
    const p = new URLSearchParams(params);
    p.set('list', next);
    setParams(p, { replace: true });
  };

  const q = query.trim().toLowerCase();
  const matches = (t: Task) => !q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q);
  const sort = useMemo(() => byUrgency(today), [today]);

  const scoped = useMemo(() => {
    const inList = (t: Task) => {
      if (list === 'maintenance') return t.kind === 'maintenance';
      if (list === 'mine')
        return t.assigneeId === me.id || (t.visibility === 'personal' && t.ownerId === me.id && !t.assigneeId);
      if (t.kind !== 'todo' || t.visibility !== 'shared') return false;
      if (who === 'me') return t.assigneeId === me.id;
      if (who === 'partner') return t.assigneeId === partner?.id;
      if (who === 'none') return !t.assigneeId;
      return true;
    };
    return tasks.filter((t) => inList(t) && matches(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, list, who, me.id, partner?.id, q]);

  const open = scoped.filter((t) => !t.completedAt).sort(sort);
  const recentlyDone = scoped
    .filter((t) => t.completedAt && Date.now() - Date.parse(t.completedAt) < 14 * 86_400_000)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  const sections = useMemo(() => {
    if (list === 'maintenance' && view === 'room') {
      return LEVELS.flatMap((level) => zonesOnLevel(level.id)).map((zone) => ({
        title: zoneLabel(zone.id),
        tasks: open.filter((t) => t.zoneId === zone.id),
      }));
    }
    if (list === 'maintenance') {
      const groups = new Map<string, Task[]>();
      for (const task of open) {
        const timing = taskTiming(task, today);
        let key: string;
        if (timing.state === 'overdue') key = 'Overdue';
        else if (!timing.effectiveDue) key = 'Unscheduled';
        else if (timing.days !== null && timing.days <= 7) key = 'This week';
        else {
          const { y, m } = parseYmd(timing.effectiveDue);
          key = `${MONTH_LONG[m - 1]}${y !== parseYmd(today).y ? ` ${y}` : ''}`;
        }
        groups.set(key, [...(groups.get(key) ?? []), task]);
      }
      return [...groups.entries()].map(([title, items]) => ({ title, tasks: items }));
    }
    const overdue = open.filter((t) => taskTiming(t, today).state === 'overdue');
    const dated = open.filter((t) => {
      const s = taskTiming(t, today).state;
      return s === 'today' || s === 'soon' || s === 'upcoming';
    });
    const someday = open.filter((t) => taskTiming(t, today).state === 'unscheduled');
    return [
      { title: 'Overdue', tasks: overdue },
      { title: 'Coming up', tasks: dated },
      { title: 'Someday', tasks: someday },
    ];
  }, [list, view, open, today, zoneLabel]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-[max(env(safe-area-inset-top),20px)] pb-10 lg:px-8 lg:pt-10">
      <header className="flex items-end justify-between gap-3 px-1">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-tight text-ink">Tasks</h1>
          <p className="text-[14px] text-ink-3">
            {open.length} open{list === 'maintenance' ? ' maintenance items' : ''}
          </p>
        </div>
        {list === 'maintenance' && (
          <Button variant="soft" size="sm" icon={<Sparkles className="size-4" />} onClick={() => setExpertOpen(true)}>
            Expert plan
          </Button>
        )}
      </header>

      <Segmented
        className="mt-4"
        value={list}
        onChange={setList}
        options={[
          { value: 'mine', label: 'Mine' },
          { value: 'household', label: 'Household' },
          { value: 'maintenance', label: 'Maintenance' },
        ]}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-3.5">
          <Search className="size-4 shrink-0 text-ink-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
            aria-label="Search tasks"
          />
        </label>
        {list === 'household' && partner && (
          <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
            <Chip selected={who === 'all'} onClick={() => setWho('all')}>
              All
            </Chip>
            <Chip selected={who === 'me'} onClick={() => setWho('me')} icon={<Avatar member={me} size={18} decorative />}>
              Me
            </Chip>
            <Chip selected={who === 'partner'} onClick={() => setWho('partner')} icon={<Avatar member={partner} size={18} decorative />}>
              {partner.name}
            </Chip>
            <Chip selected={who === 'none'} onClick={() => setWho('none')}>
              Anyone
            </Chip>
          </div>
        )}
        {list === 'maintenance' && (
          <Segmented
            className="w-44"
            value={view}
            onChange={setView}
            options={[
              { value: 'date', label: 'By date' },
              { value: 'room', label: 'By room' },
            ]}
          />
        )}
      </div>

      {sections.map((section) => (
        <Group key={section.title} title={section.title} tasks={section.tasks} onOpen={openTask} count />
      ))}

      {open.length === 0 && (
        <div className="mt-6 space-y-4">
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title={q ? 'No matches' : list === 'mine' ? 'Nothing on your plate' : list === 'household' ? 'No shared to-dos' : 'No maintenance yet'}
            body={
              q
                ? 'Try another word.'
                : list === 'maintenance'
                  ? 'Add items from the expert plan for your house.'
                  : 'Add something, or start with a quick win below.'
            }
            action={
              list === 'maintenance' ? (
                <Button icon={<Sparkles className="size-4" />} onClick={() => setExpertOpen(true)}>
                  Open the expert plan
                </Button>
              ) : (
                <Button
                  icon={<Plus className="size-4" />}
                  onClick={() =>
                    openComposer({
                      mode: 'create',
                      defaults: list === 'mine' ? { visibility: 'personal', assigneeId: me.id } : { visibility: 'shared' },
                    })
                  }
                >
                  New task
                </Button>
              )
            }
          />
        </div>
      )}
      {list !== 'maintenance' && !q && open.length < 4 && (
        <div className="mt-6">
          <QuickIdeas />
        </div>
      )}

      {recentlyDone.length > 0 && list !== 'maintenance' && (
        <div className="mt-6">
          <button
            onClick={() => setShowDone((v) => !v)}
            className="flex items-center gap-1 px-1 text-[13px] font-semibold text-ink-3"
          >
            <ChevronDown className={cx('size-4 transition-transform', showDone && 'rotate-180')} />
            Completed recently ({recentlyDone.length})
          </button>
          {showDone && (
            <div className="mt-2 space-y-0.5 rounded-3xl border border-line/70 bg-surface p-1.5 opacity-80">
              {recentlyDone.map((task) => (
                <TaskRow key={task.id} task={task} onOpen={openTask} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
