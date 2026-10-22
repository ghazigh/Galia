/** Isometric house mark used for the app icon and auth screens. */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6d6be8" />
          <stop offset="100%" stopColor="#4743c6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#logo-bg)" />
      <g transform="translate(0 -2.5)">
        <polygon points="23,15 41,25 50,30 32,20" fill="#ffffff" opacity="0.72"/>
        <polygon points="14,30 32,40 32,54 14,44" fill="#ffffff" opacity="0.6"/>
        <polygon points="32,54 50,44 50,30 41,25 32,40" fill="#ffffff" opacity="0.38"/>
        <polygon points="14,30 32,40 41,25 23,15" fill="#ffffff" opacity="0.96"/>
        <polygon points="19.4,39 23.9,41.5 23.9,49.5 19.4,47" fill="#4743c6" opacity="0.55"/>
        <polygon points="40.1,39.5 45.5,36.5 45.5,41.5 40.1,44.5" fill="#ffd27a"/>
      </g>
    </svg>
  );
}
