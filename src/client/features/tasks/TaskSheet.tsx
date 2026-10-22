import { contactHref, dueSentence, formatDayDate, formatMinutes, formatShortDate } from '@shared/format';
import { describeRecurrence } from '@shared/recurrence';
import { taskTiming } from '@shared/status';
import type { Task } from '@shared/types';
import { fixtureDef } from '@shared/zones';
import {
  AlarmClockOff,
  CalendarClock,
  Check,
  Clock3,
  Flame,
  HardHat,
  Lightbulb,
  ListChecks,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Repeat,
  ShieldAlert,
  Trash2,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAppData, useUi } from '../../app/context';
import { Menu } from '../../components/Menu';
import { Sheet } from '../../components/Sheet';
import { Avatar, Badge, Button, cx, IconButton } from '../../components/ui';
import { HouseView } from '../../house/HouseView';
import { DUE_BADGE, PRIORITY_LABEL, RISK_BADGE, RISK_LABEL } from '../../lib/labels';
import { useTaskHistory } from '../../lib/queries';
import { useDarkMode } from '../../lib/theme';
import { snoozeOptions, useCompleteWithUndo, useDeleteWithUndo, useSnoozeWithToast } from './actions';

function MetaRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-sunken text-ink-2">{icon}</span>
      <span className="w-24 shrink-0 text-[13px] text-ink-3">{label}</span>
      <span className="min-w-0 flex-1 text-[14px] font-medium text-ink">{children}</span>
    </div>
  );
}

