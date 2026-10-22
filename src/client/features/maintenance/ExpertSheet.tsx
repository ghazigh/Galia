import { formatMinutes } from '@shared/format';
import { describeRecurrence } from '@shared/recurrence';
import { SEED_GROUPS } from '@shared/seed';
import type { Priority, Recurrence, Risk, Task, ZoneId } from '@shared/types';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Flame, Plus, Sparkles, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { useAppData, useUi } from '../../app/context';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { Button, cx, Spinner, TextInput } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { keys, useAddCatalog, useCatalog, type CatalogItem } from '../../lib/queries';

interface Suggestion {
  title: string;
  zoneId: ZoneId;
  priority: Priority;
  risks: Risk[];
  recurrence: Recurrence;
  estimateMinutes: number;
  guide: { why: string; steps: string[]; pro: boolean };
}

function CatalogRow({ item, onAdd, busy }: { item: CatalogItem; onAdd: () => void; busy: boolean }) {
  const { zoneLabel } = useAppData();
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-medium text-ink">
          {item.risks.includes('fire') && <Flame className="mr-1 inline size-3.5 -translate-y-px text-fire" />}
          {item.title}
        </p>
        <p className="text-[12.5px] text-ink-3">
          {item.zoneId ? zoneLabel(item.zoneId) : 'House'} · {describeRecurrence(item.recurrence)} · {formatMinutes(item.estimateMinutes)}
        </p>
      </div>
      <Button size="sm" variant="soft" onClick={onAdd} disabled={busy} icon={<Plus className="size-3.5" />}>
        Add
      </Button>
    </div>
  );
}

export function ExpertSheet() {
  const { expertOpen, setExpertOpen } = useUi();
  const { bootstrap, zoneLabel, today } = useAppData();
  const catalog = useCatalog(expertOpen);
  const addCatalog = useAddCatalog();
  const toast = useToast();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState('');
  const [asking, setAsking] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const missing = (catalog.data ?? []).filter((item) => !item.added);
  const addedCount = (catalog.data ?? []).length - missing.length;

  const ask = async () => {
    if (prompt.trim().length < 3) return;
    setAsking(true);
    setSuggestions(null);
    try {
      const { suggestions: result } = await api<{ suggestions: Suggestion[] }>('/ai/maintenance', { body: { prompt } });
      setSuggestions(result);
      setPicked(new Set(result.map((_, i) => i)));
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setAsking(false);
    }
  };

  const addSuggestions = async () => {
    if (!suggestions) return;
    setSaving(true);
    try {
      const chosen = suggestions.filter((_, i) => picked.has(i));
      for (const s of chosen) {
        await api<Task>('/tasks', {
          body: {
            kind: 'maintenance',
            title: s.title,
            zoneId: s.zoneId,
            priority: s.priority,
            risks: s.risks,
            recurrence: s.recurrence,
            estimateMinutes: s.estimateMinutes,
            guide: s.guide,
            dueDate: today,
          },
        });
      }
      await qc.invalidateQueries({ queryKey: keys.tasks });
      toast(`Added ${chosen.length} to your plan`, { tone: 'success' });
      setSuggestions(null);
      setPrompt('');
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const add = (keysToAdd: string[]) =>
    addCatalog.mutate(keysToAdd, {
      onSuccess: (added) => toast(added.length === 1 ? `Added “${added[0].title}”` : `Added ${added.length} items`, { tone: 'success' }),
      onError: (err) => toast(errorMessage(err), { tone: 'error' }),
    });

  return (
    <Sheet open={expertOpen} onClose={() => setExpertOpen(false)} tall title="Expert maintenance plan">
      <div className="space-y-6 pb-6">
        <div className="rounded-3xl border border-accent/20 bg-gradient-to-br from-accent-soft to-surface p-4">
          <p className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            <Sparkles className="size-4 text-accent" /> Ask the house expert
          </p>
          <p className="mt-0.5 text-[13px] text-ink-3">
            New appliance or renovation? Describe it and get the maintenance it needs.
          </p>
          {bootstrap.ai.enabled ? (
            <div className="mt-3 flex gap-2">
              <TextInput
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void ask()}
                placeholder="“We just installed a water softener”"
                aria-label="What changed in your home?"
                className="bg-surface"
              />
              <Button onClick={() => void ask()} loading={asking} icon={<Wand2 className="size-4" />}>
                Ask
              </Button>
            </div>
          ) : (
            <p className="mt-3 rounded-2xl bg-surface/70 p-3 text-[13px] text-ink-2">
              AI suggestions turn on once the server is connected to an Azure-hosted model (Claude on Microsoft Foundry or
              Azure OpenAI). See the README.
            </p>
          )}
          {suggestions && (
            <div className="mt-4 space-y-2">
              {suggestions.length === 0 && <p className="text-[13px] text-ink-3">No extra maintenance needed for that.</p>}
              {suggestions.map((s, i) => {
                const on = picked.has(i);
                return (
                  <button
                    key={i}
                    onClick={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                    className={cx(
                      'flex w-full gap-3 rounded-2xl border p-3 text-left transition',
                      on ? 'border-accent/40 bg-surface' : 'border-line bg-surface/50 opacity-70',
                    )}
                  >
                    <span
                      className={cx(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border',
                        on ? 'border-accent bg-accent text-white' : 'border-line-strong',
                      )}
                    >
                      {on && <Check className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold text-ink">{s.title}</span>
                      <span className="block text-[12.5px] text-ink-3">
                        {zoneLabel(s.zoneId)} · {describeRecurrence(s.recurrence)} · {formatMinutes(s.estimateMinutes)}
                      </span>
                      <span className="mt-1 block text-[13px] text-ink-2">{s.guide.why}</span>
                    </span>
                  </button>
                );
              })}
              {suggestions.length > 0 && (
                <Button block loading={saving} disabled={picked.size === 0} onClick={() => void addSuggestions()}>
                  Add {picked.size} to the plan
                </Button>
              )}
            </div>
          )}
        </div>

        {catalog.isLoading && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}

        {catalog.data && (
          <>
            <p className="text-[13px] text-ink-3">
              {addedCount} of {catalog.data.length} expert items are in your plan.
              {missing.length === 0 && ' You have everything.'}
            </p>
            {(Object.keys(SEED_GROUPS) as CatalogItem['group'][]).map((group) => {
              const items = missing.filter((item) => item.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[15px] font-semibold text-ink">{SEED_GROUPS[group].title}</p>
                      <p className="text-[12.5px] text-ink-3">{SEED_GROUPS[group].description}</p>
                    </div>
                    {items.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => add(items.map((i) => i.key))}>
                        Add all
                      </Button>
                    )}
                  </div>
                  <div className="mt-1 divide-y divide-line/70">
                    {items.map((item) => (
                      <CatalogRow key={item.key} item={item} busy={addCatalog.isPending} onAdd={() => add([item.key])} />
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </Sheet>
  );
}
