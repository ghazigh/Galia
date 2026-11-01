import { dueLabel, formatMinutes } from '@shared/format';
import { effectiveEstimate } from '@shared/priority';
import { describeRecurrence } from '@shared/recurrence';
import { taskTiming } from '@shared/status';
import type { Task } from '@shared/types';
import { Flame, Lock, Phone, Repeat, Trash2, Zap } from 'lucide-react';
import { animate, motion, useMotionValue, useTransform, type PanInfo } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useAppData } from '../../app/context';
import { CheckCircle } from '../../components/CheckCircle';
import { Avatar, cx } from '../../components/ui';
import { contactHref } from '@shared/format';
import { DUE_TONE } from '../../lib/labels';
import { useCompleteWithUndo, useDeleteWithUndo } from './actions';

/** Width of the Delete button revealed by swiping a row to the left. */
const DELETE_WIDTH = 88;
// Only one row stays swiped open at a time.
const ROW_OPENED = 'task-row-opened';

/** Swipe left to reveal Delete; tapping elsewhere or swiping back closes it. */
function useSwipeToReveal(id: string) {
  const x = useMotionValue(0);
  const dragged = useRef(false);
  const isOpen = () => x.get() < -DELETE_WIDTH / 2;
  const settle = (open: boolean) => {
    animate(x, open ? -DELETE_WIDTH : 0, { type: 'spring', stiffness: 520, damping: 42 });
    if (open) window.dispatchEvent(new CustomEvent(ROW_OPENED, { detail: id }));
  };

  useEffect(() => {
    const onOpened = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id && x.get() !== 0) settle(false);
    };
    window.addEventListener(ROW_OPENED, onOpened);
    return () => window.removeEventListener(ROW_OPENED, onOpened);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return {
    x,
    dragProps: {
      drag: 'x' as const,
      dragDirectionLock: true,
      dragConstraints: { left: -DELETE_WIDTH, right: 0 },
      dragElastic: { left: 0.15, right: 0 },
      dragMomentum: false,
      onDragStart: () => {
        dragged.current = true;
      },
      onDragEnd: (_: unknown, info: PanInfo) => {
        settle(info.velocity.x < -300 || (info.velocity.x <= 300 && isOpen()));
        // The click that ends a drag must not open the task.
        window.setTimeout(() => (dragged.current = false), 0);
      },
    },
    /** True when a tap should only close the open row (or was really the end of a drag). */
    consumeTap: () => {
      if (dragged.current) return true;
      if (x.get() !== 0) {
        settle(false);
        return true;
      }
      return false;
    },
  };
}

export interface TaskRowProps {
  task: Task;
  onOpen: (task: Task) => void;
  showZone?: boolean;
  selected?: boolean;
  /** Extra content under the row (e.g. inline actions when highlighted). */
  children?: ReactNode;
  reasons?: string[];
}

export function TaskRow({ task, onOpen, showZone = true, selected, children, reasons }: TaskRowProps) {
  const { today, zoneLabel, memberById, me } = useAppData();
  const complete = useCompleteWithUndo();
  const remove = useDeleteWithUndo();
  const swipe = useSwipeToReveal(task.id);
  const deleteOpacity = useTransform(swipe.x, [-DELETE_WIDTH * 0.6, -8, 0], [1, 0, 0]);
  const timing = taskTiming(task, today);
  const assignee = memberById(task.assigneeId);
  const estimate = effectiveEstimate(task);
  const fire = task.risks.includes('fire');
  const call = task.quickWin ? contactHref(task.contact) : null;
  const done = Boolean(task.completedAt);

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
      className={cx(
        'group overflow-hidden rounded-2xl transition-colors',
        selected ? 'bg-accent-soft/70 ring-1 ring-accent/25' : 'hover:bg-surface-2',
      )}
      data-task-id={task.id}
    >
      <div className="relative">
        <motion.button
          type="button"
          tabIndex={-1}
          aria-hidden
          style={{ opacity: deleteOpacity, width: DELETE_WIDTH }}
          onClick={() => remove(task)}
          className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-overdue text-[12px] font-semibold text-white"
        >
          <Trash2 className="size-5" />
          Delete
        </motion.button>
        <motion.div
          role="button"
          tabIndex={0}
          {...swipe.dragProps}
          style={{ x: swipe.x, touchAction: 'pan-y' }}
          onClick={() => {
            if (!swipe.consumeTap()) onOpen(task);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onOpen(task);
          }}
          className={cx(
            'relative flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 outline-none',
            // Opaque while swiped so the Delete button only shows in the gap it opens.
            selected ? 'bg-[color-mix(in_srgb,var(--color-accent-soft)_70%,var(--color-surface))]' : 'bg-surface group-hover:bg-surface-2',
          )}
        >
          <CheckCircle
            checked={done}
            onToggle={() => !done && complete(task)}
            tone={timing.state === 'overdue' ? (fire ? 'fire' : 'overdue') : 'default'}
            label={`Mark “${task.title}” as done`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <p className={cx('min-w-0 flex-1 text-[15px] leading-snug font-medium text-ink', done && 'text-ink-3 line-through')}>
                {task.title}
              </p>
              <span className={cx('pt-0.5 text-[12.5px] font-semibold whitespace-nowrap tabular', DUE_TONE[timing.state])}>
                {dueLabel(timing, today)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
              {fire && (
                <span className="inline-flex items-center gap-0.5 font-semibold text-fire">
                  <Flame className="size-3.5" />
                  Fire safety
                </span>
              )}
              {showZone && task.zoneId && <span>{zoneLabel(task.zoneId)}</span>}
              {task.recurrence && (
                <span className="inline-flex items-center gap-1">
                  <Repeat className="size-3" />
                  {describeRecurrence(task.recurrence)}
                </span>
              )}
              {task.quickWin && (
                <span className="inline-flex items-center gap-0.5 font-semibold text-quick">
                  <Zap className="size-3.5" />
                  {estimate ? formatMinutes(estimate) : 'Quick'}
                </span>
              )}
              {!task.quickWin && estimate && <span>{formatMinutes(estimate)}</span>}
              {task.visibility === 'personal' && (
                <span className="inline-flex items-center gap-0.5">
                  <Lock className="size-3" />
                  Private
                </span>
              )}
              {reasons?.map((reason) => (
                <span key={reason} className="rounded-full bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">
                  {reason}
                </span>
              ))}
              {assignee && (
                <span className="ml-auto inline-flex items-center gap-1">
                  {task.assignedById && task.assignedById !== me.id && task.assigneeId === me.id && (
                    <span className="text-[11px]">from {memberById(task.assignedById)?.name}</span>
                  )}
                  <Avatar member={assignee} size={20} />
                </span>
              )}
            </div>
          </div>
          {call && (
            <a
              href={call}
              onClick={(event) => event.stopPropagation()}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-quick-soft text-quick transition active:scale-95"
              aria-label={`Call for “${task.title}”`}
            >
              <Phone className="size-4" />
            </a>
          )}
        </motion.div>
      </div>
      {children}
    </motion.div>
  );
}
