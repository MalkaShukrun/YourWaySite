import { describe, expect, it } from "vitest";
import {
  addRecentSearch,
  asRecentSearch,
  byCity,
  describePlaces,
  fullPlaces,
  hasAnyFilter,
  MAX_RECENT_SEARCHES,
  placeNames,
  recentKey,
  searchDetails,
  type RecentSearch,
} from "@/lib/rides/recentSearches";
import { cityPick } from "@/lib/rides/search";
import type { RideGroup } from "@/lib/rides/types";

const RAMA_A = "77777777-7777-4777-8777-77777777770a";
const RAMA_G = "77777777-7777-4777-8777-77777777770b";
const GIVAT_SHAUL = "77777777-7777-4777-8777-77777777770c";
const groups = [
  { id: "g1", origin: "בית שמש, רמה א", origin_city: "בית שמש", origin_place_id: RAMA_A, destination: "ירושלים, גבעת שאול", destination_city: "ירושלים", destination_place_id: GIVAT_SHAUL },
  { id: "g2", origin: "בית שמש, רמה ג", origin_city: "בית שמש", origin_place_id: RAMA_G, destination: "ירושלים, גבעת שאול", destination_city: "ירושלים", destination_place_id: GIVAT_SHAUL },
] as RideGroup[];
const places = placeNames(groups);
const TODAY = "2025-06-22";

// Recent searches, kept in the database (search_history) and offered under smart search.
describe("asRecentSearch and recentKey", () => {
  it("keeps the filters only, the places in a fixed order", () => {
    expect(asRecentSearch({ origins: [RAMA_G, RAMA_A, RAMA_G], destinations: undefined, date: "2025-06-24", from: "", kind: "recurring" })).toEqual({
      origins: [RAMA_A, RAMA_G],
      destinations: [],
      date: "2025-06-24",
      kind: "recurring",
    });
  });

  it("gives the same filters picked in another order the same key", () => {
    expect(recentKey({ origins: [RAMA_A, RAMA_G] })).toBe(recentKey({ origins: [RAMA_G, RAMA_A] }));
    expect(recentKey({ origins: [RAMA_A] })).not.toBe(recentKey({ destinations: [RAMA_A] }));
    expect(recentKey({ date: "2025-06-24" })).not.toBe(recentKey({ date: "2025-06-24", kind: "one_time" }));
  });

  it("knows a search with no filter at all", () => {
    expect(hasAnyFilter(asRecentSearch({}))).toBe(false);
    expect(hasAnyFilter(asRecentSearch({ to: "09:00" }))).toBe(true);
  });
});

const search = (n: number, extra: Partial<RecentSearch> = {}) => asRecentSearch({ origins: [cityPick(`עיר ${n}`)], ...extra });

describe("addRecentSearch", () => {
  it("puts the search just run first, and keeps the 4 latest", () => {
    let list: RecentSearch[] = [];
    for (let n = 1; n <= 6; n++) list = addRecentSearch(list, search(n), TODAY);
    expect(MAX_RECENT_SEARCHES).toBe(4);
    expect(list).toEqual([search(6), search(5), search(4), search(3)]);
  });

  it("moves the same filters up instead of keeping them twice", () => {
    const list = addRecentSearch([search(1), search(2)], search(2), TODAY);
    expect(list).toEqual([search(2), search(1)]);
  });

  it("keeps no search with a past date, and drops ones whose date has passed", () => {
    expect(addRecentSearch([search(1)], search(2, { date: "2025-06-21" }), TODAY)).toEqual([search(1)]);
    expect(addRecentSearch([search(1, { date: "2025-06-21" })], search(2, { date: TODAY }), TODAY)).toEqual([search(2, { date: TODAY })]);
  });

  it("keeps nothing for a search with no filter", () => {
    expect(addRecentSearch([search(1)], asRecentSearch({}), TODAY)).toEqual([search(1)]);
  });
});

describe("byCity", () => {
  it("gathers the neighborhoods picked under their city, in order", () => {
    expect(
      byCity([
        { city: "ירושלים", area: "גבעת שאול" },
        { city: "בית שמש", area: "רמה א" },
        { city: "ירושלים", area: "רמות" },
      ]),
    ).toEqual([
      { city: "ירושלים", areas: ["גבעת שאול", "רמות"] },
      { city: "בית שמש", areas: ["רמה א"] },
    ]);
  });

  it("lets the whole city cover its neighborhoods, picked before or after", () => {
    const whole = [{ city: "בית שמש", areas: [] }];
    expect(byCity([{ city: "בית שמש", area: "" }, { city: "בית שמש", area: "רמה א" }])).toEqual(whole);
    expect(byCity([{ city: "בית שמש", area: "רמה א" }, { city: "בית שמש", area: "" }])).toEqual(whole);
  });
});

describe("describePlaces", () => {
  it("names each end city by city, from the filters' places", () => {
    expect(describePlaces(asRecentSearch({ origins: [RAMA_A, RAMA_G], destinations: [GIVAT_SHAUL] }), places)).toEqual({
      origin: [{ city: "בית שמש", areas: ["רמה א", "רמה ג"] }],
      destination: [{ city: "ירושלים", areas: ["גבעת שאול"] }],
    });
    expect(describePlaces(asRecentSearch({ origins: [cityPick("בית שמש"), RAMA_A] }), places).origin).toEqual([{ city: "בית שמש", areas: [] }]);
  });

  it("leaves an end empty (anywhere) when nothing is picked there, and skips a pick no longer offered", () => {
    expect(describePlaces(asRecentSearch({ destinations: [GIVAT_SHAUL] }), places).origin).toEqual([]);
    expect(describePlaces(asRecentSearch({ origins: [cityPick("אחרת")] }), places).origin).toEqual([]);
  });
});

describe("searchDetails", () => {
  it("lists each filter she set: the full date, the departure times, the ride type", () => {
    expect(searchDetails({ date: "2025-06-22", from: "07:00", to: "09:00", kind: "recurring" })).toEqual([
      { type: "date", text: "יום א׳, 22 ביוני" },
      { type: "time", text: "יציאה 07:00–09:00" },
      { type: "kind", text: "נסיעות קבועות" },
    ]);
    expect(searchDetails({ from: "07:00" })).toEqual([{ type: "time", text: "יציאה מ־07:00" }]);
    expect(searchDetails({ to: "09:00", kind: "one_time" })).toEqual([
      { type: "time", text: "יציאה עד 09:00" },
      { type: "kind", text: "נסיעות חד־פעמיות" },
    ]);
    expect(searchDetails({})).toEqual([]);
  });
});

describe("fullPlaces", () => {
  it("names every city and every neighborhood picked in it", () => {
    const cities = [{ city: "בית שמש", areas: [] }, { city: "ירושלים", areas: ["גבעת שאול"] }];
    expect(fullPlaces(cities, "x")).toBe("בית שמש, ירושלים (גבעת שאול)");
    expect(fullPlaces([{ city: "בית שמש", areas: ["רמה א", "רמה ג"] }], "x")).toBe("בית שמש (רמה א, רמה ג)");
    expect(fullPlaces([], "לכל מקום")).toBe("לכל מקום");
  });
});
