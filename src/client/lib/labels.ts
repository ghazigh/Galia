import type { DueState } from '@shared/status';
import type { Priority, Risk } from '@shared/types';

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

export const RISK_LABEL: Record<Risk, string> = {
  fire: 'Fire safety',
  water: 'Water damage',
  safety: 'Safety',
  air: 'Air quality',
  efficiency: 'Efficiency',
};

/** Tailwind classes for due-state text/badges. */
export const DUE_TONE: Record<DueState, string> = {
  overdue: 'text-overdue',
  today: 'text-today',
  soon: 'text-soon',
  upcoming: 'text-ink-3',
  unscheduled: 'text-ink-3',
  done: 'text-ok',
};

export const DUE_BADGE: Record<DueState, string> = {
  overdue: 'bg-overdue-soft text-overdue',
  today: 'bg-today-soft text-today',
  soon: 'bg-soon-soft text-soon',
  upcoming: 'bg-sunken text-ink-2',
  unscheduled: 'bg-sunken text-ink-2',
  done: 'bg-ok-soft text-ok',
};

export const RISK_BADGE: Record<Risk, string> = {
  fire: 'bg-fire-soft text-fire',
  water: 'bg-quick-soft text-quick',
  safety: 'bg-overdue-soft text-overdue',
  air: 'bg-ok-soft text-ok',
  efficiency: 'bg-soon-soft text-soon',
};
