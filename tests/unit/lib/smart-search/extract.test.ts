import { describe, expect, it } from "vitest";
import { extractSearch } from "@/lib/smart-search/extract";
import { cityPick } from "@/lib/rides/search";
import type { RideGroup } from "@/lib/rides/types";

const RAMA_A = "77777777-7777-4777-8777-77777777770a";
const RAMA_G = "77777777-7777-4777-8777-77777777770b";
const HAR_HOTZVIM = "77777777-7777-4777-8777-77777777770c";
const MODIIN_CENTER = "77777777-7777-4777-8777-77777777770d";
const BS_CENTER = "77777777-7777-4777-8777-77777777770e";

// A place: [city, neighborhood, id].
type Place = [string, string, string];
let n = 0;
const group = ([fromCity, fromArea, fromId]: Place, [toCity, toArea, toId]: Place): RideGroup => ({
  id: `33333333-3333-4333-8333-33333333333${n++}`,
  origin: `${fromCity}, ${fromArea}`,
  origin_city: fromCity,
  origin_place_id: fromId,
  destination: `${toCity}, ${toArea}`,
  destination_city: toCity,
  destination_place_id: toId,
});
const groups: RideGroup[] = [
  group(["בית שמש", "רמה א", RAMA_A], ["ירושלים", "הר חוצבים", HAR_HOTZVIM]),
  group(["בית שמש", "רמה ג", RAMA_G], ["ירושלים", "הר חוצבים", HAR_HOTZVIM]),
  // "מרכז" is a neighborhood in two cities.
  group(["מודיעין", "מרכז", MODIIN_CENTER], ["בית שמש", "מרכז", BS_CENTER]),
];

const SUNDAY = "2026-11-22";
const extract = (text: string) => extractSearch(text, groups, SUNDAY);

// Smart search's rules (spec C8). First, the examples in "YourWay Smart
// Search — Parameter Extraction".
describe("the spec's examples", () => {
  it("בית שמש לירושלים מחר", () => {
    expect(extract("בית שמש לירושלים מחר")).toEqual({
      origins: [cityPick("בית שמש")],
      destinations: [cityPick("ירושלים")],
      date: "2026-11-23",
      ambiguous: [],
    });
  });

  it("מרמה ג להר חוצבים", () => {
    expect(extract("מרמה ג להר חוצבים")).toEqual({ origins: [RAMA_G], destinations: [HAR_HOTZVIM], ambiguous: [] });
  });

  it("יש משהו ליום ראשון מבית שמש?", () => {
    // "ליום" isn't a place, so its ל doesn't make anything a destination.
    expect(extract("יש משהו ליום ראשון מבית שמש?")).toEqual({ origins: [cityPick("בית שמש")], date: "2026-11-29", ambiguous: [] });
  });

  it("בוקר ירושלים: a single place without מ / ל is where from", () => {
    expect(extract("בוקר ירושלים")).toEqual({ origins: [cityPick("ירושלים")], from: "06:00", to: "11:00", ambiguous: [] });
  });
});

describe("places", () => {
  it("takes the end a direction word or prefix gives, whatever the order", () => {
    expect(extract("לירושלים מבית שמש")).toMatchObject({ origins: [cityPick("בית שמש")], destinations: [cityPick("ירושלים")] });
    expect(extract("לכיוון ירושלים")).toMatchObject({ destinations: [cityPick("ירושלים")] });
    // Exactly that: "מ" and "ל" before a place are no time ("מ-8 עד 10").
    expect(extract("מ-בית שמש ל-ירושלים")).toEqual({ origins: [cityPick("בית שמש")], destinations: [cityPick("ירושלים")], ambiguous: [] });
    expect(extract("ומבית שמש")).toMatchObject({ origins: [cityPick("בית שמש")] });
  });

  it("goes from the first unmarked place to the second", () => {
    expect(extract("בית שמש ירושלים")).toMatchObject({ origins: [cityPick("בית שמש")], destinations: [cityPick("ירושלים")] });
  });

  it("prefers a city's place over the whole city, and ignores gershayim", () => {
    expect(extract("בית שמש רמה ג׳ לירושלים")).toMatchObject({ origins: [RAMA_G] });
  });

  it("reads a name as written before taking letters off its front", () => {
    expect(extract("מודיעין לבית שמש")).toMatchObject({ origins: [cityPick("מודיעין")], destinations: [cityPick("בית שמש")] });
    expect(extract("ממודיעין")).toMatchObject({ origins: [cityPick("מודיעין")] });
  });

  it("searches every place a shared neighborhood name fits, and offers them", () => {
    expect(extract("מהמרכז לירושלים")).toEqual({
      origins: [MODIIN_CENTER, BS_CENTER],
      destinations: [cityPick("ירושלים")],
      ambiguous: [
        {
          role: "origin",
          choices: [
            { label: "מודיעין, מרכז", pick: MODIIN_CENTER },
            { label: "בית שמש, מרכז", pick: BS_CENTER },
          ],
        },
      ],
    });
  });
});

