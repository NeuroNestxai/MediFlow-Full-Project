import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import styles from "./IconButton.module.css";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  /** Required — icon-only buttons must have an accessible name. */
  "aria-label": string;
  variant?: "default" | "subtle";
}

export function IconButton({ icon, variant = "default", className, ...rest }: IconButtonProps) {
  return (
    <button className={cn(styles.iconButton, styles[variant], className)} type="button" {...rest}>
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}
