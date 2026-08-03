"use client";

import { useId, useState } from "react";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { EyeIcon, EyeOffIcon } from "@/components/ui/Icons";
import styles from "./authForm.module.css";

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

/**
 * Password input with an accessible show/hide toggle. The toggle sits inside
 * the single field border (no wrapper ring, no double border); toggling only
 * swaps the input `type`, so browser password managers and autofill keep
 * working. The button is labelled and reflects state with `aria-pressed`.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  error,
  disabled,
  required = true,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const toggleId = useId();

  return (
    <FormField label={label} htmlFor={id} error={error} required={required}>
      {({ describedBy }) => (
        <div className={styles.passwordWrap}>
          <Input
            id={id}
            type={visible ? "text" : "password"}
            className={styles.passwordInput}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            invalid={Boolean(error)}
            aria-describedby={describedBy}
            autoComplete={autoComplete}
            disabled={disabled}
          />
          <button
            type="button"
            id={toggleId}
            className={styles.passwordToggle}
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            aria-label={visible ? "Hide password" : "Show password"}
            title={visible ? "Hide password" : "Show password"}
            disabled={disabled}
          >
            {visible ? (
              <EyeOffIcon aria-hidden="true" width={18} height={18} />
            ) : (
              <EyeIcon aria-hidden="true" width={18} height={18} />
            )}
          </button>
        </div>
      )}
    </FormField>
  );
}
