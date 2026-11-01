/** The moon's current phase as a small icon: lit part drawn from the illuminated fraction. */
export function MoonIcon({ phase, size = 18, className }: { phase: number; size?: number; className?: string }) {
  const r = 10;
  // Terminator: an ellipse whose width follows the phase. Waxing lights the right side
  // (as seen from the northern hemisphere), waning the left.
  const p = ((phase % 1) + 1) % 1;
  const waxing = p < 0.5;
  const k = Math.cos(2 * Math.PI * p); // 1 new, 0 quarter, -1 full
  const rx = Math.abs(k) * r;
  const litRight = waxing;
  const outer = `M 12 2 A ${r} ${r} 0 0 ${litRight ? 1 : 0} 12 22`;
  const inner = `A ${rx} ${r} 0 0 ${(k > 0) === litRight ? 0 : 1} 12 2`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r={r} fill="currentColor" opacity={0.18} />
      {p > 0.02 && p < 0.98 && <path d={`${outer} ${inner} Z`} fill="currentColor" />}
      <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />
    </svg>
  );
}
