import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import type { ComponentType, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { cx } from './ui';

/** Tesla-style list row: line icon, title, live subtitle, chevron. */
export function NavRow({
  icon: Icon,
  title,
  subtitle,
  to,
  onClick,
  trailing,
  tone,
  badge,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  subtitle?: ReactNode;
  to?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  tone?: string;
  badge?: number;
}) {
  const body = (
    <>
      <span className={cx('relative flex size-6 shrink-0 items-center justify-center text-ink-2', tone)}>
        <Icon className="size-[22px]" strokeWidth={1.6} />
        {badge ? (
          <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-overdue px-1 text-[10px] font-bold text-white tabular">
            {badge > 9 ? '9+' : badge}
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] leading-tight font-medium text-ink">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-[13px] text-ink-3">{subtitle}</span>}
      </span>
      {trailing}
      <ChevronRight className="size-[18px] shrink-0 text-ink-3/70" strokeWidth={1.8} />
    </>
  );
  const className =
    'group flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-surface-2 active:bg-sunken';
  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

/** Round quick-action button with a caption (the row under the car in the Tesla app). */
export function QuickAction({
  icon: Icon,
  label,
  onClick,
  to,
  accent,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  onClick?: () => void;
  to?: string;
  accent?: boolean;
}) {
  const circle = (
    <motion.span
      whileTap={{ scale: 0.9 }}
      className={cx(
        'flex size-[54px] items-center justify-center rounded-full transition-colors',
        accent ? 'bg-accent text-on-accent' : 'bg-sunken text-ink group-hover:bg-elevated dark:group-hover:bg-line-strong',
      )}
    >
      <Icon className="size-[22px]" strokeWidth={1.7} />
    </motion.span>
  );
  const inner = (
    <>
      {circle}
      <span className="text-[11.5px] font-medium text-ink-2">{label}</span>
    </>
  );
  const className = 'group flex w-[72px] flex-col items-center gap-1.5 outline-none';
  return to ? (
    <Link to={to} className={className} aria-label={label}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className} aria-label={label}>
      {inner}
    </button>
  );
}

/** Goes back within the app when there is history, otherwise home. */
export function useBack() {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (location.key !== 'default' && window.history.length > 1) navigate(-1);
    else navigate('/');
  };
}

/** Header of a page pushed over the home screen: back chevron, title, actions. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  const back = useBack();
  return (
    <header className="sticky top-0 z-20 -mx-4 bg-canvas/85 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2 backdrop-blur-xl lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-10 lg:backdrop-blur-none">
      <div className="flex h-11 items-center gap-1">
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="-ml-2 flex size-10 items-center justify-center rounded-full text-ink transition hover:bg-sunken active:scale-95 lg:hidden"
        >
          <ChevronLeft className="size-6" strokeWidth={1.8} />
        </button>
        <div className="flex-1" />
        {actions}
      </div>
      <h1 className="mt-1 font-display text-[30px] leading-tight font-semibold tracking-[-0.02em] text-ink">{title}</h1>
      {subtitle && <p className="mt-0.5 text-[14px] text-ink-3">{subtitle}</p>}
    </header>
  );
}
