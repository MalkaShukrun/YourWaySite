// Recent ride searches, offered under smart search — safe to import from
// Client Components. Kept in the database (search_history, 0050) for each
// passenger; saved only when she runs a search ("חיפוש נסיעה", or smart
// search's arrow).
import type { RideGroup, RideKind } from "@/lib/rides/types";
import { cityPick } from "@/lib/rides/search";
import { formatRideDate } from "@/lib/utils/dates";
import { splitPlace } from "@/lib/utils/format";

// A search as kept: its filters, never smart search's text. Places are picks
// ("city:<name>" or a place id); an empty end means anywhere.
export type RecentSearch = {
  origins: string[];
  destinations: string[];
  date?: string;
  from?: string;
  to?: string;
  kind?: RideKind;
};

// She keeps her 4 latest; smart search's list offers the 3 latest it can show.
export const MAX_RECENT_SEARCHES = 4;

// The search's filters as given, in a fixed order: the same filters picked
// in another order are the same search.
export function asRecentSearch(filters: Partial<RecentSearch>): RecentSearch {
  const picks = (list: string[] | undefined) => [...new Set(list ?? [])].sort();
  return {
    origins: picks(filters.origins),
    destinations: picks(filters.destinations),
    ...(filters.date && { date: filters.date }),
    ...(filters.from && { from: filters.from }),
    ...(filters.to && { to: filters.to }),
    ...(filters.kind && { kind: filters.kind }),
  };
}

// One key per search: the same filters, the same key.
export function recentKey(filters: Partial<RecentSearch>) {
  const s = asRecentSearch(filters);
  return JSON.stringify([s.origins, s.destinations, s.date ?? "", s.from ?? "", s.to ?? "", s.kind ?? ""]);
}

export function hasAnyFilter(s: RecentSearch) {
  return Boolean(s.origins.length || s.destinations.length || s.date || s.from || s.to || s.kind);
}

// The list after she runs a search: it first, the same filters moved up
// rather than repeated, none whose date has passed, the 4 latest. The
// database keeps the same rules (record_search); this shows them at once.
export function addRecentSearch(list: RecentSearch[], search: RecentSearch, today: string): RecentSearch[] {
  if (!hasAnyFilter(search) || (search.date && search.date < today)) return list;
  const key = recentKey(search);
  return [search, ...list.filter((s) => recentKey(s) !== key)]
    .filter((s) => !s.date || s.date >= today)
    .slice(0, MAX_RECENT_SEARCHES);
}

// ─── How a search reads ─────────────────────────────────────────────────────

// One end of a search, city by city: "בית שמש" with the neighborhoods picked
// in it ("רמה א", "רמה ג"), or none when the whole city was picked.
export type CityPicks = { city: string; areas: string[] };

// A place by its parts.
export type PlaceName = { city: string; area: string };

// Every pick the filters offer, by its parts: each place, and each whole city.
export function placeNames(groups: RideGroup[]): Map<string, PlaceName> {
  const places = new Map<string, PlaceName>();
  const add = (id: string, city: string, name: string) =>
    places.set(id, { city, area: splitPlace(name).neighborhood }).set(cityPick(city), { city, area: "" });
  for (const g of groups) {
    add(g.origin_place_id, g.origin_city, g.origin);
    add(g.destination_place_id, g.destination_city, g.destination);
  }
  return places;
}

// The picks gathered by city, in order; the whole city covers its
// neighborhoods, so "בית שמש" and "בית שמש, רמה א" read as just "בית שמש".
export function byCity(places: PlaceName[]): CityPicks[] {
  const cities = new Map<string, Set<string> | "whole">();
  for (const { city, area } of places) {
    const picked = cities.get(city);
    if (picked === "whole") continue;
    if (!area) cities.set(city, "whole");
    else if (picked) picked.add(area);
    else cities.set(city, new Set([area]));
  }
  return [...cities].map(([city, areas]) => ({ city, areas: areas === "whole" ? [] : [...areas] }));
}

// The places a search names, each end city by city. A pick no longer offered
// (its group was hidden) is skipped.
export function describePlaces(search: RecentSearch, places: ReadonlyMap<string, PlaceName>) {
  const named = (picks: string[]) => byCity(picks.map((pick) => places.get(pick)).filter((place): place is PlaceName => Boolean(place)));
  return { origin: named(search.origins), destination: named(search.destinations) };
}

export type SearchDetail = { type: "date" | "time" | "kind"; text: string };

// The ride-type filter's names, shared with the filter itself.
export const KIND_LABELS: Record<RideKind, string> = { recurring: "נסיעות קבועות", one_time: "נסיעות חד־פעמיות" };

// The when of a search, each filter she set: "יום א׳, 22 ביוני",
// "יציאה 07:00–09:00", "נסיעות קבועות".
export function searchDetails({ date, from, to, kind }: Partial<RecentSearch>): SearchDetail[] {
  const details: SearchDetail[] = [];
  if (date) details.push({ type: "date", text: formatRideDate(date) });
  if (from && to) details.push({ type: "time", text: `יציאה ${from}–${to}` });
  else if (from) details.push({ type: "time", text: `יציאה מ־${from}` });
  else if (to) details.push({ type: "time", text: `יציאה עד ${to}` });
  if (kind) details.push({ type: "kind", text: KIND_LABELS[kind] });
  return details;
}

// One end in full, as the list shows it: "ירושלים (גבעת שאול, רמות), בית שמש".
export function fullPlaces(picks: CityPicks[], anywhere: string) {
  if (!picks.length) return anywhere;
  return picks.map(({ city, areas }) => (areas.length ? `${city} (${areas.join(", ")})` : city)).join(", ");
}
