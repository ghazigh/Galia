import { WEEKDAY_SHORT } from '@shared/dates';
import { APP_NAME } from '@shared/brand';
import type { Bootstrap, NotificationPrefs, QuickWinWindow, ZoneId } from '@shared/types';
import { ZONES } from '@shared/zones';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  Check,
  Copy,
  House,
  LogOut,
  Plus,
  Send,
  Share,
  Smartphone,
  Sparkles,
  SquarePlus,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAppData, useUi } from '../../app/context';
import { useToast } from '../../components/Toast';
import { Avatar, Button, Card, cx, Switch, TextInput } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { currentSubscription, disablePush, enablePush } from '../../lib/push';
import { isIOS, isStandalone, pushSupport } from '../../lib/pwa';
import { keys, setBootstrap } from '../../lib/queries';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="px-1 font-display text-[18px] font-semibold tracking-tight text-ink">{title}</h2>
      {description && <p className="px-1 text-[13px] text-ink-3">{description}</p>}
      <Card className="mt-3 divide-y divide-line/70 px-4">{children}</Card>
    </section>
  );
}

function Row({ title, detail, children, icon }: { title: string; detail?: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      {icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sunken text-ink-2">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-medium text-ink">{title}</p>
        {detail && <div className="text-[12.5px] text-ink-3">{detail}</div>}
      </div>
      {children}
    </div>
  );
}

function TimeInput({ value, onChange, label, disabled }: { value: string; onChange: (v: string) => void; label: string; disabled?: boolean }) {
  return (
    <input
      type="time"
      value={value}
      disabled={disabled}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      aria-label={label}
      className="h-9 rounded-xl border border-line bg-surface-2 px-2 text-[14px] font-semibold text-ink tabular outline-none focus:border-accent disabled:opacity-40"
    />
  );
}

/** Saves partial account changes and refreshes the session cache. */
function useSaveProfile() {
  const qc = useQueryClient();
  const toast = useToast();
  return async (patch: { name?: string; prefs?: NotificationPrefs }) => {
    try {
      const bootstrap = await api<Bootstrap>('/me', { method: 'PATCH', body: patch });
      setBootstrap(qc, bootstrap);
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  };
}

function DeviceNotifications() {
  const { bootstrap } = useAppData();
  const toast = useToast();
  const support = pushSupport();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: keys.push, queryFn: () => api<{ configured: boolean; devices: number }>('/push/status') });

  useEffect(() => {
    void currentSubscription().then((s) => setSubscribed(Boolean(s)));
  }, []);

  if (support === 'needs-install') {
    return (
      <Row icon={<Smartphone className="size-[18px]" />} title="Add to your Home Screen first" detail="On iPhone, notifications work once the app is installed: tap Share, then “Add to Home Screen”, and open it from there." />
    );
  }
  if (support === 'unsupported') {
    return <Row icon={<BellRing className="size-[18px]" />} title="Notifications aren't supported in this browser" />;
  }
  if (status.data && !status.data.configured) {
    return <Row icon={<BellRing className="size-[18px]" />} title="Push isn't set up on the server" detail="Add VAPID keys to the server environment (see the README)." />;
  }
  return (
    <Row
      icon={<BellRing className="size-[18px]" />}
      title={subscribed ? 'On for this device' : 'Notifications are off on this device'}
      detail={status.data ? `${status.data.devices} device${status.data.devices === 1 ? '' : 's'} registered for you` : undefined}
    >
      {subscribed ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<Send className="size-3.5" />}
            onClick={async () => {
              try {
                await api('/push/test', { body: {} });
                toast('Test notification sent', { tone: 'success' });
              } catch (err) {
                toast(errorMessage(err), { tone: 'error' });
              }
            }}
          >
            Test
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await disablePush();
              setSubscribed(false);
              void status.refetch();
            }}
          >
            Turn off
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          loading={busy}
          disabled={!bootstrap.push.publicKey}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await enablePush(bootstrap.push.publicKey!);
              if (result === 'granted') {
                setSubscribed(true);
                void status.refetch();
                toast('Notifications are on', { tone: 'success' });
              } else {
                toast('Notifications were blocked — allow them in Settings', { tone: 'error' });
              }
            } catch (err) {
              toast(errorMessage(err), { tone: 'error' });
            } finally {
              setBusy(false);
            }
          }}
        >
          Turn on
        </Button>
      )}
    </Row>
  );
}

