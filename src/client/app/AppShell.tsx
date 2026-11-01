import { rankTasks } from '@shared/priority';
import { House, ListChecks, Plus, Settings, Target } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { NavLink, useLocation, useOutlet } from 'react-router';
import { LogoMark } from '../components/Logo';
import { Avatar, cx } from '../components/ui';
import { HomePage } from '../features/home/HomePage';
import { ExpertSheet } from '../features/maintenance/ExpertSheet';
import { Composer } from '../features/tasks/Composer';
import { TaskSheet } from '../features/tasks/TaskSheet';
import { useIsDesktop } from '../lib/media';
import { preloadHouseScene } from '../scene/HouseStage';
import { usePrefersReducedMotion } from '../lib/theme';
import { useAppData, useUi } from './context';

const NAV: { to: string; label: string; icon: ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/focus', label: 'Focus', icon: Target },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function useFocusCount(): number {
  const { tasks, today, me } = useAppData();
  return useMemo(
    () =>
      rankTasks(tasks, { today, userId: me.id }).filter(({ timing }) => timing.state === 'overdue' || timing.state === 'today')
        .length,
    [tasks, today, me.id],
  );
}

/** Slim icon rail on wide screens (phones navigate from the home panel instead). */
function Rail() {
  const { openComposer } = useUi();
  const { me } = useAppData();
  const focusCount = useFocusCount();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col items-center border-r border-line bg-canvas py-5 lg:flex">
      <LogoMark size={34} />
      <button
        type="button"
        onClick={() => openComposer()}
        aria-label="New task"
        title="New task (N)"
        className="mt-6 flex size-11 items-center justify-center rounded-full bg-accent text-on-accent transition hover:bg-accent-strong active:scale-95"
      >
        <Plus className="size-5" strokeWidth={2.2} />
      </button>
      <nav className="mt-6 flex flex-col items-center gap-1.5" aria-label="Main">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            title={item.label}
            className={({ isActive }) =>
              cx(
                'relative flex w-[62px] flex-col items-center gap-1 rounded-2xl py-2 text-[10.5px] font-medium transition-colors',
                isActive ? 'bg-sunken text-ink' : 'text-ink-3 hover:bg-surface-2 hover:text-ink-2',
              )
            }
          >
            <item.icon className="size-[21px]" strokeWidth={1.7} />
            {item.label}
            {item.to === '/focus' && focusCount > 0 && (
              <span className="absolute top-1 right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-overdue px-1 text-[10px] font-bold text-white tabular">
                {focusCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <NavLink to="/settings" className="mt-auto rounded-full ring-2 ring-line transition hover:ring-line-strong" aria-label={`${me.name} — settings`}>
        <Avatar member={me} size={34} decorative />
      </NavLink>
    </aside>
  );
}

export function AppShell() {
  const { openComposer, composer } = useUi();
  const location = useLocation();
  const outlet = useOutlet();
  const desktop = useIsDesktop();
  const reducedMotion = usePrefersReducedMotion();
  const onHome = location.pathname === '/';
  const page = useRef<HTMLElement>(null);
  // Once a page has slid over it, the home screen is hidden outright (it stays mounted).
  const [covered, setCovered] = useState(!onHome);
  // A deep link straight to a page (a notification, /tasks) doesn't pay for the 3D house until
  // the home screen is actually visited.
  const [homeVisited, setHomeVisited] = useState(onHome);
  if (onHome && !homeVisited) setHomeVisited(true);
  useEffect(() => {
    if (onHome) {
      setCovered(false);
      return;
    }
    const timer = window.setTimeout(() => setCovered(true), 450);
    return () => window.clearTimeout(timer);
  }, [onHome]);
  useEffect(() => {
    page.current?.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    preloadHouseScene();
  }, []);

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

  // Pages slide over the home screen like a navigation stack; the house stays mounted below so
  // coming back is instant (its render loop pauses while covered).
  const slide = desktop || reducedMotion ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } };

  return (
    <>
      <Rail />
      <div inert={!onHome} aria-hidden={onHome ? undefined : true} style={{ visibility: onHome || !covered ? undefined : 'hidden' }}>
        {homeVisited && <HomePage active={onHome} />}
      </div>
      <AnimatePresence initial={false}>
        {!onHome && (
          <motion.main
            ref={page}
            key="page"
            {...slide}
            transition={{ type: 'spring', stiffness: 380, damping: 40, mass: 0.9 }}
            className="fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-canvas shadow-[-24px_0_48px_-24px_rgb(0_0_0/0.6)] lg:left-[76px] lg:shadow-none"
          >
            {outlet}
          </motion.main>
        )}
      </AnimatePresence>
      <TaskSheet />
      <Composer />
      <ExpertSheet />
    </>
  );
}
