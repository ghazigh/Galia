import { planReminders } from '@shared/reminders';
import type { AppContext } from '../context';
import { listHouseholds } from '../repos/households';
import { listSubscriptions } from '../repos/push';
import { listHouseholdTasks } from '../repos/tasks';
import { listUsers } from '../repos/users';
import type { DispatchResult } from './notifications';

export interface ReminderRunResult {
  planned: number;
  queued: number;
  dispatch: DispatchResult;
}

/** Plans scheduled reminders for every household and delivers what is due. Safe to run often. */
export async function runReminders(ctx: AppContext): Promise<ReminderRunResult> {
  const now = ctx.now();
  let planned = 0;
  let queued = 0;
  for (const household of listHouseholds(ctx.db)) {
    const users = listUsers(ctx.db, household.id);
    const reachable = users.filter((user) => listSubscriptions(ctx.db, user.id).length > 0);
    if (reachable.length === 0) continue;
    const names = new Map(users.map((user) => [user.id, user.name]));
    const notifications = planReminders({
      now,
      timeZone: household.timeZone,
      users: reachable.map((user) => ({ id: user.id, name: user.name, prefs: user.prefs })),
      tasks: listHouseholdTasks(ctx.db, household.id),
      memberName: (id) => names.get(id),
    });
    planned += notifications.length;
    queued += ctx.notifier.enqueue(notifications);
  }
  const dispatch = await ctx.notifier.dispatch();
  return { planned, queued, dispatch };
}
