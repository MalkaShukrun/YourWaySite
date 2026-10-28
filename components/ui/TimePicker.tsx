"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, Clock } from "lucide-react";
import { usePopover } from "./usePopover";
import { iconProps } from "@/components/ui/icon";

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

type Props = {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  label: string; // accessible name
  icon?: ReactNode;
  disabled?: boolean;
  placeholder?: string; // shown while value is ""
};

// The design's time field: a trigger like the dropdown and two scrolling
// columns (hours, then minutes in 5-minute steps). Used instead of the native
// <input type="time">, whose picker ignores the RTL layout.
export function TimePicker({ value, onChange, label, icon = <Clock {...iconProps} size={20} />, disabled = false, placeholder = "" }: Props) {
  const { open, setOpen, ref } = usePopover();
  // Nothing is highlighted while empty; the other part starts at 00.
  const [hour, minute] = value ? value.split(":") : ["", ""];
  const hoursRef = useRef<HTMLDivElement>(null);
  const minutesRef = useRef<HTMLDivElement>(null);

  // Center the selected hour and minute when the panel opens.
  useEffect(() => {
    if (!open) return;
    for (const column of [hoursRef.current, minutesRef.current]) {
      const selected = column?.querySelector<HTMLElement>(".selected");
      if (column && selected) column.scrollTop = selected.offsetTop - (column.clientHeight - selected.offsetHeight) / 2;
    }
  }, [open]);

  const minutes = !minute || MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort();

  return (
    <div className={`dropdown time-picker ${open ? "open" : ""}`} ref={ref}>
      <button
        type="button"
        className="input-shell dropdown-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${value || placeholder}`}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {icon}
        {value ? <span dir="ltr">{value}</span> : <span className="placeholder">{placeholder}</span>}
        <ChevronDown className="icon dropdown-chevron" size={16} strokeWidth={1.8} />
      </button>

      {open && (
        // ltr: hours on the left, minutes on the right, in the order the time reads ("06:10").
        <div className="dropdown-options time-panel" role="dialog" aria-label={label} dir="ltr">
          <div className="time-column">
            <small>שעה</small>
            <div ref={hoursRef} role="listbox" aria-label="שעה">
              {HOURS.map((h) => (
                <button key={h} type="button" role="option" aria-selected={h === hour} className={h === hour ? "selected" : ""} onClick={() => onChange(`${h}:${minute || "00"}`)}>
                  {h}
                </button>
              ))}
            </div>
          </div>
          <div className="time-column">
            <small>דקות</small>
            <div ref={minutesRef} role="listbox" aria-label="דקות">
              {minutes.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={m === minute}
                  className={m === minute ? "selected" : ""}
                  onClick={() => {
                    onChange(`${hour || "00"}:${m}`);
                    setOpen(false);
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
