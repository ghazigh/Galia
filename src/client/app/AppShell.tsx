import { APP_NAME } from '@shared/brand';
import { rankTasks } from '@shared/priority';
import { House, ListChecks, Plus, Settings, Target } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Avatar, cx } from '../components/ui';
import { LogoMark } from '../components/Logo';
import { Composer } from '../features/tasks/Composer';
import { ExpertSheet } from '../features/maintenance/ExpertSheet';
import { TaskSheet } from '../features/tasks/TaskSheet';
import { useAppData, useUi } from './context';

const NAV: { to: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/focus', label: 'Focus', icon: Target },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function useFocusCount(): number {
  const { tasks, today, me } = useAppData();
  return useMemo(
    () =>
      rankTasks(tasks, { today, userId: me.id }).filter(
        ({ timing }) => timing.state === 'overdue' || timing.state === 'today',
      ).length,
    [tasks, today, me.id],
  );
}

function TabBar() {
  const { openComposer } = useUi();
  const focusCount = useFocusCount();
  const [home, focus, tasks, settings] = NAV;
  const tab = (item: (typeof NAV)[number], badge?: number) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cx('relative flex flex-col items-center gap-0.5 pt-1 text-[10.5px] font-semibold transition-colors', isActive ? 'text-accent' : 'text-ink-3')
      }
    >
      {({ isActive }) => (
        <>
          <span className="relative">
            <item.icon className={cx('size-[23px] transition-transform', isActive && 'scale-105')} />
            {badge ? (
              <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-overdue px-1 text-[10px] font-bold text-white tabular">
                {badge > 9 ? '9+' : badge}
              </span>
            ) : null}
          </span>
          {item.label}
        </>
      )}
    </NavLink>
  );
  return (
    <nav className="relative z-30 shrink-0 border-t border-line/70 bg-surface/90 pb-safe backdrop-blur-xl lg:hidden" aria-label="Main">
      <div className="mx-auto grid h-[60px] max-w-md grid-cols-5 items-center">
        {tab(home)}
        {tab(focus, focusCount)}
        <div className="flex justify-center">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => openComposer()}
            aria-label="New task"
            className="-mt-6 flex size-[56px] items-center justify-center rounded-[20px] bg-accent text-on-accent shadow-[0_12px_28px_-10px_var(--color-accent)]"
          >
            <Plus className="size-7" strokeWidth={2.4} />
          </motion.button>
        </div>
        {tab(tasks)}
        {tab(settings)}
      </div>
    </nav>
  );
}

function Sidebar() {
  const { openComposer } = useUi();
  const { me, bootstrap } = useAppData();
  const focusCount = useFocusCount();
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line/70 bg-surface-2/60 px-4 py-6 lg:flex">
      <div className="flex items-center gap-2.5 px-2">
        <LogoMark size={34} />
        <div className="leading-tight">
          <p className="font-display text-[15px] font-semibold tracking-tight text-ink">{APP_NAME}</p>
          <p className="text-[12px] text-ink-3">{bootstrap.household.name}</p>
        </div>
      </div>
      <button
        onClick={() => openComposer()}
        className="mt-6 flex h-11 items-center justify-center gap-2 rounded-2xl bg-accent text-[14px] font-semibold text-on-accent shadow-[0_8px_20px_-10px_var(--color-accent)] transition active:scale-[0.98]"
      >
        <Plus className="size-5" /> New task <kbd className="ml-1 rounded bg-white/20 px-1.5 text-[11px]">N</kbd>
      </button>
      <nav className="mt-6 space-y-1" aria-label="Main">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cx(
                'flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-semibold transition',
                isActive ? 'bg-surface text-ink shadow-card' : 'text-ink-2 hover:bg-sunken',
              )
            }
          >
            <item.icon className="size-[19px]" />
            <span className="flex-1">{item.label}</span>
            {item.to === '/focus' && focusCount > 0 && (
              <span className="rounded-full bg-overdue px-1.5 text-[11px] font-bold text-white tabular">{focusCount}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-3 rounded-2xl px-2 py-2">
        <Avatar member={me} size={32} decorative />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[14px] font-semibold text-ink">{me.name}</p>
          <p className="truncate text-[12px] text-ink-3">{me.email}</p>
        </div>
      </div>
    </aside>
  );
}

export function AppShell() {
  const { openComposer, composer } = useUi();
  const location = useLocation();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]') || event.metaKey || event.ctrlKey) return;
      if (event.key === 'n' && !composer && !document.querySelector('[role="dialog"]')) {
        event.preventDefault();
        openComposer();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openComposer, composer]);

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <Sidebar />
      <main key={location.pathname} className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <TabBar />
      <TaskSheet />
      <Composer />
      <ExpertSheet />
    </div>
  );
}
