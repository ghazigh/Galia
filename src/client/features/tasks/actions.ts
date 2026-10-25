import { addDays, weekday, type Ymd } from '@shared/dates';
import { formatShortDate } from '@shared/format';
import { nextDueAfterCompletion } from '@shared/recurrence';
import type { Task } from '@shared/types';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useAppData } from '../../app/context';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { useCompleteTask, useDeleteTask, useRestoreTask, useSnoozeTask, useUndoComplete } from '../../lib/queries';

/** Completes a task optimistically and offers Undo in a toast. */
export function useCompleteWithUndo() {
  const complete = useCompleteTask();
  const undo = useUndoComplete();
  const toast = useToast();
  const { today, me } = useAppData();
  return useCallback(
    (task: Task) => {
      const pending = complete.mutateAsync({ task, today, userId: me.id });
      pending.catch((error) => toast(errorMessage(error), { tone: 'error' }));
      // Same pure function the server uses, so the toast can name the next date right away.
      const next = task.recurrence ? nextDueAfterCompletion(task.recurrence, today, task.dueDate) : null;
      toast(next ? `Done · next one ${formatShortDate(next, today)}` : `Done · “${task.title}”`, {
        tone: 'success',
        action: {
          label: 'Undo',
          onClick: () => {
            void pending.then(() => undo.mutate(task.id));
          },
        },
      });
    },
    [complete, undo, toast, today, me.id],
  );
}

export function useDeleteWithUndo() {
  const remove = useDeleteTask();
  const restore = useRestoreTask();
  const toast = useToast();
  return useCallback(
    (task: Task) => {
      remove.mutate(task.id, {
        onError: (error) => toast(errorMessage(error), { tone: 'error' }),
      });
      toast(`Deleted “${task.title}”`, { action: { label: 'Undo', onClick: () => restore.mutate(task.id) } });
    },
    [remove, restore, toast],
  );
}

export interface SnoozeOption {
  label: string;
  until: Ymd;
}

/** Snooze presets relative to today: tomorrow, the weekend, next week, next month. */
export function snoozeOptions(today: Ymd): SnoozeOption[] {
  const dow = weekday(today);
  const saturday = addDays(today, ((6 - dow + 7) % 7) || 7);
  const monday = addDays(today, ((8 - dow) % 7) || 7);
  return [
    { label: 'Tomorrow', until: addDays(today, 1) },
    { label: 'This weekend', until: saturday },
    { label: 'Next week', until: monday },
    { label: 'In 2 weeks', until: addDays(today, 14) },
    { label: 'Next month', until: addDays(today, 30) },
  ].filter((option, index, all) => all.findIndex((o) => o.until === option.until) === index);
}

export function useSnoozeWithToast() {
  const snooze = useSnoozeTask();
  const toast = useToast();
  const { today } = useAppData();
  return useCallback(
    (task: Task, until: Ymd) => {
      snooze.mutate(
        { id: task.id, until },
        {
          onSuccess: () => toast(`Snoozed until ${formatShortDate(until, today)}`),
          onError: (error) => toast(errorMessage(error), { tone: 'error' }),
        },
      );
    },
    [snooze, toast, today],
  );
}

/** Opens the task detail sheet (?task=…) over whatever page is showing. */
export function useOpenTask() {
  const [params, setParams] = useSearchParams();
  return useCallback(
    (task: Pick<Task, 'id'> | null) => {
      const next = new URLSearchParams(params);
      if (task) next.set('task', task.id);
      else next.delete('task');
      setParams(next, { replace: !task });
    },
    [params, setParams],
  );
}
