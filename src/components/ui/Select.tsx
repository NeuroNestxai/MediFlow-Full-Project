import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import inputStyles from "./Input.module.css";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <select
      className={cn(inputStyles.input, invalid && inputStyles.invalid, className)}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
}
