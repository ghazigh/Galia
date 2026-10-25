import type { Ymd } from '@shared/dates';
import type { Bootstrap, Me, Member, Task, ZoneId } from '@shared/types';
import { zoneName } from '@shared/zones';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useBootstrap, useTasks } from '../lib/queries';
import { useToday } from '../lib/today';
import type { TaskCreateInput } from '@shared/schemas';

export interface AppData {
  bootstrap: Bootstrap;
  me: Me;
  members: Member[];
  partner: Member | null;
  memberById: (id: string | null | undefined) => Member | undefined;
  today: Ymd;
  zoneLabel: (zone: ZoneId) => string;
  tasks: Task[];
  tasksLoading: boolean;
}

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const bootstrap = useBootstrap();
  const { data: tasks, isLoading } = useTasks();
  const today = useToday(bootstrap.household.timeZone);

  const value = useMemo<AppData>(() => {
    const byId = new Map(bootstrap.members.map((m) => [m.id, m]));
    return {
      bootstrap,
      me: bootstrap.me,
      members: bootstrap.members,
      partner: bootstrap.members.find((m) => m.id !== bootstrap.me.id) ?? null,
      memberById: (id) => (id ? byId.get(id) : undefined),
      today,
      zoneLabel: (zone) => zoneName(zone, bootstrap.household),
      tasks: tasks ?? [],
      tasksLoading: isLoading,
    };
  }, [bootstrap, tasks, isLoading, today]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData outside AppDataProvider');
  return value;
}

// ── Composer (new / edit task) ───────────────────────────────────────────────────────────────

export type ComposerRequest =
  | { mode: 'create'; defaults?: Partial<TaskCreateInput> }
  | { mode: 'edit'; task: Task };

interface UiState {
  composer: ComposerRequest | null;
  openComposer: (request?: ComposerRequest) => void;
  closeComposer: () => void;
  expertOpen: boolean;
  setExpertOpen: (open: boolean) => void;
}

const UiContext = createContext<UiState | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [composer, setComposer] = useState<ComposerRequest | null>(null);
  const [expertOpen, setExpertOpen] = useState(false);
  const openComposer = useCallback((request?: ComposerRequest) => setComposer(request ?? { mode: 'create' }), []);
  const closeComposer = useCallback(() => setComposer(null), []);
  const value = useMemo(
    () => ({ composer, openComposer, closeComposer, expertOpen, setExpertOpen }),
    [composer, openComposer, closeComposer, expertOpen],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiState {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi outside UiProvider');
  return value;
}
