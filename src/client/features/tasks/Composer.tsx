import { addDays, weekday, type Ymd } from '@shared/dates';
import { formatDayDate } from '@shared/format';
import { describeRecurrence } from '@shared/recurrence';
import type { TaskCreateInput } from '@shared/schemas';
import type { Priority, Recurrence, Risk, Task, Visibility, ZoneId } from '@shared/types';
import { LEVELS, zonesOnLevel } from '@shared/zones';
import { Flame, Lock, Sparkles, Users, Wand2, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAppData, useUi } from '../../app/context';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { Avatar, Button, Chip, cx, Field, Segmented, Switch, TextArea, TextInput } from '../../components/ui';
import { HouseView } from '../../house/HouseView';
import { api, errorMessage } from '../../lib/api';
import { RISK_LABEL } from '../../lib/labels';
import { useCreateTask, useUpdateTask } from '../../lib/queries';
import { useDarkMode } from '../../lib/theme';

interface FormState {
  kind: 'todo' | 'maintenance';
  visibility: Visibility;
  title: string;
  notes: string;
  zoneId: ZoneId | null;
  priority: Priority;
  risks: Risk[];
  quickWin: boolean;
  estimateMinutes: number | null;
  contact: string;
  dueDate: Ymd | null;
  recurrence: Recurrence | null;
  assigneeId: string | null;
}

const REPEATS: { label: string; value: Recurrence | null }[] = [
  { label: 'Never', value: null },
  { label: 'Weekly', value: { kind: 'interval', every: 1, unit: 'week' } },
  { label: 'Every 2 weeks', value: { kind: 'interval', every: 2, unit: 'week' } },
  { label: 'Monthly', value: { kind: 'interval', every: 1, unit: 'month' } },
  { label: 'Every 3 months', value: { kind: 'interval', every: 3, unit: 'month' } },
  { label: 'Every 6 months', value: { kind: 'interval', every: 6, unit: 'month' } },
  { label: 'Yearly', value: { kind: 'interval', every: 1, unit: 'year' } },
];

const ESTIMATES = [5, 10, 15, 30, 60, 120];

function sameRecurrence(a: Recurrence | null, b: Recurrence | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fromTask(task: Task): FormState {
  return {
    kind: task.kind,
    visibility: task.visibility,
    title: task.title,
    notes: task.notes,
    zoneId: task.zoneId,
    priority: task.priority,
    risks: task.risks,
    quickWin: task.quickWin,
    estimateMinutes: task.estimateMinutes,
    contact: task.contact ?? '',
    dueDate: task.dueDate,
    recurrence: task.recurrence,
    assigneeId: task.assigneeId,
  };
}

function fromDefaults(defaults: Partial<TaskCreateInput> = {}): FormState {
  return {
    kind: defaults.kind ?? 'todo',
    visibility: defaults.visibility ?? 'shared',
    title: defaults.title ?? '',
    notes: defaults.notes ?? '',
    zoneId: defaults.zoneId ?? null,
    priority: defaults.priority ?? 'normal',
    risks: defaults.risks ?? [],
    quickWin: defaults.quickWin ?? false,
    estimateMinutes: defaults.estimateMinutes ?? null,
    contact: defaults.contact ?? '',
    dueDate: defaults.dueDate ?? null,
    recurrence: defaults.recurrence ?? null,
    assigneeId: defaults.assigneeId ?? null,
  };
}

function dateChoices(today: Ymd) {
  const dow = weekday(today);
  return [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: addDays(today, 1) },
    { label: 'This weekend', value: addDays(today, ((6 - dow + 7) % 7) || 7) },
    { label: 'Next week', value: addDays(today, ((8 - dow) % 7) || 7) },
  ];
}

