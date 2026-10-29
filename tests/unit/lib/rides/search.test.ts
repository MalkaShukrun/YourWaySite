import { describe, expect, it } from "vitest";
import { groupByRoute, groupIdsFrom } from "@/lib/rides/search";
import { isPlaced } from "@/lib/rides/types";
import { ID, ride } from "../../helpers/fixtures";

// The search filters are kept in the address (spec C1).
describe("groupIdsFrom", () => {
  it("reads one or several ?group= values", () => {
    expect(groupIdsFrom(ID.group)).toEqual([ID.group]);
    expect(groupIdsFrom([ID.group, ID.group2])).toEqual([ID.group, ID.group2]);
  });

  it("drops anything that isn't a group id, and repeats", () => {
    expect(groupIdsFrom([ID.group, "abc", ID.group, "'; drop table"])).toEqual([ID.group]);
  });

  it("means 'all routes' (undefined) when none is valid", () => {
    expect(groupIdsFrom(undefined)).toBeUndefined();
    expect(groupIdsFrom("")).toBeUndefined();
    expect(groupIdsFrom(["x", "y"])).toBeUndefined();
  });
});

// Each recurring route appears as one card with a chip per date (spec C1, B1).
describe("groupByRoute", () => {
  it("puts a route's dates on one card, in order", () => {
    const cards = groupByRoute([
      ride({ ride_date: "2026-11-01" }),
      ride({ route_id: ID.route2, ride_date: "2026-11-01" }),
      ride({ ride_date: "2026-11-02" }),
    ]);
    expect(cards).toHaveLength(2);
    expect(cards[0].map((r) => r.ride_date)).toEqual(["2026-11-01", "2026-11-02"]);
    expect(cards[1].map((r) => r.route_id)).toEqual([ID.route2]);
  });

  it("orders the cards by each route's first date in the results", () => {
    const cards = groupByRoute([
      ride({ route_id: ID.route2, ride_date: "2026-11-01" }),
      ride({ route_id: ID.route, ride_date: "2026-11-02" }),
    ]);
    expect(cards.map((c) => c[0].route_id)).toEqual([ID.route2, ID.route]);
  });

  it("returns no cards for no results", () => {
    expect(groupByRoute([])).toEqual([]);
  });
});

// Unplaced stops are listed by name but not drawn on the map (spec B3).
describe("isPlaced", () => {
  it("is true only when both coordinates are set", () => {
    expect(isPlaced({ lat: 31.7, lng: 35.2 })).toBe(true);
    expect(isPlaced({ lat: 0, lng: 0 })).toBe(true);
    expect(isPlaced({ lat: null, lng: null })).toBe(false);
    expect(isPlaced({ lat: 31.7, lng: null })).toBe(false);
  });
});
