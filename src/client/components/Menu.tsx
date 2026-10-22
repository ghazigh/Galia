import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from './ui';

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  hint?: ReactNode;
}

/** Small anchored popover menu. */
export function Menu({
  trigger,
  items,
  align = 'left',
  side = 'bottom',
  footer,
}: {
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean }) => ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  side?: 'top' | 'bottom';
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      {trigger({ onClick: () => setOpen((v) => !v), 'aria-expanded': open })}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: side === 'top' ? 6 : -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className={cx(
              'absolute z-30 min-w-52 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-float',
              align === 'right' ? 'right-0' : 'left-0',
              side === 'top' ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top',
            )}
          >
            {items.map((item, i) => (
              <button
                key={i}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium transition hover:bg-sunken',
                  item.danger ? 'text-overdue' : 'text-ink',
                )}
              >
                {item.icon && <span className="text-ink-3">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="text-[12px] text-ink-3">{item.hint}</span>}
              </button>
            ))}
            {footer}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
