"use client";

import { useEffect, useRef, useState } from "react";
import type { SelectOption } from "./Select";

/** A styled text input with a suggestion dropdown -- unlike Select, any
 * value can be typed (model names aren't a closed set: plan §8 wants "any
 * model the account/endpoint supports", suggestions are just convenience). */
export function Combobox({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(value.toLowerCase()) || o.value.toLowerCase().includes(value.toLowerCase())
  );

  return (
    <div className="dropdown" ref={rootRef}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => onChange(e.target.value)}
      />
      {open && filtered.length > 0 && (
        <div className="dropdown-menu">
          {filtered.map((opt) => (
            <button
              type="button"
              key={opt.value}
              className={`dropdown-item ${opt.value === value ? "selected" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span>{opt.label}</span>
              {opt.sublabel && <span className="dropdown-item-sublabel">{opt.sublabel}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
