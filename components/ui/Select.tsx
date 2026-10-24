"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string };

type Props = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  label: string; // accessible name for the list
  icon?: ReactNode; // shown before the selected value
  prefix?: ReactNode; // inline caption inside the trigger (compact variant)
  compact?: boolean; // small pill, e.g. the payments month filter
};

// The design's dropdown: a field-style trigger and a floating list with the
// selected option highlighted in lime. Used instead of the native <select>.
export function Select({ value, options, onChange, label, icon, prefix, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className={`dropdown ${compact ? "compact" : ""} ${open ? "open" : ""}`} ref={ref}>
      <button
        className={`dropdown-trigger ${compact ? "" : "input-shell"}`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${selected?.label ?? ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        {prefix && <small>{prefix}</small>}
        <span>{selected?.label}</span>
        <ChevronDown className="icon dropdown-chevron" size={16} strokeWidth={1.8} />
      </button>
      {open && (
        <div className="dropdown-options" role="listbox" aria-label={label}>
          {options.map((option) => {
            const isSelected = option.value === selected?.value;
            return (
              <button
                key={option.value || "all"}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={isSelected ? "selected" : ""}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {isSelected && <Check className="icon" size={16} strokeWidth={1.8} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
