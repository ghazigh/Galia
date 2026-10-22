import { motion } from 'motion/react';
import { cx } from './ui';

/** Round completion control with a drawn check mark. */
export function CheckCircle({
  checked,
  onToggle,
  tone = 'default',
  label,
  size = 26,
}: {
  checked: boolean;
  onToggle: () => void;
  tone?: 'default' | 'overdue' | 'fire';
  label: string;
  size?: number;
}) {
  const ring =
    tone === 'overdue' ? 'border-overdue' : tone === 'fire' ? 'border-fire' : 'border-line-strong hover:border-ink-3';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className="group relative -m-2 shrink-0 p-2"
    >
      <motion.span
        className={cx(
          'flex items-center justify-center rounded-full border-2 transition-colors',
          checked ? 'border-ok bg-ok' : ring,
        )}
        style={{ width: size, height: size }}
        whileTap={{ scale: 0.82 }}
        animate={checked ? { scale: [1, 1.18, 1] } : { scale: 1 }}
        transition={{ duration: 0.32 }}
      >
        <svg viewBox="0 0 24 24" className="size-[62%]" aria-hidden>
          <motion.path
            d="M5 12.5l4.2 4.2L19 7"
            fill="none"
            stroke="white"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          />
        </svg>
      </motion.span>
    </button>
  );
}
