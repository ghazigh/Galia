import { CheckCircle2, CircleAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from './ui';

interface ToastOptions {
  action?: { label: string; onClick: () => void };
  tone?: 'success' | 'error' | 'info';
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

const ToastContext = createContext<(message: string, options?: ToastOptions) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      // One toast at a time keeps undo unambiguous.
      setToasts([{ id, message, ...options }]);
      window.setTimeout(() => dismiss(id), options.duration ?? (options.action ? 5000 : 3200));
    },
    [dismiss],
  );

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}
        aria-live="polite"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink py-2.5 pr-2 pl-3.5 text-[14px] font-medium text-canvas shadow-float lg:mb-[-60px]"
            >
              {t.tone === 'error' ? (
                <CircleAlert className="size-[18px] shrink-0 text-overdue" />
              ) : t.tone === 'success' ? (
                <CheckCircle2 className="size-[18px] shrink-0 text-ok" />
              ) : null}
              <span className="min-w-0 flex-1">{t.message}</span>
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                  className={cx('rounded-xl px-3 py-1.5 text-[13px] font-bold text-accent-strong hover:bg-white/10')}
                >
                  {t.action.label}
                </button>
              )}
              {!t.action && <span className="w-1.5" />}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
