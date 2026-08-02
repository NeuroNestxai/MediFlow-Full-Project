const PALETTES: Record<1 | 2 | 3 | 4, { bg: string; fg: string }> = {
  1: { bg: "#E9EFF7", fg: "#4A6FB0" },
  2: { bg: "#EFEBF9", fg: "#7458B0" },
  3: { bg: "#E6F4F4", fg: "#0A767B" },
  4: { bg: "#FBECE9", fg: "#D96A5C" },
};

export interface DoctorPortraitProps {
  palette: 1 | 2 | 3 | 4;
  size?: number;
}

/** Synthetic, non-photographic placeholder avatar — matches the Figma
 * "Doctor Portrait" component. Never a real photograph; always labeled
 * as a prototype portrait wherever it's used. */
export function DoctorPortrait({ palette, size = 52 }: DoctorPortraitProps) {
  const { bg, fg } = PALETTES[palette];
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" role="img" aria-label="Prototype doctor portrait">
      <circle cx="40" cy="40" r="40" fill={bg} />
      <circle cx="40" cy="34" r="15" fill={fg} opacity="0.85" />
      <path
        d="M10 82 C10 60 26 50 40 50 C54 50 70 60 70 82 Z"
        fill={fg}
        opacity="0.85"
      />
    </svg>
  );
}
