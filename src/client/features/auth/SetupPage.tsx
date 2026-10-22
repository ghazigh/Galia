import type { SetupInput } from '@shared/schemas';
import { SEED_GROUPS, SEED_TASKS, type SeedGroup } from '@shared/seed';
import type { Bootstrap } from '@shared/types';
import { zoneName } from '@shared/zones';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Flame, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Button, Card, cx, Field, Switch, TextInput } from '../../components/ui';
import { HouseView } from '../../house/HouseView';
import { api, errorMessage } from '../../lib/api';
import { setBootstrap } from '../../lib/queries';
import { useDarkMode } from '../../lib/theme';
import { AuthLayout } from './AuthLayout';

const STEPS = ['welcome', 'home', 'plan', 'account'] as const;
type Step = (typeof STEPS)[number];

function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto';
  } catch {
    return 'America/Toronto';
  }
}

export function SetupPage() {
  const qc = useQueryClient();
  const dark = useDarkMode();
  const [step, setStep] = useState<Step>('welcome');
  const [direction, setDirection] = useState(1);
  const [form, setForm] = useState<SetupInput>({
    householdName: 'Our home',
    timeZone: detectTimeZone(),
    name: '',
    email: '',
    password: '',
    seedGroups: ['essential', 'recommended', 'new-home'],
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const index = STEPS.indexOf(step);

  const go = (next: Step) => {
    setDirection(STEPS.indexOf(next) > index ? 1 : -1);
    setError(null);
    setStep(next);
  };

  const groups = useMemo(
    () =>
      (Object.keys(SEED_GROUPS) as SeedGroup[]).map((group) => ({
        group,
        ...SEED_GROUPS[group],
        items: SEED_TASKS.filter((seed) => seed.group === group),
      })),
    [],
  );
  const selectedCount = groups.filter((g) => form.seedGroups.includes(g.group)).reduce((n, g) => n + g.items.length, 0);

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) {
      setError(form.password.length < 8 ? 'Use a password with at least 8 characters.' : 'Fill in your name and email.');
      return;
    }
    setBusy(true);
    try {
      const bootstrap = await api<Bootstrap>('/setup', { body: form });
      setBootstrap(qc, bootstrap);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout wide>
      <div className="mb-6 flex justify-center gap-1.5" aria-hidden>
        {STEPS.map((s, i) => (
          <span key={s} className={cx('h-1.5 rounded-full transition-all duration-300', i <= index ? 'w-6 bg-accent' : 'w-1.5 bg-line-strong')} />
        ))}
      </div>
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.div
          key={step}
          custom={direction}
          initial={{ opacity: 0, x: 40 * direction }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 * direction }}
          transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        >
          {step === 'welcome' && (
            <div className="text-center">
              <div className="mx-auto aspect-square w-full max-w-sm">
                <HouseView className="h-full w-full" summaries={{}} selectedZone={null} dark={dark} pins={false} zoneLabel={(z) => zoneName(z)} />
              </div>
              <h1 className="mt-2 font-display text-[30px] leading-tight font-semibold tracking-tight text-ink">
                Your home, at a glance
              </h1>
              <p className="mx-auto mt-2 max-w-sm text-[15px] text-ink-2">
                Every room linked to the upkeep it needs, a shared to-do list for the two of you, and reminders that
                show up when there's actually time.
              </p>
              <Button size="lg" className="mt-6 w-full max-w-sm" onClick={() => go('home')} icon={<ArrowRight className="size-5" />}>
                Set up our home
              </Button>
            </div>
          )}

          {step === 'home' && (
            <div>
              <h1 className="font-display text-[26px] font-semibold tracking-tight text-ink">Your home</h1>
              <p className="mt-1 text-[15px] text-ink-2">
                The house map is set up for your three levels: garage and mechanical room below, living room, entry and
                kitchen on the ground floor, three bedrooms and a bathroom upstairs, plus the backyard.
              </p>
              <div className="mt-6 space-y-4">
                <Field label="What do you call it?">
                  <TextInput value={form.householdName} onChange={(e) => setForm({ ...form, householdName: e.target.value })} />
                </Field>
                <Field label="Time zone" hint="Due dates and reminders follow it.">
                  <TextInput value={form.timeZone} onChange={(e) => setForm({ ...form, timeZone: e.target.value })} />
                </Field>
              </div>
              <div className="mt-8 flex gap-2">
                <Button variant="ghost" size="lg" onClick={() => go('welcome')} icon={<ArrowLeft className="size-5" />} aria-label="Back" />
                <Button size="lg" block onClick={() => go('plan')} disabled={!form.householdName.trim()}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === 'plan' && (
            <div>
              <h1 className="font-display text-[26px] font-semibold tracking-tight text-ink">Your maintenance plan</h1>
              <p className="mt-1 text-[15px] text-ink-2">
                Built by home-maintenance experts for your house — staggered so nothing lands all at once. You can change
                any of it later.
              </p>
              <div className="mt-5 space-y-3">
                {groups.map(({ group, title, description, items }) => {
                  const on = form.seedGroups.includes(group);
                  return (
                    <Card key={group} className={cx('p-4 transition', !on && 'opacity-60')}>
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold text-ink">
                            {title} <span className="text-ink-3 tabular">· {items.length}</span>
                          </p>
                          <p className="text-[13px] text-ink-3">{description}</p>
                        </div>
                        <Switch
                          checked={on}
                          label={title}
                          onChange={(checked) =>
                            setForm({
                              ...form,
                              seedGroups: checked ? [...form.seedGroups, group] : form.seedGroups.filter((g) => g !== group),
                            })
                          }
                        />
                      </div>
                      <ul className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {items.slice(0, 6).map((item) => (
                          <li key={item.key} className="flex items-center gap-1.5 text-[13px] text-ink-2">
                            {item.risks.includes('fire') ? (
                              <Flame className="size-3.5 shrink-0 text-fire" />
                            ) : (
                              <Check className="size-3.5 shrink-0 text-ok" />
                            )}
                            <span className="truncate">{item.title}</span>
                          </li>
                        ))}
                        {items.length > 6 && <li className="text-[13px] text-ink-3">+ {items.length - 6} more</li>}
                      </ul>
                    </Card>
                  );
                })}
              </div>
              <div className="mt-6 flex gap-2">
                <Button variant="ghost" size="lg" onClick={() => go('home')} icon={<ArrowLeft className="size-5" />} aria-label="Back" />
                <Button size="lg" block onClick={() => go('account')}>
                  {selectedCount ? `Use ${selectedCount} items` : 'Start empty'}
                </Button>
              </div>
            </div>
          )}

          {step === 'account' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <h1 className="font-display text-[26px] font-semibold tracking-tight text-ink">Your account</h1>
              <p className="mt-1 text-[15px] text-ink-2">You'll invite your partner from Settings once you're in.</p>
              <div className="mt-6 space-y-4">
                <Field label="Your name">
                  <TextInput autoComplete="given-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
                </Field>
                <Field label="Email">
                  <TextInput type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label="Password" hint="At least 8 characters.">
                  <TextInput
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </Field>
              </div>
              {error && <p className="mt-4 text-[14px] font-medium text-overdue">{error}</p>}
              <div className="mt-8 flex gap-2">
                <Button type="button" variant="ghost" size="lg" onClick={() => go('plan')} icon={<ArrowLeft className="size-5" />} aria-label="Back" />
                <Button type="submit" size="lg" block loading={busy} icon={<Sparkles className="size-5" />}>
                  Create our home
                </Button>
              </div>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </AuthLayout>
  );
}
