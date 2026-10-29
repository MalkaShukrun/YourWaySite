// Ride search results — safe to import from Client Components.
import type { RideSummary } from "@/lib/rides/types";
import { isUuid } from "@/lib/validation/patterns";

// The routes picked in the search, from the URL's ?group= (repeated once per
// route). Drops anything that isn't a group id and repeats; none = all routes.
export function groupIdsFrom(param: string | string[] | undefined): string[] | undefined {
  const ids = [...new Set([param ?? []].flat().filter(isUuid))];
  return ids.length ? ids : undefined;
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