function WindowEditor({ window: win, onChange, onRemove }: { window: QuickWinWindow; onChange: (w: QuickWinWindow) => void; onRemove: () => void }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <input
          value={win.label}
          onChange={(e) => onChange({ ...win, label: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-ink outline-none"
          aria-label="Window name"
        />
        <TimeInput value={win.time} onChange={(time) => onChange({ ...win, time })} label={`${win.label} time`} />
        <button onClick={onRemove} className="p-1.5 text-ink-3 hover:text-overdue" aria-label={`Remove ${win.label}`}>
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="mt-2 flex gap-1">
        {WEEKDAY_SHORT.map((day, index) => {
          const on = win.days.includes(index);
          return (
            <button
              key={day}
              onClick={() =>
                onChange({ ...win, days: on ? win.days.filter((d) => d !== index) : [...win.days, index].sort() })
              }
              aria-pressed={on}
              className={cx(
                'h-8 flex-1 rounded-lg text-[12px] font-semibold transition',
                on ? 'bg-ink text-canvas' : 'bg-surface text-ink-3',
              )}
            >
              {day.slice(0, 2)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NotificationPreferences() {
  const { me } = useAppData();
  const save = useSaveProfile();
  const [prefs, setPrefs] = useState<NotificationPrefs>(me.prefs);
  const timer = useRef<number | undefined>(undefined);

  const update = (next: NotificationPrefs) => {
    setPrefs(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save({ prefs: next }), 600);
  };

  return (
    <>
      <Row title="Morning digest" detail="What's overdue, due today and coming up">
        <TimeInput value={prefs.digest.time} disabled={!prefs.digest.enabled} onChange={(time) => update({ ...prefs, digest: { ...prefs.digest, time } })} label="Digest time" />
        <Switch checked={prefs.digest.enabled} onChange={(enabled) => update({ ...prefs, digest: { ...prefs.digest, enabled } })} label="Morning digest" />
      </Row>
      <Row title="Safety alerts" detail="Overdue fire-safety and critical items, every 3 days">
        <TimeInput value={prefs.safetyAlerts.time} disabled={!prefs.safetyAlerts.enabled} onChange={(time) => update({ ...prefs, safetyAlerts: { ...prefs.safetyAlerts, time } })} label="Safety alert time" />
        <Switch checked={prefs.safetyAlerts.enabled} onChange={(enabled) => update({ ...prefs, safetyAlerts: { ...prefs.safetyAlerts, enabled } })} label="Safety alerts" />
      </Row>
      <div className="py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-[14.5px] font-medium text-ink">Quick-win nudges</p>
            <p className="text-[12.5px] text-ink-3">A nudge with your quick calls during free moments</p>
          </div>
          <Switch checked={prefs.quickWins.enabled} onChange={(enabled) => update({ ...prefs, quickWins: { ...prefs.quickWins, enabled } })} label="Quick-win nudges" />
        </div>
        {prefs.quickWins.enabled && (
          <div className="mt-3 space-y-2">
            {prefs.quickWins.windows.map((win, i) => (
              <WindowEditor
                key={win.id}
                window={win}
                onChange={(next) => {
                  const windows = [...prefs.quickWins.windows];
                  windows[i] = next;
                  update({ ...prefs, quickWins: { ...prefs.quickWins, windows } });
                }}
                onRemove={() =>
                  update({ ...prefs, quickWins: { ...prefs.quickWins, windows: prefs.quickWins.windows.filter((w) => w.id !== win.id) } })
                }
              />
            ))}
            {prefs.quickWins.windows.length < 8 && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus className="size-4" />}
                onClick={() =>
                  update({
                    ...prefs,
                    quickWins: {
                      ...prefs.quickWins,
                      windows: [
                        ...prefs.quickWins.windows,
                        { id: `w${Date.now().toString(36)}`, label: 'Free moment', days: [1, 2, 3, 4, 5], time: '17:30' },
                      ],
                    },
                  })
                }
              >
                Add a free moment
              </Button>
            )}
          </div>
        )}
      </div>
      <Row title="When someone assigns me a task">
        <Switch checked={prefs.assignments.enabled} onChange={(enabled) => update({ ...prefs, assignments: { enabled } })} label="Assignment notifications" />
      </Row>
      <Row title="Quiet hours" detail="Assignments wait until morning">
        <TimeInput value={prefs.quietHours.start} disabled={!prefs.quietHours.enabled} onChange={(start) => update({ ...prefs, quietHours: { ...prefs.quietHours, start } })} label="Quiet hours start" />
        <span className="text-ink-3">–</span>
        <TimeInput value={prefs.quietHours.end} disabled={!prefs.quietHours.enabled} onChange={(end) => update({ ...prefs, quietHours: { ...prefs.quietHours, end } })} label="Quiet hours end" />
        <Switch checked={prefs.quietHours.enabled} onChange={(enabled) => update({ ...prefs, quietHours: { ...prefs.quietHours, enabled } })} label="Quiet hours" />
      </Row>
    </>
  );
}

function Household() {
  const { bootstrap, members, me } = useAppData();
  const qc = useQueryClient();
  const toast = useToast();
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState(bootstrap.household.name);
  const timeZones = useMemo(() => {
    const zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    return zones.includes(bootstrap.household.timeZone) ? zones : [bootstrap.household.timeZone, ...zones];
  }, [bootstrap.household.timeZone]);

  const patch = async (body: Record<string, unknown>) => {
    try {
      setBootstrap(qc, await api<Bootstrap>('/household', { method: 'PATCH', body }));
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  };

  const createInvite = async () => {
    try {
      setInvite(await api<{ url: string; expiresAt: string }>('/household/invites', { body: {} }));
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  };

  return (
    <>
      <Row title="Home name">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== bootstrap.household.name && void patch({ name: name.trim() })}
          className="h-9 w-44 py-1.5 text-right"
          aria-label="Home name"
        />
      </Row>
      <Row title="Time zone" detail="Due dates and reminders follow it">
        <select
          value={bootstrap.household.timeZone}
          onChange={(e) => void patch({ timeZone: e.target.value })}
          className="h-9 max-w-44 rounded-xl border border-line bg-surface-2 px-2 text-[13px] text-ink outline-none"
          aria-label="Time zone"
        >
          {timeZones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </Row>
      {members.map((member) => (
        <Row
          key={member.id}
          icon={<Avatar member={member} size={32} />}
          title={member.id === me.id ? `${member.name} (you)` : member.name}
          detail={member.email}
        >
          <span className="text-[12px] font-semibold text-ink-3">{member.role === 'owner' ? 'Owner' : 'Member'}</span>
        </Row>
      ))}
      {members.length < 3 && (
        <div className="py-3.5">
          {invite ? (
            <div className="space-y-2">
              <p className="text-[13px] text-ink-2">Send this link to your partner. It works once and expires in 7 days.</p>
              <div className="flex gap-2">
                <TextInput readOnly value={invite.url} onFocus={(e) => e.target.select()} aria-label="Invite link" className="text-[13px]" />
                {'share' in navigator ? (
                  <Button
                    icon={<Share className="size-4" />}
                    onClick={() => void navigator.share({ title: `Join ${bootstrap.household.name}`, url: invite.url }).catch(() => undefined)}
                  >
                    Share
                  </Button>
                ) : (
                  <Button
                    icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    onClick={async () => {
                      await navigator.clipboard.writeText(invite.url);
                      setCopied(true);
                    }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <Button variant="soft" icon={<UserPlus className="size-4" />} onClick={() => void createInvite()}>
              Invite your partner
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function Rooms() {
  const { bootstrap } = useAppData();
  const qc = useQueryClient();
  const [names, setNames] = useState(bootstrap.household.zoneNames);
  const save = async (zone: ZoneId, value: string) => {
    const next = { ...names, [zone]: value.trim() };
    if (!value.trim()) delete next[zone];
    setNames(next);
    setBootstrap(qc, await api<Bootstrap>('/household', { method: 'PATCH', body: { zoneNames: next } }));
  };
  return (
    <>
      {ZONES.filter((zone) => zone.id !== 'house').map((zone) => (
        <Row key={zone.id} title={zone.name} detail={zone.blurb}>
          <input
            defaultValue={names[zone.id] ?? ''}
            placeholder="Rename…"
            onBlur={(e) => (e.target.value.trim() !== (names[zone.id] ?? '') ? void save(zone.id, e.target.value) : undefined)}
            className="h-9 w-32 rounded-xl border border-line bg-surface-2 px-2.5 text-right text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
            aria-label={`Rename ${zone.name}`}
          />
        </Row>
      ))}
    </>
  );
}

function Install() {
  if (isStandalone()) {
    return <Row icon={<Check className="size-[18px]" />} title="Installed" detail="You're using the home-screen app." />;
  }
  return isIOS() ? (
    <Row
      icon={<SquarePlus className="size-[18px]" />}
      title="Add to Home Screen"
      detail={
        <>
          In Safari tap <Share className="inline size-3.5 -translate-y-px" /> Share, then <strong>Add to Home Screen</strong>. Notifications on
          iPhone need this.
        </>
      }
    />
  ) : (
    <Row
      icon={<SquarePlus className="size-[18px]" />}
      title="Install the app"
      detail="Use your browser's “Install app” or “Add to Home screen” menu for a full-screen app with notifications."
    />
  );
}

export function SettingsPage() {
  const { me, bootstrap } = useAppData();
  const { setExpertOpen } = useUi();
  const qc = useQueryClient();
  const save = useSaveProfile();
  const [name, setName] = useState(me.name);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-[max(env(safe-area-inset-top),20px)] pb-12 lg:px-8 lg:pt-10">
      <h1 className="px-1 font-display text-[30px] font-semibold tracking-tight text-ink">Settings</h1>

      <Card className="mt-4 flex items-center gap-4 p-4">
        <Avatar member={me} size={52} />
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== me.name && void save({ name: name.trim() })}
            className="w-full bg-transparent font-display text-[19px] font-semibold tracking-tight text-ink outline-none"
            aria-label="Your name"
          />
          <p className="truncate text-[13px] text-ink-3">{me.email}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<LogOut className="size-4" />}
          onClick={async () => {
            await api('/auth/logout', { body: {} });
            qc.clear();
            window.location.href = '/';
          }}
        >
          Sign out
        </Button>
      </Card>

      <Section title="Notifications" description="Reminders arrive as push notifications on your phone.">
        <DeviceNotifications />
        <NotificationPreferences />
      </Section>

      <Section title="Household">
        <Household />
      </Section>

      <Section title="Rooms" description="Rename rooms to match how you use them (e.g. Bedroom 3 → Office).">
        <Rooms />
      </Section>

      <Section title="Maintenance plan">
        <Row icon={<Sparkles className="size-[18px]" />} title="Expert plan" detail="Re-add recommended items or ask the house expert">
          <Button size="sm" variant="soft" onClick={() => setExpertOpen(true)}>
            Open
          </Button>
        </Row>
      </Section>

      <Section title="App">
        <Install />
        <Row
          icon={<House className="size-[18px]" />}
          title={APP_NAME}
          detail={bootstrap.ai.enabled ? `AI: ${bootstrap.ai.provider}` : 'AI suggestions are off on this server'}
        />
      </Section>
    </div>
  );
}
