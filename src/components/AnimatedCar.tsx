/**
 * A purely CSS-animated car for marketing use — no audio, no per-frame JS,
 * just a looping light pattern at three paces so a visitor can "see" the
 * difference between Chill / Standard / Max before ever uploading a song.
 * Deliberately independent of CarPreview.tsx, which drives real show data.
 */
export type Pace = 'chill' | 'standard' | 'max';

interface Props {
  pace: Pace;
  className?: string;
  label?: string;
}

export function AnimatedCar({ pace, className, label }: Props) {
  return (
    <svg
      viewBox="0 0 300 560"
      className={`animated-car pace-${pace}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={label ?? `Animated Tesla, ${pace} intensity`}
    >
      <defs>
        <linearGradient id={`car-body-${pace}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff3b3f" />
          <stop offset="1" stopColor="#9c0c13" />
        </linearGradient>
      </defs>
      <path
        className="car-body"
        d="M150 26 C 210 26 238 44 240 90 L 242 470 C 242 500 232 520 150 522 C 68 520 58 500 58 470 L 60 90 C 62 44 90 26 150 26 Z"
        fill={`url(#car-body-${pace})`}
        stroke="#6e090f"
        strokeWidth="2"
      />
      <path d="M150 118 C 200 118 214 134 216 160 L 218 210 L 82 210 L 84 160 C 86 134 100 118 150 118 Z" fill="rgba(10,4,4,0.4)" />
      <rect x="82" y="216" width="136" height="150" rx="6" fill="rgba(10,4,4,0.22)" />

      <rect className="lamp side-left" x="66" y="46" width="50" height="4" rx="2" fill="#fff6e0" />
      <rect className="lamp side-right" x="184" y="46" width="50" height="4" rx="2" fill="#fff6e0" />
      <rect className="lamp side-left" x="66" y="56" width="26" height="14" rx="4" fill="#fff6e0" />
      <rect className="lamp side-right" x="208" y="56" width="26" height="14" rx="4" fill="#fff6e0" />
      <rect className="lamp side-left" x="66" y="74" width="50" height="4" rx="2" fill="#fff6e0" />
      <rect className="lamp side-right" x="184" y="74" width="50" height="4" rx="2" fill="#fff6e0" />
      <rect className="lamp turn-left" x="120" y="56" width="12" height="14" rx="3" fill="#ffb020" />
      <rect className="lamp turn-right" x="168" y="56" width="12" height="14" rx="3" fill="#ffb020" />

      <rect className="lamp tail-left" x="66" y="486" width="46" height="10" rx="3" fill="#ff5147" />
      <rect className="lamp tail-right" x="188" y="486" width="46" height="10" rx="3" fill="#ff5147" />
      <rect className="lamp brake" x="126" y="474" width="48" height="6" rx="3" fill="#ffffff" />
    </svg>
  );
}
