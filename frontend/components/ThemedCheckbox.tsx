"use client";

import type { ReactNode } from "react";

export function ThemedCheckbox({
  checked,
  onChange,
  children,
  disabled = false,
  ariaLabel,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`themed-checkbox${checked ? " is-checked" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="themed-checkbox-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M5.5 12.5l4.1 4.2L18.8 7.5" />
        </svg>
      </span>
      <span className="themed-checkbox-copy">{children}</span>
    </button>
  );
}
