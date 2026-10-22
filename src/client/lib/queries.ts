import { nextDueAfterCompletion } from '@shared/recurrence';
import type { TaskCreateInput, TaskPatchInput } from '@shared/schemas';
import type { Bootstrap, Completion, Task } from '@shared/types';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface SessionResponse {
  setupRequired: boolean;
  bootstrap: Bootstrap | null;
}

export const keys = {
  session: ['session'] as const,
  tasks: ['tasks'] as const,
  history: (id: string) => ['history', id] as const,
  catalog: ['catalog'] as const,
  push: ['push-status'] as const,
};

export function useSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: () => api<SessionResponse>('/session'),
    staleTime: 5 * 60_000,
  });
}

/** The signed-in bootstrap. Only call below the auth gate. */
export function useBootstrap(): Bootstrap {
  const { data } = useSession();
  if (!data?.bootstrap) throw new Error('useBootstrap used outside an authenticated view');
  return data.bootstrap;
}

export function setBootstrap(qc: QueryClient, bootstrap: Bootstrap | null) {
  qc.setQueryData<SessionResponse>(keys.session, { setupRequired: false, bootstrap });
}

export function useTasks() {
  return useQuery({
    queryKey: keys.tasks,
    queryFn: () => api<Task[]>('/tasks'),
    refetchInterval: 60_000,
  });
}

export function useTaskHistory(id: string | null) {
  return useQuery({
    queryKey: keys.history(id ?? ''),
    queryFn: () => api<Completion[]>(`/tasks/${id}/history`),
    enabled: Boolean(id),
  });
}

// ── Optimistic task mutations ────────────────────────────────────────────────────────────────

type TaskList = Task[] | undefined;

function patchCache(qc: QueryClient, update: (tasks: Task[]) => Task[]) {
  const previous = qc.getQueryData<Task[]>(keys.tasks);
  if (previous) qc.setQueryData<Task[]>(keys.tasks, update(previous));
  return previous;
}

function replaceTask(qc: QueryClient, task: Task) {
  qc.setQueryData<TaskList>(keys.tasks, (tasks) =>
    tasks ? (tasks.some((t) => t.id === task.id) ? tasks.map((t) => (t.id === task.id ? task : t)) : [...tasks, task]) : tasks,
  );
}

function useTaskMutation<V, R>(options: {
  mutationFn: (vars: V) => Promise<R>;
  optimistic?: (tasks: Task[], vars: V) => Task[];
  onSuccess?: (result: R, vars: V, qc: QueryClient) => void;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: options.mutationFn,
    onMutate: async (vars: V) => {
      await qc.cancelQueries({ queryKey: keys.tasks });
      const previous = options.optimistic ? patchCache(qc, (tasks) => options.optimistic!(tasks, vars)) : undefined;
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) qc.setQueryData(keys.tasks, context.previous);
    },
    onSuccess: (result, vars) => options.onSuccess?.(result, vars, qc),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.tasks });
    },
  });
}

export function useCreateTask() {
  return useTaskMutation({
    mutationFn: (input: TaskCreateInput) => api<Task>('/tasks', { body: input }),
    onSuccess: (task, _vars, qc) => replaceTask(qc, task),
  });
}

export function useUpdateTask() {
  return useTaskMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatchInput }) =>
      api<Task>(`/tasks/${id}`, { method: 'PATCH', body: patch }),
    optimistic: (tasks, { id, patch }) => tasks.map((t) => (t.id === id ? ({ ...t, ...patch } as Task) : t)),
    onSuccess: (task, _vars, qc) => replaceTask(qc, task),
  });
}

export function useCompleteTask() {
  return useTaskMutation({
    mutationFn: ({ task, note }: { task: Task; today: string; userId: string; note?: string }) =>
      api<{ task: Task }>(`/tasks/${task.id}/complete`, { body: note ? { note } : {} }),
    optimistic: (tasks, { task, today, userId }) =>
      tasks.map((t) => {
        if (t.id !== task.id) return t;
        const now = new Date().toISOString();
        return t.recurrence
          ? {
              ...t,
              dueDate: nextDueAfterCompletion(t.recurrence, today, t.dueDate),
              snoozedUntil: null,
              lastCompletedAt: now,
              lastCompletedById: userId,
            }
          : { ...t, completedAt: now, snoozedUntil: null, lastCompletedAt: now, lastCompletedById: userId };
      }),
    onSuccess: ({ task }, _vars, qc) => {
      replaceTask(qc, task);
      void qc.invalidateQueries({ queryKey: keys.history(task.id) });
    },
  });
}

export function useUndoComplete() {
  return useTaskMutation({
    mutationFn: (id: string) => api<Task>(`/tasks/${id}/undo-complete`, { body: {} }),
    onSuccess: (task, _vars, qc) => {
      replaceTask(qc, task);
      void qc.invalidateQueries({ queryKey: keys.history(task.id) });
    },
  });
}

export function useSnoozeTask() {
  return useTaskMutation({
    mutationFn: ({ id, until }: { id: string; until: string }) => api<Task>(`/tasks/${id}/snooze`, { body: { until } }),
    optimistic: (tasks, { id, until }) => tasks.map((t) => (t.id === id ? { ...t, snoozedUntil: until } : t)),
    onSuccess: (task, _vars, qc) => replaceTask(qc, task),
  });
}

export function useDeleteTask() {
  return useTaskMutation({
    mutationFn: (id: string) => api<void>(`/tasks/${id}`, { method: 'DELETE' }),
    optimistic: (tasks, id) => tasks.filter((t) => t.id !== id),
  });
}

export function useRestoreTask() {
  return useTaskMutation({
    mutationFn: (id: string) => api<Task>(`/tasks/${id}/restore`, { body: {} }),
    onSuccess: (task, _vars, qc) => replaceTask(qc, task),
  });
}

// ── Expert catalog ──────────────────────────────────────────────────────────────────────────

export interface CatalogItem {
  key: string;
  group: 'essential' | 'recommended' | 'new-home';
  title: string;
  zoneId: Task['zoneId'];
  priority: Task['priority'];
  risks: Task['risks'];
  recurrence: Task['recurrence'];
  estimateMinutes: number;
  added: boolean;
}

export function useCatalog(enabled = true) {
  return useQuery({ queryKey: keys.catalog, queryFn: () => api<CatalogItem[]>('/maintenance/catalog'), enabled });
}

export function useAddCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keysToAdd: string[]) => api<Task[]>('/maintenance/catalog', { body: { keys: keysToAdd } }),
    onSuccess: (added) => {
      qc.setQueryData<TaskList>(keys.tasks, (tasks) => (tasks ? [...tasks, ...added] : tasks));
      void qc.invalidateQueries({ queryKey: keys.catalog });
    },
  });
}
