import { describe, expect, it } from "vitest";
import { cityPick, groupByRoute, groupIdsFrom, placeOptions, placePicksFrom, searchedGroups } from "@/lib/rides/search";
import type { RideGroup } from "@/lib/rides/types";
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

// Searching by place: "מאיפה" and "לאן" pick cities or places in them (spec C1).
const RAMA_A = "77777777-7777-4777-8777-77777777770a";
const RAMA_G = "77777777-7777-4777-8777-77777777770b";
const GIVAT_SHAUL = "77777777-7777-4777-8777-77777777770c";
const TEL_AVIV = "77777777-7777-4777-8777-77777777770d";

const between = (id: string, from: [string, string, string], to: [string, string, string]): RideGroup => ({
  id,
  origin: `${from[0]}, ${from[1]}`,
  origin_city: from[0],
  origin_place_id: from[2],
  destination: `${to[0]}, ${to[1]}`,
  destination_city: to[0],
  destination_place_id: to[2],
});
const ramaA: [string, string, string] = ["בית שמש", "רמה א", RAMA_A];
const ramaG: [string, string, string] = ["בית שמש", "רמה ג", RAMA_G];
const givatShaul: [string, string, string] = ["ירושלים", "גבעת שאול", GIVAT_SHAUL];
const telAviv: [string, string, string] = ["תל אביב", "מרכז", TEL_AVIV];
const groups = [
  between(ID.group, ramaA, givatShaul),
  between(ID.group2, ramaG, givatShaul),
  between(ID.route, givatShaul, ramaG),
  between(ID.route2, telAviv, ramaA),
];

describe("placePicksFrom", () => {
  it("reads one or several ?origin= / ?destination= picks: cities and places", () => {
    expect(placePicksFrom(RAMA_A)).toEqual([RAMA_A]);
    expect(placePicksFrom([cityPick("בית שמש"), RAMA_G])).toEqual(["city:בית שמש", RAMA_G]);
  });

  it("drops anything else, and repeats", () => {
    expect(placePicksFrom([RAMA_A, RAMA_A, "abc", "city:", `city:${"א".repeat(41)}`])).toEqual([RAMA_A]);
  });

  it("means 'anywhere' (undefined) when none is valid", () => {
    expect(placePicksFrom(undefined)).toBeUndefined();
    expect(placePicksFrom(["x"])).toBeUndefined();
  });
});

describe("searchedGroups", () => {
  it("is every group (undefined) when no place is picked, or the ?group= ones", () => {
    expect(searchedGroups(groups, {})).toBeUndefined();
    expect(searchedGroups(groups, { groupIds: [ID.group] })).toEqual([ID.group]);
  });

  it("a city covers all its places", () => {
    expect(searchedGroups(groups, { origins: [cityPick("בית שמש")] })).toEqual([ID.group, ID.group2]);
  });

  it("a place covers only itself", () => {
    expect(searchedGroups(groups, { origins: [RAMA_G] })).toEqual([ID.group2]);
  });

  it("goes in the direction picked: from the origins to the destinations", () => {
    expect(searchedGroups(groups, { origins: [cityPick("ירושלים")], destinations: [cityPick("בית שמש")] })).toEqual([ID.route]);
    expect(searchedGroups(groups, { destinations: [RAMA_A] })).toEqual([ID.route2]);
  });

  it("takes any of several picks", () => {
    expect(searchedGroups(groups, { origins: [RAMA_A, cityPick("תל אביב")] })).toEqual([ID.group, ID.route2]);
  });

  it("is empty when nothing goes between the picked places", () => {
    expect(searchedGroups(groups, { origins: [cityPick("תל אביב")], destinations: [cityPick("ירושלים")] })).toEqual([]);
  });

  it("keeps to the ?group= ones too", () => {
    expect(searchedGroups(groups, { groupIds: [ID.group2], origins: [cityPick("בית שמש")] })).toEqual([ID.group2]);
  });
});

describe("placeOptions", () => {
  it("lists each city, then its places under it by neighborhood, once each, in Hebrew order", () => {
    expect(placeOptions(groups)).toEqual([
      { value: "city:בית שמש", label: "בית שמש (כל העיר)" },
      { value: RAMA_A, label: "בית שמש, רמה א", nested: "רמה א" },
      { value: RAMA_G, label: "בית שמש, רמה ג", nested: "רמה ג" },
      { value: "city:ירושלים", label: "ירושלים (כל העיר)" },
      { value: GIVAT_SHAUL, label: "ירושלים, גבעת שאול", nested: "גבעת שאול" },
      { value: "city:תל אביב", label: "תל אביב (כל העיר)" },
      { value: TEL_AVIV, label: "תל אביב, מרכז", nested: "מרכז" },
    ]);
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
