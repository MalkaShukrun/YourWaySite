"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, LoaderCircle, MapPin, Repeat, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useSearchTransition } from "@/components/passenger/SearchTransition";
import { DatePicker } from "@/components/ui/DatePicker";
import { MultiSelect, Select } from "@/components/ui/Select";
import { TimePicker } from "@/components/ui/TimePicker";
import type { RideGroup, RideKind } from "@/lib/rides/types";
import { placeOptions } from "@/lib/rides/search";
import { iconProps } from "@/components/ui/icon";
import { rememberSearch } from "@/components/passenger/BackToSearchLink";
import { clearRecentSearches, saveRecentSearch } from "@/app/(app)/(passenger)/actions";
import {
  addRecentSearch,
  asRecentSearch,
  describePlaces,
  hasAnyFilter,
  KIND_LABELS,
  placeNames,
  recentKey,
  searchDetails,
  type RecentSearch,
} from "@/lib/rides/recentSearches";
import { SmartSearch } from "@/components/passenger/SmartSearch";
import type { RecentSearchView } from "@/components/passenger/RecentSearchesMenu";
import type { ExtractedSearch, PlaceChoice } from "@/lib/smart-search/extract";

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
  { value: "recurring", label: KIND_LABELS.recurring },
  { value: "one_time", label: KIND_LABELS.one_time },
];

// Smart search's list offers her latest 3 — the one on screen too, so a search
// she just ran shows at once (one more is kept in case one can't be shown).
const RECENT_SHOWN = 3;

// The filters smart search can fill.
type Field = "origins" | "destinations" | "date" | "from" | "to" | "kind";
const FIELDS: Field[] = ["origins", "destinations", "date", "from", "to", "kind"];

// The flash on a filter smart search just filled: a lime glow that fades into
// the green it keeps (.field.smart-filled in yourway.css).
const FLASH: Keyframe[] = [
  { backgroundColor: "#D7F5A5", boxShadow: "0 0 0 0 rgba(136,182,93,.55)" },
  { backgroundColor: "#E9F8D2", boxShadow: "0 0 0 6px rgba(136,182,93,.25)", offset: 0.35 },
  { backgroundColor: "#F6FBEE", boxShadow: "0 0 0 0 rgba(136,182,93,0)" },
];

