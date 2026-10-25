"use client";

import { useState, type ReactNode } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { he } from "date-fns/locale";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { usePopover } from "./usePopover";
import { iconProps } from "@/components/ui/icon";

const WEEKDAY_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

type Props = {
  value: string; // "YYYY-MM-DD", or "" for no date
  onChange: (value: string) => void;
  label: string; // accessible name
  today: string; // Israel's today from the server ("YYYY-MM-DD")
  min?: string; // earliest selectable day
  placeholder?: string;
  clearable?: boolean; // show "ניקוי" to reset to ""
  display?: string; // custom text for the selected date
  button?: boolean; // render the trigger as a secondary button (dashboard)
  icon?: ReactNode;
};

// The design's date field: a trigger like the dropdown and a Hebrew,
// Sunday-first month calendar. Dates are plain "YYYY-MM-DD" strings, so no
// time-zone shifts.
export function DatePicker({
  value,
  onChange,
  label,
  today,
  min,
  placeholder = "בחרי תאריך",
  clearable = false,
  display,
  button = false,
  icon = <CalendarDays {...iconProps} size={20} />,
}: Props) {
  const { open, setOpen, ref } = usePopover();
  const [month, setMonth] = useState(() => startOfMonth(parseISO(value || min || today)));

  const days = eachDayOfInterval({
    start: startOfWeek(month, { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  });
  const canGoBack = !min || month > startOfMonth(parseISO(min));
  const text = value ? (display ?? format(parseISO(value), "d בMMMM yyyy", { locale: he })) : placeholder;

  function toggle() {
    if (!open) setMonth(startOfMonth(parseISO(value || min || today)));
    setOpen(!open);
  }

  function pick(day: string) {
    onChange(day);
    setOpen(false);
  }

  return (
    <div className={`dropdown date-picker ${open ? "open" : ""}`} ref={ref}>
      <button
        type="button"
        className={button ? "btn btn-secondary dropdown-trigger date-picker-button" : "input-shell dropdown-trigger"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${text}`}
        onClick={toggle}
      >
        {icon}
        <span className={value ? "" : "placeholder"}>{text}</span>
        {!button && <ChevronDown className="icon dropdown-chevron" size={16} strokeWidth={1.8} />}
      </button>

      {open && (
        <div className="dropdown-options calendar" role="dialog" aria-label={label}>
          <div className="calendar-head">
            <button type="button" onClick={() => setMonth(addMonths(month, -1))} disabled={!canGoBack} aria-label="החודש הקודם">
              <ChevronRight {...iconProps} size={18} />
            </button>
            <strong>{format(month, "LLLL yyyy", { locale: he })}</strong>
            <button type="button" onClick={() => setMonth(addMonths(month, 1))} aria-label="החודש הבא">
              <ChevronLeft {...iconProps} size={18} />
            </button>
          </div>

          <div className="calendar-grid">
            {WEEKDAY_LETTERS.map((letter) => <span key={letter} className="calendar-weekday">{letter}</span>)}
            {days.map((date) => {
              const day = format(date, "yyyy-MM-dd");
              const disabled = Boolean(min && day < min);
              const classes = [
                day === value && "selected",
                day === today && "today",
                !isSameMonth(date, month) && "outside",
              ].filter(Boolean).join(" ");
              return (
                <button
                  key={day}
                  type="button"
                  className={classes}
                  disabled={disabled}
                  aria-pressed={day === value}
                  aria-label={format(date, "EEEE, d בMMMM yyyy", { locale: he })}
                  onClick={() => pick(day)}
                >
                  {format(date, "d")}
                </button>
              );
            })}
          </div>

          {clearable && value && (
            <div className="calendar-foot">
              <button type="button" className="muted" onClick={() => pick("")}>ניקוי</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
