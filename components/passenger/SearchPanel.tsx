"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Car, Clock, MapPin, Repeat, Search } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { Select } from "@/components/ui/Select";
import { TIME_WINDOWS, type RideGroup, type RideKind, type TimeWindow } from "@/lib/ride-types";
import { groupLabel } from "@/lib/format";

type Filters = { groupId?: string; date?: string; kind?: RideKind; time?: TimeWindow };
const iconProps = { className: "icon", strokeWidth: 1.8 } as const;

const TIME_OPTIONS = [
  { value: "", label: "הכל" },
  ...Object.entries(TIME_WINDOWS).map(([key, w]) => ({ value: key, label: w.label })),
];
const KIND_OPTIONS = [
  { value: "", label: "כל הנסיעות" },
  { value: "recurring", label: "נסיעות קבועות" },
  { value: "one_time", label: "נסיעות חד־פעמיות" },
];

// Smart filter bar (SRS §4.1): group, date, departure window, ride type.
export function SearchPanel({ groups, initial, today }: { groups: RideGroup[]; initial: Filters; today: string }) {
  const router = useRouter();
  const [groupId, setGroupId] = useState(initial.groupId ?? "");
  const [date, setDate] = useState(initial.date ?? "");
  const [time, setTime] = useState<string>(initial.time ?? "");
  const [kind, setKind] = useState<string>(initial.kind ?? "");
  const groupOptions = [{ value: "", label: "כל המסלולים" }, ...groups.map((g) => ({ value: g.id, label: groupLabel(g.origin, g.destination) }))];

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
          <Select label="מסלול" value={groupId} onChange={setGroupId} options={groupOptions} icon={<MapPin {...iconProps} size={20} />} />
        </div>
        <div className="field">
          <span>תאריך</span>
          <DatePicker label="תאריך" value={date} onChange={setDate} today={today} min={today} placeholder="כל השבוע" clearable />
        </div>
        <div className="field">
          <span>שעת יציאה</span>
          <Select label="שעת יציאה" value={time} onChange={setTime} options={TIME_OPTIONS} icon={<Clock {...iconProps} size={20} />} />
        </div>
        <div className="field">
          <span>סוג נסיעה</span>
          <Select label="סוג נסיעה" value={kind} onChange={setKind} options={KIND_OPTIONS} icon={<Repeat {...iconProps} size={20} />} />
        </div>
        <button type="submit" className="btn btn-primary search-button">
          <Search {...iconProps} size={20} />
          חיפוש נסיעה
        </button>
      </form>
    </section>
  );
}
