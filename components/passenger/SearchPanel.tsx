"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Car, Info, MapPin, Repeat, RotateCcw, Search } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { Select } from "@/components/ui/Select";
import { TimePicker } from "@/components/ui/TimePicker";
import type { RideGroup, RideKind } from "@/lib/ride-types";
import { groupLabel } from "@/lib/format";
import { carIconProps, iconProps } from "@/components/ui/icon";

const ROUTE_HINT = "להוספת מסלולי נסיעה מעיר לעיר יש ליצור קשר";

type Filters = { groupId?: string; date?: string; kind?: RideKind; from?: string; to?: string };

const KIND_OPTIONS = [
  { value: "", label: "כל הנסיעות" },
  { value: "recurring", label: "נסיעות קבועות" },
  { value: "one_time", label: "נסיעות חד־פעמיות" },
];

// Smart filter bar (SRS §4.1): group, date, departure time range, ride type.
export function SearchPanel({ groups, initial, today }: { groups: RideGroup[]; initial: Filters; today: string }) {
  const router = useRouter();
  const [groupId, setGroupId] = useState(initial.groupId ?? "");
  const [date, setDate] = useState(initial.date ?? "");
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");
  const [kind, setKind] = useState<string>(initial.kind ?? "");
  const groupOptions = [{ value: "", label: "כל המסלולים" }, ...groups.map((g) => ({ value: g.id, label: groupLabel(g.origin, g.destination) }))];

  function submit(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (groupId) params.set("group", groupId);
    if (date) params.set("date", date);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (kind) params.set("kind", kind);
    const query = params.toString();
    router.push(query ? `/?${query}` : "/");
  }

  const hasFilters = Boolean(
    groupId || date || from || to || kind || initial.groupId || initial.date || initial.from || initial.to || initial.kind,
  );

  function clear() {
    setGroupId("");
    setDate("");
    setFrom("");
    setTo("");
    setKind("");
    router.push("/");
  }

  return (
    <section className="search-card">
      <div className="search-heading">
        <div>
          <span className="eyebrow">לאן נוסעת היום?</span>
          <h2>מצאי את הנסיעה שמתאימה לך</h2>
        </div>
        <div className="search-art" aria-hidden="true">
          <Car {...carIconProps} size={32} />
          <span className="road-dot one"></span>
          <span className="road-dot two"></span>
        </div>
      </div>
      <form className="filters" onSubmit={submit}>
        <div className="field field-wide">
          <span className="field-label-hint">
            מסלול
            <span className="hint" tabIndex={0} aria-label={ROUTE_HINT}>
              <Info {...iconProps} size={16} />
              <span className="hint-bubble" role="tooltip">{ROUTE_HINT}</span>
            </span>
          </span>
          <Select label="מסלול" value={groupId} onChange={setGroupId} options={groupOptions} icon={<MapPin {...iconProps} size={20} />} />
        </div>
        <div className="field">
          <span>תאריך</span>
          <DatePicker label="תאריך" value={date} onChange={setDate} today={today} min={today} placeholder="כל השבוע" clearable />
        </div>
        <div className="field filter-time">
          <span>יציאה משעה</span>
          <TimePicker label="יציאה משעה" value={from} onChange={setFrom} placeholder="כל שעה" />
        </div>
        <div className="field filter-time">
          <span>עד שעה</span>
          <TimePicker label="עד שעה" value={to} onChange={setTo} placeholder="כל שעה" />
        </div>
        <div className="field">
          <span>סוג נסיעה</span>
          <Select label="סוג נסיעה" value={kind} onChange={setKind} options={KIND_OPTIONS} icon={<Repeat {...iconProps} size={20} />} />
        </div>
        <div className="search-actions">
          {hasFilters && (
            <button type="button" className="btn btn-secondary search-clear" onClick={clear}>
              <RotateCcw {...iconProps} size={18} />
              ניקוי
            </button>
          )}
          <button type="submit" className="btn btn-primary search-button">
            <Search {...iconProps} size={20} />
            חיפוש נסיעה
          </button>
        </div>
      </form>
    </section>
  );
}
