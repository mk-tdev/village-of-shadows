"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
  disabledReason?: string;
}

type SelectProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
};

export function Select({
  value,
  options,
  onChange,
  placeholder = "Select...",
  ariaLabel,
  disabled = false,
  className = "",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const enabledIndexes = options
    .map((option, index) => option.disabled ? -1 : index)
    .filter((index) => index >= 0);

  const focusOption = (index: number) => {
    if (enabledIndexes.length === 0) return;
    const clampedIndex = Math.max(0, Math.min(index, options.length - 1));
    const exactEnabled = !options[clampedIndex]?.disabled ? clampedIndex : null;
    const nextEnabled = enabledIndexes.find((enabledIndex) => enabledIndex >= clampedIndex) ?? enabledIndexes[0];
    const safeIndex = exactEnabled ?? nextEnabled;
    setActiveIndex(safeIndex);
    window.requestAnimationFrame(() => optionRefs.current[safeIndex]?.focus());
  };

  const openMenu = (preferredIndex = selectedIndex >= 0 ? selectedIndex : 0) => {
    if (disabled || enabledIndexes.length === 0) return;
    setOpen(true);
    focusOption(preferredIndex);
  };

  const closeMenu = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    closeMenu(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div className={`dropdown${open ? " is-open" : ""}${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dropdown-trigger"
        onClick={() => open ? closeMenu() : openMenu()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(event.key === "ArrowUp" ? options.length - 1 : (selectedIndex >= 0 ? selectedIndex : 0));
          }
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <span className="dropdown-sigil" aria-hidden="true">◈</span>
        <span className={`dropdown-trigger-copy${selected ? "" : " dropdown-placeholder"}`}>
          <span>{selected ? selected.label : placeholder}</span>
          {selected?.sublabel ? <small>{selected.sublabel}</small> : null}
        </span>
        <svg className={`dropdown-chevron${open ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="dropdown-menu" id={listboxId} role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <button
              ref={(node) => { optionRefs.current[index] = node; }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled ? "true" : undefined}
              tabIndex={option.disabled ? -1 : index === activeIndex ? 0 : -1}
              key={option.value}
              className={`dropdown-item${option.value === value ? " selected" : ""}${option.disabled ? " disabled" : ""}`}
              disabled={option.disabled}
              title={option.disabledReason}
              onClick={() => choose(option)}
              onMouseEnter={() => setActiveIndex(index)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  const next = enabledIndexes.find((enabledIndex) => enabledIndex > index) ?? enabledIndexes[0];
                  focusOption(next);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  const previous = [...enabledIndexes].reverse().find((enabledIndex) => enabledIndex < index) ?? enabledIndexes[enabledIndexes.length - 1];
                  focusOption(previous);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  focusOption(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  focusOption(options.length - 1);
                } else if (event.key === "Escape" || event.key === "Tab") {
                  if (event.key === "Escape") event.preventDefault();
                  closeMenu(event.key === "Escape");
                } else if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (!option.disabled) choose(option);
                }
              }}
            >
              <span className="dropdown-item-mark" aria-hidden="true">{option.value === value ? "◆" : "◇"}</span>
              <span className="dropdown-item-copy">
                <span>{option.label}</span>
                {option.disabledReason ? <small className="dropdown-item-sublabel">{option.disabledReason}</small> : option.sublabel ? <small className="dropdown-item-sublabel">{option.sublabel}</small> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
