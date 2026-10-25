import type { Household } from '@shared/types';
import type { AiProvider } from './ai/types';
import type { Config } from './config';
import type { Db } from './db';
import type { Persistence } from './persistence';
import type { UserRecord } from './repos/users';
import type { Notifier } from './services/notifications';

/** Everything request handlers need, injected so tests can swap pieces. */
export interface AppContext {
  config: Config;
  db: Db;
  notifier: Notifier;
  ai: AiProvider | null;
  persistence: Persistence;
  now: () => Date;
}

/** The signed-in user plus their household. */
export interface Actor {
  user: UserRecord;
  household: Household;
  members: UserRecord[];
}
