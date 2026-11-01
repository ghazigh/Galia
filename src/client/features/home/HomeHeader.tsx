import type { HouseHealth } from '@shared/status';
import { ChevronDown, Settings, Sun, Sunrise, Sunset, UserPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useAppData } from '../../app/context';
import { Menu } from '../../components/Menu';
import { Avatar, cx } from '../../components/ui';
import { formatClock, type Daylight } from '../../lib/daylight';
import { greeting } from '../../lib/today';
import { MoonIcon } from '../daylight/MoonIcon';

function statusLine(health: HouseHealth, attention: number): { text: string; dot: string } {
  if (health.overdue) return { text: `${health.overdue} overdue`, dot: 'bg-[#ff5a52]' };
  if (attention) return { text: `${attention} this week`, dot: 'bg-[#f2c14e]' };
  return { text: 'On track', dot: 'bg-[#3ccf8e]' };
}

/** Next sunrise/sunset, or the moon at night. */
export function DaylightChip({ daylight, onClick }: { daylight: Daylight; onClick: () => void }) {
  const { next, timeZone, isNight, illumination } = daylight;
  const Icon = next?.kind === 'sunset' ? Sunset : Sunrise;
  const when = next ? formatClock(next.at, timeZone) : null;
  const label = next ? `${next.kind === 'sunset' ? 'Sunset' : 'Sunrise'} ${when}` : isNight ? 'Polar night' : 'Midnight sun';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Daylight: ${label}. Open daylight details`}
      className="flex h-10 items-center gap-2 rounded-full bg-black/25 pr-3.5 pl-3 text-[13px] font-medium text-white/90 backdrop-blur-md transition hover:bg-black/35 active:scale-95"
    >
      {isNight ? <MoonIcon phase={illumination.phase} size={17} className="text-[#e9e4d6]" /> : <Sun className="size-[17px] text-[#ffd27a]" strokeWidth={1.8} />}
      <span className="flex items-center gap-1 tabular">
        <Icon className="size-3.5 opacity-70" strokeWidth={1.8} />
        {when ?? label}
      </span>
    </button>
  );
}

export function HomeHeader({
  health,
  attention,
  daylight,
  onDaylight,
}: {
  health: HouseHealth;
  attention: number;
  daylight: Daylight;
  onDaylight: () => void;
}) {
  const { bootstrap, me, members } = useAppData();
  const navigate = useNavigate();
  const status = statusLine(health, attention);
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10">
      <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/45 via-black/15 to-transparent" />
      <div className="relative flex items-start justify-between gap-3 px-5 pt-[max(env(safe-area-inset-top),14px)] lg:px-8 lg:pt-7">
        <div className="pointer-events-auto min-w-0">
          <p className="eyebrow text-white/60 [text-shadow:0_1px_10px_rgb(0_0_0/0.4)]">
            {greeting(bootstrap.household.timeZone)}, {me.name.split(' ')[0]}
          </p>
          <Menu
            trigger={(props) => (
              <button type="button" {...props} className="mt-1 flex items-center gap-1.5 text-white" aria-label={`${bootstrap.household.name}: household menu`}>
                <h1 className="truncate font-display text-[25px] leading-tight font-semibold tracking-[-0.02em] [text-shadow:0_1px_16px_rgb(0_0_0/0.35)]">
                  {bootstrap.household.name}
                </h1>
                <ChevronDown className="mt-1 size-5 shrink-0 opacity-80" strokeWidth={2} />
              </button>
            )}
            items={[
              ...members.map((member) => ({
                label: member.id === me.id ? `${member.name} (you)` : member.name,
                icon: <Avatar member={member} size={22} decorative />,
                hint: member.role === 'owner' ? 'Owner' : 'Member',
                onSelect: () => navigate('/settings'),
              })),
              ...(members.length < 3
                ? [{ label: 'Invite your partner', icon: <UserPlus className="size-4" />, onSelect: () => navigate('/settings#household') }]
                : []),
              { label: 'Household settings', icon: <Settings className="size-4" />, onSelect: () => navigate('/settings') },
            ]}
          />
          <p className="mt-1.5 flex items-center gap-2 text-[13px] text-white/75 [text-shadow:0_1px_10px_rgb(0_0_0/0.45)]">
            <span className={cx('size-[7px] rounded-full', status.dot)} />
            <span className="truncate">{status.text}</span>
            <span className="text-white/35">·</span>
            <span className="whitespace-nowrap tabular">Health {health.score}</span>
          </p>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2 pt-1">
          <DaylightChip daylight={daylight} onClick={onDaylight} />
          <Link to="/settings" aria-label="Profile" className="rounded-full ring-2 ring-white/15 transition active:scale-95 lg:hidden">
            <Avatar member={me} size={36} decorative />
          </Link>
        </div>
      </div>
    </header>
  );
}