export function Composer() {
  const { composer, closeComposer } = useUi();
  const { today, me, partner, zoneLabel, bootstrap } = useAppData();
  const dark = useDarkMode();
  const toast = useToast();
  const create = useCreateTask();
  const update = useUpdateTask();
  const editing = composer?.mode === 'edit' ? composer.task : null;
  const [form, setForm] = useState<FormState>(() => fromDefaults());
  const [magic, setMagic] = useState('');
  const [magicBusy, setMagicBusy] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!composer) return;
    setForm(composer.mode === 'edit' ? fromTask(composer.task) : fromDefaults(composer.defaults));
    setMagic('');
    setError(null);
    setShowDate(false);
  }, [composer]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const dates = useMemo(() => dateChoices(today), [today]);
  const isPresetDate = dates.some((d) => d.value === form.dueDate);
  const saving = create.isPending || update.isPending;

  const fillWithAi = async () => {
    if (!magic.trim()) return;
    setMagicBusy(true);
    try {
      const { draft } = await api<{ draft: TaskCreateInput }>('/ai/parse-task', { body: { text: magic } });
      setForm((f) => ({ ...f, ...fromDefaults({ ...draft, kind: f.kind }) }));
      if (draft.dueDate && !dates.some((d) => d.value === draft.dueDate)) setShowDate(true);
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setMagicBusy(false);
    }
  };

  const save = () => {
    const title = form.title.trim();
    if (!title) {
      setError('Give it a short title.');
      return;
    }
    const payload: TaskCreateInput = {
      kind: form.kind,
      visibility: form.kind === 'maintenance' ? 'shared' : form.visibility,
      title,
      notes: form.notes,
      zoneId: form.zoneId,
      priority: form.priority,
      risks: form.risks,
      quickWin: form.quickWin,
      estimateMinutes: form.estimateMinutes,
      contact: form.contact.trim() || null,
      dueDate: form.dueDate,
      recurrence: form.recurrence,
      assigneeId: form.assigneeId,
    };
    const onError = (err: unknown) => setError(errorMessage(err));
    if (editing) {
      const { zoneId, ...rest } = payload;
      const patch = zoneId !== editing.zoneId ? { ...rest, zoneId, fixtureId: null } : rest;
      update.mutate(
        { id: editing.id, patch },
        { onSuccess: () => { closeComposer(); toast('Saved', { tone: 'success' }); }, onError },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          closeComposer();
          toast(form.assigneeId && form.assigneeId !== me.id ? `Sent to ${partner?.name ?? 'your partner'}` : 'Added', { tone: 'success' });
        },
        onError,
      });
    }
  };

  const assigneeOptions = [
    ...(form.visibility === 'shared' || form.kind === 'maintenance' ? [{ id: null, label: 'Anyone' }] : []),
    { id: me.id, label: 'Me' },
    ...(partner ? [{ id: partner.id, label: partner.name }] : []),
  ];

  return (
    <Sheet
      open={Boolean(composer)}
      onClose={closeComposer}
      tall
      title={editing ? 'Edit task' : 'New task'}
      footer={
        <div className="flex items-center gap-3">
          {error && <p className="flex-1 text-[13px] font-medium text-overdue">{error}</p>}
          <Button size="lg" className={error ? '' : 'flex-1'} block={!error} loading={saving} onClick={save}>
            {editing ? 'Save changes' : form.assigneeId && form.assigneeId !== me.id ? `Assign to ${partner?.name}` : 'Add task'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-4">
        {!editing && bootstrap.ai.enabled && (
          <div className="rounded-2xl border border-accent/20 bg-accent-soft/50 p-3">
            <div className="flex gap-2">
              <TextInput
                value={magic}
                onChange={(e) => setMagic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void fillWithAi()}
                placeholder="“Call the dentist next week”"
                aria-label="Describe the task"
                className="border-transparent bg-surface"
              />
              <Button variant="primary" onClick={() => void fillWithAi()} loading={magicBusy} icon={<Wand2 className="size-4" />}>
                Fill
              </Button>
            </div>
            <p className="mt-1.5 flex items-center gap-1 px-1 text-[12px] text-ink-3">
              <Sparkles className="size-3" /> Describe it in your own words — AI fills in the details.
            </p>
          </div>
        )}

        <Field label="Title">
          <TextInput
            autoFocus={!editing}
            value={form.title}
            onChange={(e) => {
              set('title', e.target.value);
              setError(null);
            }}
            placeholder={form.kind === 'maintenance' ? 'e.g. Descale the kettle' : 'e.g. Book the car service'}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Segmented
            value={form.kind}
            onChange={(kind) => set('kind', kind)}
            options={[
              { value: 'todo', label: 'To-do' },
              { value: 'maintenance', label: 'Home maintenance' },
            ]}
          />
          {form.kind === 'todo' && (
            <Segmented
              value={form.visibility}
              onChange={(visibility) => {
                setForm((f) => ({
                  ...f,
                  visibility,
                  assigneeId: visibility === 'personal' && f.assigneeId === null ? me.id : f.assigneeId,
                }));
              }}
              options={[
                { value: 'shared', label: <span className="inline-flex items-center gap-1"><Users className="size-3.5" />Shared</span> },
                { value: 'personal', label: <span className="inline-flex items-center gap-1"><Lock className="size-3.5" />Private</span> },
              ]}
            />
          )}
        </div>

        <Field label="Who's doing it">
          <div className="flex flex-wrap gap-2">
            {assigneeOptions.map((option) => {
              const member = option.id ? (option.id === me.id ? me : partner) : null;
              return (
                <Chip
                  key={option.label}
                  selected={form.assigneeId === option.id}
                  onClick={() => set('assigneeId', option.id)}
                  icon={member ? <Avatar member={member} size={18} /> : undefined}
                >
                  {option.label}
                </Chip>
              );
            })}
          </div>
        </Field>

        <Field label="When" hint={form.dueDate ? formatDayDate(form.dueDate, today) : 'No due date'}>
          <div className="flex flex-wrap gap-2">
            {dates.map((d) => (
              <Chip key={d.label} selected={form.dueDate === d.value} onClick={() => set('dueDate', d.value)}>
                {d.label}
              </Chip>
            ))}
            <Chip selected={showDate || (Boolean(form.dueDate) && !isPresetDate)} onClick={() => setShowDate(true)}>
              Pick a date
            </Chip>
            <Chip selected={!form.dueDate} onClick={() => { set('dueDate', null); setShowDate(false); }}>
              Someday
            </Chip>
          </div>
          {(showDate || (form.dueDate && !isPresetDate)) && (
            <TextInput type="date" value={form.dueDate ?? ''} min={today} onChange={(e) => set('dueDate', e.target.value || null)} className="mt-2" />
          )}
        </Field>

        <Field label="Repeats" hint={form.recurrence ? `${describeRecurrence(form.recurrence)} — the clock restarts each time it's done` : undefined}>
          <div className="flex flex-wrap gap-2">
            {REPEATS.map((r) => (
              <Chip key={r.label} selected={sameRecurrence(form.recurrence, r.value)} onClick={() => set('recurrence', r.value)}>
                {r.label}
              </Chip>
            ))}
            {form.recurrence && !REPEATS.some((r) => sameRecurrence(r.value, form.recurrence)) && (
              <Chip selected>{describeRecurrence(form.recurrence)}</Chip>
            )}
          </div>
        </Field>

        <Field label="Where in the house" hint={form.zoneId ? zoneLabel(form.zoneId) : 'Tap a room — or leave it off'}>
          <div className="overflow-hidden rounded-2xl border border-line bg-canvas">
            <div className="h-48">
              <HouseView
                className="h-full w-full"
                summaries={{}}
                selectedZone={form.zoneId}
                pins={false}
                dark={dark}
                zoneLabel={zoneLabel}
                onSelectZone={(zone) => set('zoneId', zone)}
              />
            </div>
            <div className="scrollbar-none flex gap-2 overflow-x-auto border-t border-line bg-surface p-2">
              {LEVELS.flatMap((level) => zonesOnLevel(level.id)).map((zone) => (
                <Chip key={zone.id} selected={form.zoneId === zone.id} onClick={() => set('zoneId', form.zoneId === zone.id ? null : zone.id)}>
                  {zoneLabel(zone.id)}
                </Chip>
              ))}
            </div>
          </div>
        </Field>

        <div className="rounded-2xl border border-line p-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-quick-soft text-quick">
              <Zap className="size-[18px]" />
            </span>
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-ink">Quick win</p>
              <p className="text-[12.5px] text-ink-3">A short call or errand for a spare moment</p>
            </div>
            <Switch checked={form.quickWin} onChange={(v) => set('quickWin', v)} label="Quick win" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {ESTIMATES.map((m) => (
              <Chip key={m} selected={form.estimateMinutes === m} onClick={() => set('estimateMinutes', form.estimateMinutes === m ? null : m)}>
                {m < 60 ? `${m} min` : `${m / 60} h`}
              </Chip>
            ))}
          </div>
          <TextInput
            className="mt-3"
            value={form.contact}
            onChange={(e) => set('contact', e.target.value)}
            placeholder="Phone number or link (optional)"
            inputMode="tel"
            aria-label="Phone number or link"
          />
        </div>

        <Field label="Priority">
          <Segmented
            value={form.priority}
            onChange={(priority) => set('priority', priority)}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'High' },
              { value: 'critical', label: 'Critical' },
            ]}
          />
        </Field>

        {form.kind === 'maintenance' && (
          <Field label="Risk if forgotten">
            <div className="flex flex-wrap gap-2">
              {(['fire', 'water', 'safety', 'air', 'efficiency'] as Risk[]).map((risk) => {
                const on = form.risks.includes(risk);
                return (
                  <Chip
                    key={risk}
                    selected={on}
                    icon={risk === 'fire' ? <Flame className={cx('size-3.5', !on && 'text-fire')} /> : undefined}
                    onClick={() => set('risks', on ? form.risks.filter((r) => r !== risk) : [...form.risks, risk])}
                  >
                    {RISK_LABEL[risk]}
                  </Chip>
                );
              })}
            </div>
          </Field>
        )}

        <Field label="Notes">
          <TextArea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Details, model numbers, who to call…" />
        </Field>
      </div>
    </Sheet>
  );
}
