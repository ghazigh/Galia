import { X } from 'lucide-react';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '../lib/media';
import { cx, IconButton } from './ui';

let openSheets = 0;

function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    openSheets += 1;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      openSheets -= 1;
      if (openSheets === 0) document.documentElement.style.overflow = '';
    };
  }, [active]);
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Shown left of the close button in the header. */
  headerAction?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Fill most of the screen on phones (forms, long content). */
  tall?: boolean;
  label?: string;
}

/** Bottom sheet on phones (drag down to dismiss), side panel on desktop. */
export function Sheet({ open, onClose, title, headerAction, footer, children, tall, label }: SheetProps) {
  const wide = useMediaQuery('(min-width: 768px)');
  const drag = useDragControls();
  const panel = useRef<HTMLDivElement>(null);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    window.setTimeout(() => panel.current?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 700) onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-[rgb(20_18_14/0.32)] backdrop-blur-[2px] dark:bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={label ?? (typeof title === 'string' ? title : undefined)}
            tabIndex={-1}
            className={cx(
              'absolute flex flex-col bg-surface shadow-sheet outline-none',
              wide
                ? 'top-3 right-3 bottom-3 w-[440px] rounded-3xl'
                : cx('inset-x-0 bottom-0 rounded-t-[28px] pb-safe', tall ? 'h-[92dvh]' : 'max-h-[92dvh]'),
            )}
            initial={wide ? { x: 480, opacity: 0.6 } : { y: '100%' }}
            animate={wide ? { x: 0, opacity: 1 } : { y: 0 }}
            exit={wide ? { x: 480, opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag={wide ? false : 'y'}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
          >
            <div
              className={cx('shrink-0 touch-none', wide ? 'pt-3' : 'pt-2')}
              onPointerDown={(event) => !wide && drag.start(event)}
            >
              {!wide && <div className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-line-strong" />}
              <div className="flex items-center gap-2 px-5 pt-1 pb-2">
                <div className="min-w-0 flex-1 font-display text-[19px] font-semibold tracking-tight text-ink">{title}</div>
                {headerAction}
                <IconButton label="Close" onClick={onClose} className="-mr-2">
                  <X className="size-5" />
                </IconButton>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
            {footer && <div className="shrink-0 border-t border-line px-5 pt-3 pb-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
