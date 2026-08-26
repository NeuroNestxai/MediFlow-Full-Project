import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import styles from "./Checkbox.module.css";

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Checkbox({ label, id, className, ...rest }: CheckboxProps) {
  return (
    <label className={cn(styles.wrapper, className)} htmlFor={id}>
      <input type="checkbox" id={id} className={styles.input} {...rest} />
      <span>{label}</span>
    </label>
  );
}
