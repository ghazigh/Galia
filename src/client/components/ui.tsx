import { initials } from '@shared/format';
import type { Member } from '@shared/types';
import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-strong shadow-[0_6px_18px_-8px_var(--color-accent)]',
  secondary: 'bg-surface text-ink border border-line hover:border-line-strong',
  ghost: 'text-ink-2 hover:bg-sunken',
  danger: 'bg-overdue-soft text-overdue hover:brightness-95',
  soft: 'bg-accent-soft text-accent hover:brightness-95',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-full',
  md: 'h-10 px-4 text-sm gap-2 rounded-full',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-2xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx(
        'inline-flex min-w-0 items-center justify-center font-semibold whitespace-nowrap transition-[background,box-shadow,transform,filter] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        // In a flex row a block button takes the remaining space instead of overflowing it.
        block && 'w-full flex-1',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition hover:bg-sunken active:scale-95',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Chip({
  selected,
  onClick,
  children,
  icon,
  className,
  tone,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  tone?: string;
}) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      className={cx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition',
        selected
          ? 'border-transparent bg-ink text-canvas'
          : tone ?? 'border-line bg-surface text-ink-2 hover:border-line-strong',
        onClick && 'active:scale-[0.97]',
        className,
      )}
    >
      {icon}
      {children}
    </Tag>
  );
}

export function Badge({ className, children, icon }: { className?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11.5px] font-semibold whitespace-nowrap',
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div role="tablist" className={cx('flex rounded-full bg-sunken p-1', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'relative flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors',
              active ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-surface shadow-card"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Avatar({ member, size = 28, ring }: { member: Pick<Member, 'name' | 'color'>; size?: number; ring?: boolean }) {
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white', ring && 'ring-2 ring-surface')}
      style={{ width: size, height: size, background: member.color, fontSize: Math.round(size * 0.4) }}
      title={member.name}
      aria-label={member.name}
    >
      {initials(member.name)}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40',
        checked ? 'bg-accent' : 'bg-line-strong',
      )}
    >
      <motion.span
        className="absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      />
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5" htmlFor={htmlFor}>
      <span className="text-[13px] font-semibold text-ink-2">{label}</span>
      {children}
      {error ? (
        <span className="text-[12.5px] font-medium text-overdue">{error}</span>
      ) : hint ? (
        <span className="text-[12.5px] text-ink-3">{hint}</span>
      ) : null}
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-3 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cx(inputClass, className)} {...props} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cx(inputClass, 'min-h-24 resize-y', className)} {...props} />;
});

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-ink-3', className)} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-sunken text-ink-2">{icon}</div>}
      <p className="font-display text-[17px] font-semibold tracking-tight text-ink">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-ink-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action, count }: { children: ReactNode; action?: ReactNode; count?: number }) {
  return (
    <div className="flex items-center justify-between px-1 pt-5 pb-2">
      <h3 className="text-[12px] font-bold tracking-[0.08em] text-ink-3 uppercase">
        {children}
        {count !== undefined && <span className="ml-1.5 text-ink-3/70 tabular">{count}</span>}
      </h3>
      {action}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-3xl border border-line/70 bg-surface shadow-card', className)}>{children}</div>;
}
