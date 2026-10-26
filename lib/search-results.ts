// Ride search results — safe to import from Client Components.
import type { RideSummary } from "@/lib/ride-types";

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
