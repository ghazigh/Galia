import type { HouseHealth } from '@shared/status';
import { motion } from 'motion/react';

/** House health score as an animated ring. */
export function HealthRing({ health, size = 54, showLabel = true }: { health: HouseHealth; size?: number; showLabel?: boolean }) {
  const stroke = Math.max(4, size / 13);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = health.score >= 90 ? 'var(--color-ok)' : health.score >= 75 ? 'var(--color-soon)' : 'var(--color-overdue)';
  return (
    <div className="flex items-center gap-2.5" title={`House health: ${health.label}`}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-line-strong)" strokeWidth={stroke} />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - health.score / 100) }}
            transition={{ type: 'spring', stiffness: 60, damping: 18 }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-semibold text-ink tabular" style={{ fontSize: size * 0.3 }}>
          {health.score}
        </span>
      </div>
      {showLabel && (
        <div className="hidden leading-tight sm:block">
          <p className="eyebrow text-ink-3">House health</p>
          <p className="text-[13px] font-medium text-ink">{health.label}</p>
        </div>
      )}
    </div>
  );
}
