// Ride search results — safe to import from Client Components.
import type { RideGroup, RideSummary } from "@/lib/rides/types";
import { splitPlace } from "@/lib/utils/format";
import { isUuid } from "@/lib/validation/patterns";

// The routes picked by id, from the URL's ?group= (repeated once per route).
// The filter bar picks places instead, but links with ?group= still work.
// Drops anything that isn't a group id and repeats; none = all routes.
export function groupIdsFrom(param: string | string[] | undefined): string[] | undefined {
  const ids = [...new Set([param ?? []].flat().filter(isUuid))];
  return ids.length ? ids : undefined;
}

// A pick in the "מאיפה" / "לאן" filters: a whole city ("city:בית שמש"), or
// one place by its id.
const CITY = "city:";
export const cityPick = (city: string) => `${CITY}${city}`;

// The places picked for one end of the ride, from the URL's ?origin= or
// ?destination= (repeated once per pick). Drops anything else and repeats;
// none = anywhere.
export function placePicksFrom(param: string | string[] | undefined): string[] | undefined {
  const isCity = (v: string) => v.startsWith(CITY) && v.length > CITY.length && v.length <= CITY.length + 40;
  const picks = [...new Set([param ?? []].flat().filter((v) => isCity(v) || isUuid(v)))];
  return picks.length ? picks : undefined;
}

// Whether one end of a group is among the picks: its city, or the place itself.
const covers = (picks: string[] | undefined, city: string, placeId: string) =>
  !picks || picks.some((p) => p === placeId || p === cityPick(city));

type Picks = { groupIds?: string[]; origins?: string[]; destinations?: string[] };

// The groups to search: going from a picked origin to a picked destination,
// and among the ?group= ones if any. undefined = all; [] = none matches.
export function searchedGroups(groups: RideGroup[], { groupIds, origins, destinations }: Picks): string[] | undefined {
  if (!origins && !destinations) return groupIds;
  return groups
    .filter((g) => !groupIds || groupIds.includes(g.id))
    .filter((g) => covers(origins, g.origin_city, g.origin_place_id) && covers(destinations, g.destination_city, g.destination_place_id))
    .map((g) => g.id);
}

export type PlaceOption = { value: string; label: string; nested?: string };

// The filters' options: every city the groups go from or to, each followed by
// its places, which show just the neighborhood under it. Both filters list all
// of them, so swapping keeps the picks.
export function placeOptions(groups: RideGroup[]): PlaceOption[] {
  const places = new Map<string, { city: string; name: string }>();
  for (const g of groups) {
    places.set(g.origin_place_id, { city: g.origin_city, name: g.origin });
    places.set(g.destination_place_id, { city: g.destination_city, name: g.destination });
  }
  const byName = (a: string, b: string) => a.localeCompare(b, "he");
  const sorted = [...places].sort(([, a], [, b]) => byName(a.city, b.city) || byName(a.name, b.name));
  const options: PlaceOption[] = [];
  let lastCity = "";
  for (const [id, { city, name }] of sorted) {
    if (city !== lastCity) options.push({ value: cityPick(city), label: `${city} (כל העיר)` });
    options.push({ value: id, label: name, nested: splitPlace(name).neighborhood || name });
    lastCity = city;
  }
  return options;
}

// One entry per route, so a recurring route's dates share a card. Keeps the
// search order: routes by their first date, each route's dates in order.
export function groupByRoute(rides: RideSummary[]): RideSummary[][] {
  const byRoute = new Map<string, RideSummary[]>();
  for (const ride of rides) {
    const dates = byRoute.get(ride.route_id);
    if (dates) dates.push(ride);
    else byRoute.set(ride.route_id, [ride]);
  }
  return [...byRoute.values()];
}
