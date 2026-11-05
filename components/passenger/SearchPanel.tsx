"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Car, Info, MapPin, Repeat, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { MultiSelect, Select } from "@/components/ui/Select";
import { TimePicker } from "@/components/ui/TimePicker";
import type { RideGroup, RideKind } from "@/lib/rides/types";
import { placeOptions } from "@/lib/rides/search";
import { carIconProps, iconProps } from "@/components/ui/icon";
import { rememberSearch } from "@/components/passenger/BackToSearchLink";

const ROUTE_HINT = "נהגת? להוספת מסלולי נסיעה מעיר לעיר יש ליצור קשר";

type Filters = { groupIds?: string[]; origins?: string[]; destinations?: string[]; date?: string; kind?: RideKind; from?: string; to?: string };

// ?origin= and ?destination= hold the place picks; ?group= only comes from older links.
function searchHref({ groupIds, origins, destinations, date, from, to, kind }: Omit<Filters, "kind"> & { kind?: string }) {
  const params = new URLSearchParams();
  for (const id of groupIds ?? []) params.append("group", id);
  for (const pick of origins ?? []) params.append("origin", pick);
  for (const pick of destinations ?? []) params.append("destination", pick);
  if (date) params.set("date", date);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (kind) params.set("kind", kind);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

const KIND_OPTIONS = [
  { value: "", label: "כל הנסיעות" },
  { value: "recurring", label: "נסיעות קבועות" },
  { value: "one_time", label: "נסיעות חד־פעמיות" },
];

// Smart filter bar (SRS §4.1): from and to (a city, or places in it), date;
// under "עוד סינונים", departure time range and ride type.
export function SearchPanel({ groups, initial, today }: { groups: RideGroup[]; initial: Filters; today: string }) {
  const router = useRouter();
  const [origins, setOrigins] = useState(initial.origins ?? []);
  const [destinations, setDestinations] = useState(initial.destinations ?? []);
  const [date, setDate] = useState(initial.date ?? "");
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");
  const [kind, setKind] = useState<string>(initial.kind ?? "");
  // Departure times and ride type wait behind "עוד סינונים" — open when a link already sets one.
  const [moreOpen, setMoreOpen] = useState(Boolean(initial.from || initial.to || initial.kind));
  const moreCount = [from, to, kind].filter(Boolean).length;
  const options = placeOptions(groups);

  // The search shown now — the ride page's back link returns to it.
  const shownHref = searchHref(initial);
  useEffect(() => rememberSearch(shownHref), [shownHref]);

  function submit(event: FormEvent) {
    event.preventDefault();
    router.push(searchHref({ origins, destinations, date, from, to, kind }));
  }

  const hasFilters = Boolean(
    origins.length || destinations.length || date || from || to || kind ||
      initial.groupIds?.length || initial.origins?.length || initial.destinations?.length || initial.date || initial.from || initial.to || initial.kind,
  );

  function clear() {
    setOrigins([]);
    setDestinations([]);
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
        <div className="filter-places">
          <div className="field">
            <span className="field-label-hint">
              מאיפה
              <span className="hint" tabIndex={0} aria-label={ROUTE_HINT}>
                <Info {...iconProps} size={16} />
                <span className="hint-bubble" role="tooltip">{ROUTE_HINT}</span>
              </span>
            </span>
            <MultiSelect label="מאיפה" values={origins} onChange={setOrigins} options={options} allLabel="מכל מקום" icon={<MapPin {...iconProps} size={20} />} />
          </div>
          {/* For the ride back: origin and destination trade places. */}
          <button
            type="button"
            className="btn btn-secondary swap-places"
            aria-label="החלפת כיוון"
            title="החלפת כיוון"
            onClick={() => {
              setOrigins(destinations);
              setDestinations(origins);
            }}
          >
            <ArrowLeftRight {...iconProps} size={18} />
          </button>
          <div className="field">
            <span>לאן</span>
            <MultiSelect label="לאן" values={destinations} onChange={setDestinations} options={options} allLabel="לכל מקום" icon={<MapPin {...iconProps} size={20} />} />
          </div>
        </div>
        <div className="field">
          <span>תאריך</span>
          <DatePicker label="תאריך" value={date} onChange={setDate} today={today} min={today} placeholder="כל השבוע" clearable />
        </div>
        <div className="search-actions">
          <button
            type="button"
            className={`btn btn-secondary search-more${moreOpen ? " open" : ""}`}
            aria-expanded={moreOpen}
            aria-controls="search-more-filters"
            onClick={() => setMoreOpen(!moreOpen)}
          >
            <SlidersHorizontal {...iconProps} size={18} />
            עוד סינונים
            {moreCount > 0 && <span className="search-more-count">{moreCount}</span>}
          </button>
          <button type="submit" className="btn btn-primary search-button">
            <Search {...iconProps} size={20} />
            חיפוש נסיעה
          </button>
        </div>
        {moreOpen && (
          <div className="filters-more" id="search-more-filters">
            <div className="field">
              <span>יציאה משעה</span>
              <TimePicker label="יציאה משעה" value={from} onChange={setFrom} placeholder="כל שעה" />
            </div>
            <div className="field">
              <span>עד שעה</span>
              <TimePicker label="עד שעה" value={to} onChange={setTo} placeholder="כל שעה" />
            </div>
            <div className="field">
              <span>סוג נסיעה</span>
              <Select label="סוג נסיעה" value={kind} onChange={setKind} options={KIND_OPTIONS} icon={<Repeat {...iconProps} size={20} />} searchable />
            </div>
          </div>
        )}
        {hasFilters && (
          <button type="button" className="btn btn-secondary search-clear" onClick={clear}>
            <RotateCcw {...iconProps} size={18} />
            ניקוי
          </button>
        )}
      </form>
    </section>
  );
}