function GuideSection({ task }: { task: Task }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const guide = task.guide;
  if (!guide) return null;
  return (
    <div className="mt-5 space-y-4">
      {guide.why && (
        <div className="rounded-2xl bg-accent-soft/60 p-4">
          <p className="mb-1 flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-accent uppercase">
            <Lightbulb className="size-3.5" /> Why it matters
          </p>
          <p className="text-[14px] leading-relaxed text-ink">{guide.why}</p>
        </div>
      )}
      {guide.steps.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-ink-3 uppercase">
            <ListChecks className="size-3.5" /> How to do it
          </p>
          <ol className="space-y-1">
            {guide.steps.map((step, i) => {
              const isChecked = checked.has(i);
              return (
                <li key={i}>
                  <button
                    className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-sunken"
                    onClick={() =>
                      setChecked((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  >
                    <span
                      className={cx(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold transition',
                        isChecked ? 'border-ok bg-ok text-white' : 'border-line-strong text-ink-3',
                      )}
                    >
                      {isChecked ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    <span className={cx('text-[14px] leading-relaxed', isChecked ? 'text-ink-3 line-through' : 'text-ink')}>
                      {step}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {guide.supplies && guide.supplies.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-ink-3 uppercase">
            <Wrench className="size-3.5" /> You'll need
          </p>
          <div className="flex flex-wrap gap-1.5">
            {guide.supplies.map((item) => (
              <span key={item} className="rounded-full border border-line px-2.5 py-1 text-[13px] text-ink-2">
                {item}
              </span>
            ))}
          </div>
        </div>
      )}
      {guide.safety && (
        <div className="flex gap-3 rounded-2xl bg-overdue-soft p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-overdue" />
          <p className="text-[14px] leading-relaxed text-ink">{guide.safety}</p>
        </div>
      )}
    </div>
  );
}

function History({ task }: { task: Task }) {
  const { data } = useTaskHistory(task.id);
  const { memberById, today } = useAppData();
  if (!data || data.length === 0) return null;
  return (
    <div className="mt-6">
      <p className="mb-2 text-[12px] font-bold tracking-wide text-ink-3 uppercase">History</p>
      <ul className="relative space-y-3 border-l border-line pl-4">
        {data.slice(0, 8).map((entry) => {
          const who = memberById(entry.userId);
          return (
            <li key={entry.id} className="relative">
              <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-ok" />
              <p className="text-[13.5px] text-ink">
                <span className="font-semibold">{who?.name ?? 'Someone'}</span> did it on {formatDayDate(entry.completedOn, today)}
              </p>
              {entry.note && <p className="text-[13px] text-ink-3">“{entry.note}”</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TaskSheet() {
  const [params, setParams] = useSearchParams();
  const id = params.get('task');
  const { tasks, today, zoneLabel, memberById, bootstrap } = useAppData();
  const { openComposer } = useUi();
  const dark = useDarkMode();
  const navigate = useNavigate();
  const complete = useCompleteWithUndo();
  const remove = useDeleteWithUndo();
  const snooze = useSnoozeWithToast();
  const task = useMemo(() => tasks.find((t) => t.id === id) ?? null, [tasks, id]);
  const [lastTask, setLastTask] = useState<Task | null>(null);
  if (task && task !== lastTask) setLastTask(task);
  const shown = task ?? lastTask;

  const close = () => {
    const next = new URLSearchParams(params);
    next.delete('task');
    setParams(next, { replace: true });
  };

  const timing = shown ? taskTiming(shown, today) : null;
  const assignee = shown ? memberById(shown.assigneeId) : undefined;
  const assigner = shown ? memberById(shown.assignedById) : undefined;
  const call = shown ? contactHref(shown.contact) : null;
  const done = Boolean(shown?.completedAt);

  return (
    <Sheet
      open={Boolean(id && task)}
      onClose={close}
      label={shown?.title ?? 'Task'}
      tall
      title={
        <span className="flex items-center gap-2 text-[15px] font-semibold text-ink-3">
          {shown?.kind === 'maintenance' ? 'Maintenance' : shown?.visibility === 'personal' ? 'Personal to-do' : 'Household to-do'}
        </span>
      }
      headerAction={
        shown && (
          <Menu
            align="right"
            trigger={(props) => (
              <IconButton label="More" {...props}>
                <MoreHorizontal className="size-5" />
              </IconButton>
            )}
            items={[
              {
                label: 'Edit',
                icon: <Pencil className="size-4" />,
                onSelect: () => openComposer({ mode: 'edit', task: shown }),
              },
              ...(shown.zoneId
                ? [
                    {
                      label: 'Show in house',
                      icon: <MapPin className="size-4" />,
                      onSelect: () => navigate(`/?zone=${shown.zoneId}&highlight=${shown.id}`),
                    },
                  ]
                : []),
              {
                label: 'Delete',
                icon: <Trash2 className="size-4" />,
                danger: true,
                onSelect: () => {
                  close();
                  remove(shown);
                },
              },
            ]}
          />
        )
      }
      footer={
        shown && (
          <div className="flex gap-2">
            {!done && (
              <Menu
                side="top"
                trigger={(props) => (
                  <Button variant="secondary" size="lg" icon={<AlarmClockOff className="size-4" />} {...props}>
                    Snooze
                  </Button>
                )}
                items={snoozeOptions(today).map((option) => ({
                  label: option.label,
                  hint: formatShortDate(option.until, today),
                  onSelect: () => snooze(shown, option.until),
                }))}
              />
            )}
            <Button
              size="lg"
              block
              icon={<Check className="size-5" />}
              disabled={done}
              onClick={() => {
                complete(shown);
                if (!shown.recurrence) close();
              }}
            >
              {done ? 'Completed' : shown.recurrence ? 'Mark done' : 'Done'}
            </Button>
          </div>
        )
      }
    >
      {shown && timing && (
        <div className="pb-4">
          {shown.zoneId && (
            <div className="-mx-1 mb-4 h-44 overflow-hidden rounded-3xl bg-canvas">
              <HouseView
                className="h-full w-full"
                summaries={{}}
                selectedZone={shown.zoneId === 'house' ? null : shown.zoneId}
                highlightFixture={shown.fixtureId}
                dark={dark}
                pins={false}
                zoneLabel={zoneLabel}
              />
            </div>
          )}
          <h2 className="font-display text-[24px] leading-tight font-semibold tracking-tight text-ink">{shown.title}</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge className={DUE_BADGE[timing.state]} icon={<Clock3 className="size-3.5" />}>
              {dueSentence(timing, today)}
            </Badge>
            {shown.risks.map((risk) => (
              <Badge key={risk} className={RISK_BADGE[risk]} icon={risk === 'fire' ? <Flame className="size-3.5" /> : undefined}>
                {RISK_LABEL[risk]}
              </Badge>
            ))}
            {(shown.priority === 'critical' || shown.priority === 'high') && (
              <Badge className="bg-sunken text-ink-2">{PRIORITY_LABEL[shown.priority]} priority</Badge>
            )}
            {shown.guide?.pro && (
              <Badge className="bg-sunken text-ink-2" icon={<HardHat className="size-3.5" />}>
                Pro job
              </Badge>
            )}
          </div>

          <div className="mt-4 divide-y divide-line/70 rounded-2xl border border-line/70 px-3">
            {shown.zoneId && (
              <MetaRow icon={<MapPin className="size-4" />} label="Where">
                {zoneLabel(shown.zoneId)}
                {shown.fixtureId && <span className="text-ink-3"> · {fixtureDef(shown.fixtureId).name}</span>}
              </MetaRow>
            )}
            <MetaRow icon={<Repeat className="size-4" />} label="Repeats">
              {describeRecurrence(shown.recurrence)}
            </MetaRow>
            {shown.lastCompletedAt && (
              <MetaRow icon={<CalendarClock className="size-4" />} label="Last done">
                {formatShortDate(shown.lastCompletedAt.slice(0, 10), today)}
                {shown.lastCompletedById && (
                  <span className="text-ink-3"> by {memberById(shown.lastCompletedById)?.name ?? 'someone'}</span>
                )}
              </MetaRow>
            )}
            <MetaRow icon={<UserRound className="size-4" />} label="Who">
              {assignee ? (
                <span className="inline-flex items-center gap-2">
                  <Avatar member={assignee} size={22} />
                  {assignee.id === bootstrap.me.id ? 'You' : assignee.name}
                  {assigner && assigner.id !== assignee.id && (
                    <span className="text-ink-3">· from {assigner.id === bootstrap.me.id ? 'you' : assigner.name}</span>
                  )}
                </span>
              ) : (
                <span className="text-ink-3">Anyone</span>
              )}
            </MetaRow>
            {shown.estimateMinutes && (
              <MetaRow icon={<Clock3 className="size-4" />} label="Takes">
                About {formatMinutes(shown.estimateMinutes)}
                {shown.quickWin && <span className="text-quick"> · quick win</span>}
              </MetaRow>
            )}
            {shown.contact && (
              <MetaRow icon={<Phone className="size-4" />} label="Contact">
                {call ? (
                  <a href={call} className="font-semibold text-accent">
                    {shown.contact}
                  </a>
                ) : (
                  shown.contact
                )}
              </MetaRow>
            )}
          </div>

          {shown.notes && (
            <p className="mt-4 rounded-2xl bg-surface-2 p-4 text-[14px] leading-relaxed whitespace-pre-wrap text-ink-2">
              {shown.notes}
            </p>
          )}

          <GuideSection task={shown} />
          <History task={shown} />
        </div>
      )}
    </Sheet>
  );
}
