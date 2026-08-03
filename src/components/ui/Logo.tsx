import styles from "./Logo.module.css";

export type LogoVariant = "full" | "header" | "compact" | "icon";

interface LogoProps {
  /**
   * Which approved lockup to show:
   * - `full`    — symbol + wordmark + descriptor + tagline (large brand areas)
   * - `header`  — symbol + "MediFlow" wordmark, horizontal (desktop/tablet header)
   * - `compact` — same horizontal lockup, tuned for narrow headers
   * - `icon`    — symbol only (favicon-scale identity, mobile mark)
   */
  variant?: LogoVariant;
  /**
   * Control size. For `icon`/`header`/`compact` this is the rendered HEIGHT in
   * px; for `full` it is the rendered WIDTH in px. Aspect ratio is always
   * preserved from the source artwork, so the logo never stretches or clips.
   */
  size?: number;
  /**
   * Accessible text. Defaults to "MediFlow AI". Pass an empty string when the
   * logo sits inside an already-labelled link (e.g. a dashboard home link) so
   * assistive tech does not announce it twice.
   */
  alt?: string;
  className?: string;
  /** Hint the browser to load this image eagerly (e.g. above-the-fold brand). */
  priority?: boolean;
}

/**
 * MediFlow logo — renders the APPROVED artwork extracted from MediFlow.pdf
 * (see public/branding/). The old programmatically-drawn circular mark has been
 * retired; this component is the single source for brand imagery across the app.
 *
 * Colours and proportions are never altered here (no CSS filters, no forced
 * width+height that would distort the ratio). Intrinsic dimensions are set on
 * the <img> so the layout reserves the right box before the image loads.
 */
const SOURCES: Record<LogoVariant, { src: string; ratio: number }> = {
  // ratio = width / height of the source asset
  full: { src: "/branding/mediflow-full.png", ratio: 820 / 865 },
  header: { src: "/branding/mediflow-lockup.png", ratio: 1062 / 240 },
  compact: { src: "/branding/mediflow-lockup.png", ratio: 1062 / 240 },
  icon: { src: "/branding/mediflow-symbol.png", ratio: 1 },
};

const DEFAULT_SIZE: Record<LogoVariant, number> = {
  full: 320, // width
  header: 34, // height
  compact: 28, // height
  icon: 28, // height
};

export function Logo({
  variant = "header",
  size,
  alt = "MediFlow AI",
  className,
  priority,
}: LogoProps) {
  const { src, ratio } = SOURCES[variant];
  const s = size ?? DEFAULT_SIZE[variant];

  // `full` is sized by width; the lockups/icon are sized by height.
  const width = variant === "full" ? s : Math.round(s * ratio);
  const height = variant === "full" ? Math.round(s / ratio) : s;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- static, pre-sized brand asset; next/image adds no benefit here and complicates SSR/client dual use
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={`${styles.logo} ${variant === "full" ? styles.full : styles.lockup} ${className ?? ""}`}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
    />
  );
}
