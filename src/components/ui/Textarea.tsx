import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import inputStyles from "./Input.module.css";
import styles from "./Textarea.module.css";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cn(inputStyles.input, styles.textarea, invalid && inputStyles.invalid, className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
