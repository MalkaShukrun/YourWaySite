import { describe, expect, it } from "vitest";
import type { RideSummary } from "@/lib/ride-types";
import { groupByRoute, groupIdsFrom } from "@/lib/search-results";

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

describe("groupIdsFrom", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";

  it("reads one route or several", () => {
    expect(groupIdsFrom(a)).toEqual([a]);
    expect(groupIdsFrom([a, b])).toEqual([a, b]);
  });

  it("drops repeats and anything that isn't a group id", () => {
    expect(groupIdsFrom([a, "nope", a, b, ""])).toEqual([a, b]);
  });

  it.each([
    ["no param", undefined],
    ["an empty list", []],
    ["only bad values", ["nope", "123"]],
  ])("means every route for %s", (_name, param) => {
    expect(groupIdsFrom(param)).toBeUndefined();
  });
});
