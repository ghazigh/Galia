import type { HouseHealth, ZoneSummary } from '@shared/status';
import type { ZoneId } from '@shared/types';
import { Flame } from 'lucide-react';
import { useAppData } from '../../app/context';
import { Sheet } from '../../components/Sheet';
import { cx } from '../../components/ui';
import { HealthRing } from './HealthRing';
import { HEALTH_DOT, HEALTH_RANK, zoneStatus } from './panels';

export function HealthSheet({
  open,
  onClose,
  health,
  summaries,
  onZone,
}: {
  open: boolean;
  onClose: () => void;
  health: HouseHealth;
  summaries: Record<ZoneId, ZoneSummary>;
  onZone: (zone: ZoneId) => void;
}) {
  const { zoneLabel } = useAppData();
  const rooms = Object.values(summaries)
    .filter((s) => s.open > 0)
    .sort((a, b) => HEALTH_RANK[b.health] - HEALTH_RANK[a.health] || b.open - a.open);
  return (
    <Sheet open={open} onClose={onClose} title="House health" label="House health">
      <div className="pb-4">
        <div className="flex items-center gap-5 rounded-2xl bg-sunken/60 p-5">
          <HealthRing health={health} size={92} showLabel={false} />
          <div>
            <p className="font-display text-[24px] leading-tight font-semibold tracking-[-0.02em] text-ink">{health.label}</p>
            <p className="mt-1 text-[13px] text-ink-3">
              {health.overdue} overdue · {health.dueSoon} due soon
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
              Scored from shared maintenance: overdue items cost the most, fire safety and critical work weigh double.
            </p>
          </div>
        </div>
        <p className="eyebrow mt-6 px-1 text-ink-3">By room</p>
        <ul className="mt-2">
          {rooms.map((s) => {
            const urgent = s.overdue + s.today + s.soon;
            return (
              <li key={s.zoneId}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onZone(s.zoneId);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition hover:bg-surface-2"
                >
                  <span className={cx('size-2.5 shrink-0 rounded-full', s.health === 'ok' ? 'bg-ok/60' : HEALTH_DOT[s.health])} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[15px] font-medium text-ink">
                      {zoneLabel(s.zoneId)}
                      {s.fireOverdue && <Flame className="size-3.5 text-fire" />}
                    </span>
                    <span className="block truncate text-[12.5px] text-ink-3">{zoneStatus(s, '')}</span>
                  </span>
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-line" aria-hidden>
                    <span
                      className={cx('block h-full rounded-full', s.health === 'ok' ? 'bg-ok' : HEALTH_DOT[s.health])}
                      style={{ width: `${Math.max(8, Math.min(100, ((s.open - urgent) / s.open) * 100))}%` }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}
