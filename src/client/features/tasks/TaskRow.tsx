import { dueLabel, formatMinutes } from '@shared/format';
import { effectiveEstimate } from '@shared/priority';
import { describeRecurrence } from '@shared/recurrence';
import { taskTiming } from '@shared/status';
import type { Task } from '@shared/types';
import { Flame, Lock, Phone, Repeat, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useAppData } from '../../app/context';
import { CheckCircle } from '../../components/CheckCircle';
import { Avatar, cx } from '../../components/ui';
import { contactHref } from '@shared/format';
import { DUE_TONE } from '../../lib/labels';
import { useCompleteWithUndo } from './actions';

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
        'group rounded-2xl transition-colors',
        selected ? 'bg-accent-soft/70 ring-1 ring-accent/25' : 'hover:bg-surface-2',
      )}
      data-task-id={task.id}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(task)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onOpen(task);
        }}
        className="flex cursor-pointer items-start gap-3 px-3 py-3 outline-none"
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
      </div>
      {children}
    </motion.div>
  );
}
