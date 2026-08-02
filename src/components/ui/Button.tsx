import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";

interface SharedProps {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export interface ButtonAsButtonProps
  extends SharedProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof SharedProps> {
  href?: undefined;
}

export interface ButtonAsLinkProps extends SharedProps {
  /** When provided, Button renders as a single <a> (via next/link) instead
   * of a <button> — this is the fix for the "Link wrapping Button" anti-
   * pattern (two nested interactive elements, which is both invalid HTML
   * and confusing for keyboard/screen-reader users, who would otherwise
   * tab to the link and then tab again to a button that does nothing on
   * its own). Use `href` for navigation, and leave it unset for an
   * in-page action (the native <button> path below). */
  href: string;
}

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

/**
 * Button — mirrors the Figma "Button" component set
 * (Variant × Default/Hover/Focus/Disabled).
 *
 * Renders exactly one interactive element: a native <button> for in-page
 * actions, or a single <Link> (styled identically) when `href` is passed —
 * never a <button> nested inside an <a>.
 */
export function Button(props: ButtonProps) {
  // Pull out the component's own props (variant/fullWidth/leadingIcon/href) so
  // they are never forwarded to a DOM element. `rest` holds only genuine
  // native attributes (onClick, type, disabled, aria-*, …).
  const { variant = "primary", fullWidth, leadingIcon, className, children, href, ...rest } =
    props;
  const classes = cn(styles.button, styles[variant], fullWidth && styles.fullWidth, className);

  const inner = (
    <>
      {leadingIcon ? (
        <span className={styles.icon} aria-hidden="true">
          {leadingIcon}
        </span>
      ) : null}
      <span>{children}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {inner}
      </Link>
    );
  }

  const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button className={classes} {...buttonProps}>
      {inner}
    </button>
  );
}
