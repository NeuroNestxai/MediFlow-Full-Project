/** Joins truthy class names together. Small local replacement for `clsx`
 * so the foundation stage has zero extra runtime dependencies. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
