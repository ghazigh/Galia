import type { Ymd } from './dates';
import { isMine, taskTiming, type TaskTiming } from './status';
import type { Priority, Task } from './types';

export type ReasonKind =
  | 'overdue'
  | 'today'
  | 'soon'
  | 'fire'
  | 'safety'
  | 'water'
  | 'priority'
  | 'assigned'
  | 'quick';

export interface Reason {
  kind: ReasonKind;
  label: string;
}

export interface RankedTask {
  task: Task;
  score: number;
  timing: TaskTiming;
  reasons: Reason[];
}

export interface RankContext {
  today: Ymd;
  userId: string;
  /** Resolves a member id to a display name (for "From Sam"). */
  memberName?: (id: string) => string | undefined;
}

const PRIORITY_WEIGHT: Record<Priority, number> = { critical: 60, high: 40, normal: 22, low: 8 };

/** Default effort assumed for quick wins without an explicit estimate. */
export const QUICK_WIN_DEFAULT_MINUTES = 10;

export function effectiveEstimate(task: Pick<Task, 'estimateMinutes' | 'quickWin'>): number | null {
  if (task.estimateMinutes !== null) return task.estimateMinutes;
  return task.quickWin ? QUICK_WIN_DEFAULT_MINUTES : null;
}

/** "I have N minutes" filter: only tasks known to fit. */
export function fitsIn(task: Pick<Task, 'estimateMinutes' | 'quickWin'>, minutes: number): boolean {
  const estimate = effectiveEstimate(task);
  return estimate !== null && estimate <= minutes;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function scoreTask(task: Task, ctx: RankContext): RankedTask {
  const timing = taskTiming(task, ctx.today);
  const reasons: Reason[] = [];
  let score = PRIORITY_WEIGHT[task.priority];

  switch (timing.state) {
    case 'overdue': {
      const late = -(timing.days ?? 0);
      score += 34 + Math.min(late, 30);
      reasons.push({ kind: 'overdue', label: `${plural(late, 'day')} overdue` });
      break;
    }
    case 'today':
      score += 28;
      reasons.push({ kind: 'today', label: 'Due today' });
      break;
    case 'soon': {
      const days = timing.days ?? 0;
      score += Math.max(4, 16 - days * 2);
      reasons.push({ kind: 'soon', label: days === 1 ? 'Due tomorrow' : `Due in ${days} days` });
      break;
    }
    case 'upcoming':
      if (timing.days !== null && timing.days <= 7) score += 6;
      break;
    case 'unscheduled':
      score += 4;
      break;
    case 'done':
      break;
  }

  if (task.risks.includes('fire')) {
    score += 16;
    reasons.push({ kind: 'fire', label: 'Fire safety' });
  } else if (task.risks.includes('safety')) {
    score += 10;
    reasons.push({ kind: 'safety', label: 'Safety' });
  } else if (task.risks.includes('water')) {
    score += 8;
    reasons.push({ kind: 'water', label: 'Prevents water damage' });
  }

  if (task.priority === 'critical' || task.priority === 'high') {
    reasons.push({ kind: 'priority', label: task.priority === 'critical' ? 'Critical' : 'High priority' });
  }

  if (task.assigneeId === ctx.userId && task.assignedById && task.assignedById !== ctx.userId) {
    score += 6;
    const from = ctx.memberName?.(task.assignedById);
    reasons.push({ kind: 'assigned', label: from ? `From ${from}` : 'Assigned to you' });
  }

  if (task.quickWin) {
    score += 3;
    const estimate = effectiveEstimate(task);
    reasons.push({ kind: 'quick', label: estimate ? `Quick win · ${estimate} min` : 'Quick win' });
  }

  return { task, score, timing, reasons };
}

/** Whether a task belongs in "what should I do now": actionable now or within the next week. */
export function isActionable(timing: TaskTiming, task: Task): boolean {
  if (timing.state === 'done') return false;
  if (timing.snoozed && timing.state !== 'overdue') return false;
  if (timing.state === 'upcoming') return task.kind === 'todo' && (timing.days ?? 99) <= 7;
  if (timing.state === 'unscheduled') return task.kind === 'todo';
  return true;
}

/** Ranks the user's actionable tasks, most important first. */
export function rankTasks(
  tasks: Task[],
  ctx: RankContext,
  options: { availableMinutes?: number | null; includeOthers?: boolean } = {},
): RankedTask[] {
  return tasks
    .filter((task) => options.includeOthers || isMine(task, ctx.userId))
    .map((task) => scoreTask(task, ctx))
    .filter(({ task, timing }) => isActionable(timing, task))
    .filter(({ task }) => !options.availableMinutes || fitsIn(task, options.availableMinutes))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.timing.days ?? 999) - (b.timing.days ?? 999) ||
        a.task.title.localeCompare(b.task.title),
    );
}
