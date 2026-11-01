import { animate, motion, useMotionValueEvent, type MotionValue } from 'motion/react';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cx } from './ui';

export interface SnapSheetProps {
  /** Heights in pixels the sheet rests at, smallest first. */
  snaps: number[];
  snap: number;
  onSnapChange: (index: number) => void;
  /** Current height; owned by the parent so the scene and floor rail can follow it. */
  height: MotionValue<number>;
  /** Drag area at the top (grabber plus anything that should move the sheet). */
  header: ReactNode;
  children: ReactNode;
  reducedMotion?: boolean;
  className?: string;
  label?: string;
}

const SPRING = { type: 'spring', stiffness: 420, damping: 42, mass: 0.9 } as const;

/** Bottom sheet that snaps between heights; drag its header, or tap the grabber to cycle. */
export function SnapSheet({ snaps, snap, onSnapChange, height, header, children, reducedMotion, className, label }: SnapSheetProps) {
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean; samples: { y: number; t: number }[] } | null>(null);
  const suppressClick = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const target = snaps[Math.min(snap, snaps.length - 1)];

  useEffect(() => {
    const controls = animate(height, target, reducedMotion ? { duration: 0 } : SPRING);
    return () => controls.stop();
  }, [height, target, reducedMotion]);

  // Scrolled content returns to the top when the sheet collapses.
  useMotionValueEvent(height, 'change', (value) => {
    if (value <= snaps[0] + 4 && content.current) content.current.scrollTop = 0;
  });

  const nearest = (value: number, velocity: number) => {
    const projected = value - velocity * 0.18;
    let best = 0;
    for (let i = 1; i < snaps.length; i += 1) if (Math.abs(snaps[i] - projected) < Math.abs(snaps[best] - projected)) best = i;
    return best;
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    drag.current = { startY: event.clientY, startHeight: height.get(), moved: false, samples: [{ y: event.clientY, t: event.timeStamp }] };
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = event.clientY - d.startY;
    if (!d.moved && Math.abs(dy) < 7) return;
    if (!d.moved) {
      d.moved = true;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    const min = snaps[0] - 40;
    const max = snaps[snaps.length - 1] + 30;
    const next = d.startHeight - dy;
    // Rubber-band past the ends.
    height.set(next < min ? min - (min - next) * 0.25 : next > max ? max + (next - max) * 0.25 : next);
    d.samples.push({ y: event.clientY, t: event.timeStamp });
    if (d.samples.length > 5) d.samples.shift();
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    suppressClick.current = true;
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const velocity = last.t > first.t ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0;
    const index = nearest(height.get(), velocity);
    if (index === snap) void animate(height, snaps[index], reducedMotion ? { duration: 0 } : SPRING);
    else onSnapChange(index);
  };

  return (
    <motion.section
      aria-label={label}
      className={cx(
        'fixed inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-[26px] border-t border-white/[0.06] bg-canvas/95 shadow-sheet backdrop-blur-2xl dark:bg-canvas/[0.97]',
        className,
      )}
      style={{ height }}
    >
      <div
        className="shrink-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <button
          type="button"
          className="mx-auto flex h-6 w-16 items-center justify-center"
          aria-label={snap === snaps.length - 1 ? 'Collapse the panel' : 'Expand the panel'}
          onClick={() => onSnapChange(snap === snaps.length - 1 ? Math.max(0, snaps.length - 2) : snaps.length - 1)}
        >
          <span className="h-[5px] w-9 rounded-full bg-line-strong" />
        </button>
        {header}
      </div>
      <div ref={content} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(env(safe-area-inset-bottom),20px)]">
        {children}
      </div>
    </motion.section>
  );
}