describe("dates", () => {
  it.each([
    ["היום", "2026-11-22"],
    ["למחר", "2026-11-23"],
    ["מחרתיים", "2026-11-24"],
    ["ביום שלישי", "2026-11-24"],
    ["ביום ג׳", "2026-11-24"],
    ["יום ראשון", "2026-11-29"], // today is Sunday: the next one
    ["בשבת", "2026-11-28"],
  ])("%s → %s", (text, date) => {
    expect(extract(`לירושלים ${text}`)?.date).toBe(date);
  });
  // No day named, no date: the week's search (spec example 2 above).
});

describe("times", () => {
  it.each([
    ["בבוקר", "06:00", "11:00"],
    ["בצהריים", "11:00", "14:00"],
    ["בערב", "17:00", "21:00"],
    ["בשמונה", "07:30", "08:30"],
    ["8:00", "07:30", "08:30"],
    ["ב-7:45", "07:15", "08:15"],
    ["בשעה 9", "08:30", "09:30"],
    ["בשלוש", "14:30", "15:30"], // 1–5 is the afternoon
    ["בערב בשמונה", "19:30", "20:30"],
    ["בבוקר בחמש", "04:30", "05:30"],
    ["אחר הצהריים", "14:00", "17:00"],
    ["אחרי הצהריים", "14:00", "17:00"],
    ["אחה״צ", "14:00", "17:00"],
    ["בלילה", "20:00", "23:59"],
    ["בלילה בעשר", "21:30", "22:30"],
    ["מ-8 עד 10", "08:00", "10:00"],
    ["בין 7:30 ל-9", "07:30", "09:00"],
    ["בבוקר עד 9", "06:00", "09:00"],
    ["אחרי 7 בערב", "19:00", "21:00"],
    ["החל מהשעה 6 ועד שמונה", "06:00", "08:00"],
  ])("%s → %s–%s", (text, from, to) => {
    expect(extract(`לירושלים ${text}`)).toMatchObject({ from, to });
  });

  it.each([
    ["אחרי 4", { from: "16:00" }],
    ["אחרי שמונה", { from: "08:00" }],
    ["עד 9", { to: "09:00" }],
    ["לפני השעה 8:30", { to: "08:30" }],
  ])("%s sets one end only", (text, times) => {
    expect(extract(`לירושלים ${text}`)).toEqual({ destinations: [cityPick("ירושלים")], ...times, ambiguous: [] });
  });
});

describe("ride type", () => {
  it.each([
    ["נסיעה קבועה", "recurring"],
    ["קבוע", "recurring"],
    ["כל יום", "recurring"],
    ["כל שבוע", "recurring"],
    ["חד פעמית", "one_time"],
    ["חד־פעמית", "one_time"],
    ["חד-פעמי", "one_time"],
    ["פעם אחת", "one_time"],
  ])("%s → %s", (text, kind) => {
    expect(extract(`לירושלים ${text}`)?.kind).toBe(kind);
  });

  it("is enough on its own to search", () => {
    expect(extract("נסיעות קבועות")).toEqual({ kind: "recurring", ambiguous: [] });
  });
});

// Unknown words are skipped quietly: spec example 3 above keeps its place and
// day around "יש משהו". These name nothing at all.
describe("nothing to search", () => {
  it.each(["", "א", "שלום מה נשמע", "תל אביב"])("%j finds nothing", (text) => {
    expect(extract(text)).toBeNull();
  });

  // Words that are also names on every JavaScript object mustn't be read as
  // a weekday, an hour or a part of the day.
  it.each(["יום constructor", "בconstructor", "constructor", "יום __proto__", "בhasOwnProperty"])("%j is no day or time", (text) => {
    expect(extract(`לירושלים ${text}`)).toEqual({ destinations: [cityPick("ירושלים")], ambiguous: [] });
  });
});