// Smart filter bar (SRS §4.1): from and to (a city, or places in it), date;
// under the filters button, departure time range and ride type.
//
// The results load only when she runs the search: "חיפוש נסיעה" (or Enter in
// a filter), or smart search's arrow (or Enter in it). Changing a filter, or
// picking a recent search, only fills the filters. Running a search is also
// what keeps it among her recent searches (search_history, 0050).
export function SearchPanel({
  groups,
  initial,
  today,
  recent: savedRecent,
}: {
  groups: RideGroup[];
  initial: Filters;
  today: string;
  recent: RecentSearch[];
}) {
  const router = useRouter();
  const [origins, setOrigins] = useState(initial.origins ?? []);
  const [destinations, setDestinations] = useState(initial.destinations ?? []);
  const [date, setDate] = useState(initial.date ?? "");
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");
  const [kind, setKind] = useState<string>(initial.kind ?? "");
  // Departure times and ride type wait behind the filters button — open when a link already sets one.
  const [moreOpen, setMoreOpen] = useState(Boolean(initial.from || initial.to || initial.kind));
  // Bumped by "ניקוי", which empties smart search's text too.
  const [smartKey, setSmartKey] = useState(0);
  // The filters smart search filled, shown in green until she changes them.
  const [smartFilled, setSmartFilled] = useState<ReadonlySet<Field>>(new Set());
  // The filters it just changed, to flash. A new object each time, so the
  // same filter can flash again.
  const [flash, setFlash] = useState<{ fields: Field[] }>({ fields: [] });
  const fieldRefs = useRef<Partial<Record<Field, HTMLDivElement | null>>>({});
  const moreCount = [from, to, kind].filter(Boolean).length;
  const options = placeOptions(groups);
  const { updating, startUpdate } = useSearchTransition();

  // The search shown now — the ride page's back link returns to it.
  const shownHref = searchHref(initial);
  useEffect(() => rememberSearch(shownHref), [shownHref]);

  // ─── Recent searches ──────────────────────────────────────────────────────
  // From the database when the page opens; after that this list is the one
  // shown, updated at once as she runs searches (the database keeps the same).
  const [recent, setRecent] = useState(savedRecent);
  const places = placeNames(groups);
  const recentViews: RecentSearchView[] = recent
    .map((search) => ({ key: recentKey(search), search, ...describePlaces(search, places), details: searchDetails(search) }))
    // One whose places are no longer offered (their group was hidden) would read "anywhere": left out.
    .filter((v) => (!v.search.origins.length || v.origin.length) && (!v.search.destinations.length || v.destination.length))
    .slice(0, RECENT_SHOWN);

  // Runs a search: the results load, and it's kept among her recent searches.
  function run(filters: Omit<Filters, "groupIds">) {
    const href = searchHref(filters);
    startUpdate(() => router.push(href, { scroll: false }));
    const search = asRecentSearch(filters);
    if (!hasAnyFilter(search)) return;
    setRecent((list) => addRecentSearch(list, search, today));
    saveRecentSearch(search).catch(() => {});
  }

  function forgetRecent() {
    setRecent([]);
    clearRecentSearches().catch(() => {});
  }

  // A recent search picked under smart search: its filters fill in, flashing
  // like smart search's. It runs when she presses search.
  function pickRecent(search: RecentSearch) {
    fillFrom({ ...search, ambiguous: [] });
  }

  // After render, so the time filters the filters button just opened are there.
  useEffect(() => {
    if (!flash.fields.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const name of flash.fields) {
      fieldRefs.current[name]?.querySelector(".input-shell")?.animate(FLASH, { duration: 1100, easing: "ease-out" });
    }
  }, [flash]);

  // "חיפוש נסיעה", or Enter in a filter: runs the search, and on a phone,
  // where the results are below the filters, takes her down to them.
  function submit(event: FormEvent) {
    event.preventDefault();
    run({ origins, destinations, date, from, to, kind: (kind || undefined) as RideKind | undefined });
    const results = document.getElementById("search-results");
    if (results && results.getBoundingClientRect().top > window.innerHeight - 120) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      results.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    }
  }

  // "ניקוי" empties the filters, and smart search's box too (a new one). Its
  // own X has emptied the box already, and keeps it focused. The results stay
  // until she searches again.
  function clear({ resetSmartSearch = true } = {}) {
    setOrigins([]);
    setDestinations([]);
    setDate("");
    setFrom("");
    setTo("");
    setKind("");
    setSmartFilled(new Set());
    if (resetSmartSearch) setSmartKey((k) => k + 1);
  }

  // She changed a filter herself: it's hers now, no longer green.
  function changedByHand(...names: Field[]) {
    setSmartFilled((filled) => (names.some((f) => filled.has(f)) ? new Set([...filled].filter((f) => !names.includes(f))) : filled));
  }

  // Smart search fills every filter from her sentence; what it didn't find is
  // emptied, so deleting a word takes it out. The ones it changed flash.
  function fillFrom(found: ExtractedSearch) {
    const now: Record<Field, string> = { origins: origins.join(), destinations: destinations.join(), date, from, to, kind };
    const next: Record<Field, string> = {
      origins: (found.origins ?? []).join(),
      destinations: (found.destinations ?? []).join(),
      date: found.date ?? "",
      from: found.from ?? "",
      to: found.to ?? "",
      kind: found.kind ?? "",
    };
    setOrigins(found.origins ?? []);
    setDestinations(found.destinations ?? []);
    setDate(next.date);
    setFrom(next.from);
    setTo(next.to);
    setKind(next.kind);
    if (found.from || found.to || found.kind) setMoreOpen(true);

    const filled = FIELDS.filter((f) => next[f]);
    setSmartFilled(new Set(filled));
    const changed = filled.filter((f) => next[f] !== now[f]);
    if (changed.length) setFlash({ fields: changed });
  }

  // Smart search's arrow (or Enter): the filters it read from her sentence —
  // never the sentence itself — fill in, run, and are kept.
  function searchFrom(found: ExtractedSearch) {
    fillFrom(found);
    run(found);
  }

  // A pick from "התכוונת ל…?": that place only, in its filter.
  function pickPlace(role: "origin" | "destination", choice: PlaceChoice) {
    const name: Field = role === "origin" ? "origins" : "destinations";
    if (role === "origin") setOrigins([choice.pick]);
    else setDestinations([choice.pick]);
    setSmartFilled((filled) => new Set([...filled, name]));
    setFlash({ fields: [name] });
  }

  // A filter with its label: green, and flashed, when smart search filled it.
  const field = (name: Field, label: string, control: ReactNode) => (
    <div
      className={`field${smartFilled.has(name) ? " smart-filled" : ""}`}
      ref={(el) => {
        fieldRefs.current[name] = el;
      }}
    >
      <span>
        {label}
        {smartFilled.has(name) && <span className="visually-hidden"> (מולא מהחיפוש החכם)</span>}
      </span>
      {control}
    </div>
  );

  return (
    <section className="search-card">
      {/* The card's slowly shifting tints (yourway.css). */}
      <div className="search-card-tint" aria-hidden="true" />
      <form className="filters" onSubmit={submit}>
        {/* The filters' first row, as wide as they are. */}
        <SmartSearch
          key={smartKey}
          groups={groups}
          today={today}
          onFill={fillFrom}
          onSearch={searchFrom}
          onPick={pickPlace}
          onClear={() => clear({ resetSmartSearch: false })}
          recent={{ searches: recentViews, onPick: pickRecent, onClear: forgetRecent }}
        />
        <div className="filter-places">
          {field(
            "origins",
            "מאיפה",
            <MultiSelect
              label="מאיפה"
              values={origins}
              onChange={(values) => {
                setOrigins(values);
                changedByHand("origins");
              }}
              options={options}
              allLabel="מכל מקום"
              icon={<MapPin {...iconProps} size={20} />}
            />,
          )}
          {/* For the ride back: origin and destination trade places. */}
          <button
            type="button"
            className="btn btn-secondary swap-places"
            aria-label="החלפת כיוון"
            title="החלפת כיוון"
            onClick={() => {
              setOrigins(destinations);
              setDestinations(origins);
              changedByHand("origins", "destinations");
            }}
          >
            <ArrowLeftRight {...iconProps} size={18} />
          </button>
          {field(
            "destinations",
            "לאן",
            <MultiSelect
              label="לאן"
              values={destinations}
              onChange={(values) => {
                setDestinations(values);
                changedByHand("destinations");
              }}
              options={options}
              allLabel="לכל מקום"
              icon={<MapPin {...iconProps} size={20} />}
            />,
          )}
        </div>
        {field(
          "date",
          "תאריך",
          <DatePicker
            label="תאריך"
            value={date}
            onChange={(value) => {
              setDate(value);
              changedByHand("date");
            }}
            today={today}
            min={today}
            placeholder="כל השבוע"
            clearable
          />,
        )}
        <div className="search-actions">
          {/* The departure times and ride type: an icon only, named for screen readers. */}
          <button
            type="button"
            className={`btn btn-secondary search-more${moreOpen ? " open" : ""}`}
            aria-expanded={moreOpen}
            aria-controls="search-more-filters"
            aria-label="עוד סינונים"
            title="עוד סינונים"
            onClick={() => setMoreOpen(!moreOpen)}
          >
            <SlidersHorizontal {...iconProps} size={18} />
            {moreCount > 0 && <span className="search-more-count" aria-hidden="true">{moreCount}</span>}
          </button>
          {/* Always there, beside the filters button. */}
          <button type="button" className="btn btn-secondary search-clear" onClick={() => clear()}>
            <RotateCcw {...iconProps} size={18} />
            ניקוי
          </button>
          <button type="submit" className="btn btn-primary search-button">
            {updating ? <LoaderCircle {...iconProps} size={20} className="icon spin" aria-hidden="true" /> : <Search {...iconProps} size={20} />}
            חיפוש נסיעה
          </button>
        </div>
        {moreOpen && (
          <div className="filters-more" id="search-more-filters">
            {field(
              "from",
              "יציאה משעה",
              <TimePicker
                label="יציאה משעה"
                value={from}
                onChange={(value) => {
                  setFrom(value);
                  changedByHand("from");
                }}
                placeholder="כל שעה"
              />,
            )}
            {field(
              "to",
              "עד שעה",
              <TimePicker
                label="עד שעה"
                value={to}
                onChange={(value) => {
                  setTo(value);
                  changedByHand("to");
                }}
                placeholder="כל שעה"
              />,
            )}
            {field(
              "kind",
              "סוג נסיעה",
              <Select
                label="סוג נסיעה"
                value={kind}
                onChange={(value) => {
                  setKind(value);
                  changedByHand("kind");
                }}
                options={KIND_OPTIONS}
                icon={<Repeat {...iconProps} size={20} />}
                searchable
              />,
            )}
          </div>
        )}
      </form>
    </section>
  );
}
