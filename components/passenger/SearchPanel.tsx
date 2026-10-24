"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Car, Check, ChevronDown, Clock, MapPin, Repeat, Search } from "lucide-react";
import type { RideGroup, RideKind, TimeWindow } from "@/lib/ride-types";
import { TIME_WINDOWS, groupLabel } from "@/lib/ride-types";

type Filters = { groupId?: string; date?: string; kind?: RideKind; time?: TimeWindow };
const iconProps = { className: "icon", strokeWidth: 1.8 } as const;

// Smart filter bar (SRS §4.1): group, date, departure window, ride type.
export function SearchPanel({ groups, initial, today }: { groups: RideGroup[]; initial: Filters; today: string }) {
  const router = useRouter();
  const [groupId, setGroupId] = useState(initial.groupId ?? "");
  const [date, setDate] = useState(initial.date ?? "");
  const [time, setTime] = useState<string>(initial.time ?? "");
  const [kind, setKind] = useState<string>(initial.kind ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const options = [{ id: "", label: "כל המסלולים" }, ...groups.map((g) => ({ id: g.id, label: groupLabel(g.origin, g.destination) }))];
  const selected = options.find((o) => o.id === groupId) ?? options[0];

  function submit(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (groupId) params.set("group", groupId);
    if (date) params.set("date", date);
    if (time) params.set("time", time);
    if (kind) params.set("kind", kind);
    const query = params.toString();
    router.push(query ? `/?${query}` : "/");
  }

  return (
    <section className="search-card">
      <div className="search-heading">
        <div>
          <span className="eyebrow">לאן נוסעת היום?</span>
          <h2>מצאי את הנסיעה שמתאימה לך</h2>
        </div>
        <div className="search-art" aria-hidden="true">
          <Car {...iconProps} size={32} />
          <span className="road-dot one"></span>
          <span className="road-dot two"></span>
        </div>
      </div>
      <form className="filters" onSubmit={submit}>
        <div className="field field-wide">
          <span>מסלול</span>
          <div className={`route-select ${menuOpen ? "open" : ""}`} ref={menuRef}>
            <button
              className="input-shell route-select-trigger"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MapPin {...iconProps} size={20} />
              <span>{selected.label}</span>
              <ChevronDown {...iconProps} size={16} />
            </button>
            {menuOpen && (
              <div className="route-options" role="listbox" aria-label="בחירת מסלול">
                {options.map((option) => (
                  <button
                    key={option.id || "all"}
                    type="button"
                    role="option"
                    aria-selected={selected.id === option.id}
                    className={selected.id === option.id ? "selected" : ""}
                    onClick={() => {
                      setGroupId(option.id);
                      setMenuOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {selected.id === option.id && <Check {...iconProps} size={16} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <label className="field">
          <span>תאריך</span>
          <div className="input-shell">
            <CalendarDays {...iconProps} size={20} />
            <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} aria-label="תאריך" />
          </div>
        </label>
        <label className="field">
          <span>שעת יציאה</span>
          <div className="input-shell">
            <Clock {...iconProps} size={20} />
            <select value={time} onChange={(e) => setTime(e.target.value)}>
              <option value="">הכל</option>
              {Object.entries(TIME_WINDOWS).map(([key, w]) => (
                <option key={key} value={key}>{w.label}</option>
              ))}
            </select>
            <ChevronDown {...iconProps} size={16} />
          </div>
        </label>
        <label className="field">
          <span>סוג נסיעה</span>
          <div className="input-shell">
            <Repeat {...iconProps} size={20} />
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">כל הנסיעות</option>
              <option value="recurring">נסיעות קבועות</option>
              <option value="one_time">נסיעות חד־פעמיות</option>
            </select>
            <ChevronDown {...iconProps} size={16} />
          </div>
        </label>
        <button type="submit" className="btn btn-primary search-button">
          <Search {...iconProps} size={20} />
          חיפוש נסיעה
        </button>
      </form>
    </section>
  );
}
