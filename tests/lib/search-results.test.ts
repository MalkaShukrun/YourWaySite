import { describe, expect, it } from "vitest";
import type { RideSummary } from "@/lib/ride-types";
import { groupByRoute } from "@/lib/search-results";

const ride = (route_id: string, ride_date: string) => ({ route_id, ride_date }) as RideSummary;

describe("groupByRoute", () => {
  it("puts a recurring route's dates on one entry, in order", () => {
    const rides = [ride("a", "2026-10-27"), ride("b", "2026-10-27"), ride("a", "2026-10-29"), ride("a", "2026-11-01")];
    expect(groupByRoute(rides).map((dates) => dates.map((r) => `${r.route_id} ${r.ride_date}`))).toEqual([
      ["a 2026-10-27", "a 2026-10-29", "a 2026-11-01"],
      ["b 2026-10-27"],
    ]);
  });

  it("returns nothing for no rides", () => {
    expect(groupByRoute([])).toEqual([]);
  });
});
