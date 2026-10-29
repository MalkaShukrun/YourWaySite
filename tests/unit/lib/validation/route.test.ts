import { describe, expect, it } from "vitest";
import { NOTES_MAX, routeSchema, routeUpdateSchema, STOP_LABEL_MAX, type RouteValues } from "@/lib/validation/route";
import { ID } from "../../helpers/fixtures";

const pickup = { id: "", kind: "pickup" as const, label: "צומת", lat: 31.7, lng: 35 };
const dropoff = { id: "", kind: "dropoff" as const, label: "תחנה מרכזית", lat: null, lng: null };

const valid: RouteValues = {
  groupId: ID.group,
  kind: "recurring",
  weekdays: [0, 2, 4],
  rideDate: "2026-11-01",
  outTime: "07:30",
  seats: "4",
  price: "15",
  notes: "",
  stops: [pickup, dropoff],
};

function issues(overrides: Partial<RouteValues>) {
  const result = routeSchema.safeParse({ ...valid, ...overrides });
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

// The route editor's rules (spec §2 Routes, B1, B2, B5).
describe("routeSchema", () => {
  it("accepts a recurring route", () => {
    expect(issues({})).toEqual([]);
  });

  it("accepts a one-time ride without weekdays, on any day including Saturday", () => {
    expect(issues({ kind: "one_time", weekdays: [], rideDate: "2026-10-31" })).toEqual([]);
  });

  describe("days and dates", () => {
    it("needs at least one weekday on a recurring route", () => {
      expect(issues({ weekdays: [] })).toEqual(["יש לבחור לפחות יום אחד"]);
    });

    it("refuses the same weekday twice", () => {
      expect(issues({ weekdays: [1, 1] })).toEqual(["יום נבחר פעמיים"]);
    });

    it("refuses a weekday number outside 0–6", () => {
      expect(issues({ weekdays: [7] })).toHaveLength(1);
      expect(issues({ weekdays: [-1] })).toHaveLength(1);
    });

    it("asks a recurring route for its start date, and a one-time ride for its date", () => {
      expect(issues({ rideDate: "" })).toEqual(["יש לבחור תאריך התחלה"]);
      expect(issues({ kind: "one_time", weekdays: [], rideDate: "" })).toEqual(["יש לבחור תאריך"]);
      expect(issues({ rideDate: "1.11.2026" })).toEqual(["יש לבחור תאריך התחלה"]);
    });
  });

  describe("time, seats and price", () => {
    it.each(["00:00", "07:05", "23:59"])("accepts the time %s", (outTime) => {
      expect(issues({ outTime })).toEqual([]);
    });

    it.each(["24:00", "7:30", "07:60", "", "07:30:00"])("refuses the time %s", (outTime) => {
      expect(issues({ outTime })).toEqual(["שעה לא תקינה"]);
    });

    it.each(["1", "8"])("accepts %s seats", (seats) => {
      expect(issues({ seats })).toEqual([]);
    });

    it.each(["0", "9", "10", "", "2.5", "-1", "a"])("refuses %s seats", (seats) => {
      expect(issues({ seats })).toEqual(["בין 1 ל־8 מקומות"]);
    });

    // Up to 4 digits and 2 decimals (spec §2 Routes).
    it.each(["0", "15", "12.5", "9999.99", "0.01"])("accepts the price %s", (price) => {
      expect(issues({ price })).toEqual([]);
    });

    it.each(["", "10000", "12.345", "-5", "abc", "1,5", ".5", "5."])("refuses the price %s", (price) => {
      expect(issues({ price })).toEqual(["מחיר לא תקין"]);
    });
  });

  describe("note", () => {
    it(`accepts up to ${NOTES_MAX} characters, counted after trimming`, () => {
      expect(issues({ notes: "א".repeat(NOTES_MAX) })).toEqual([]);
      expect(issues({ notes: ` ${"א".repeat(NOTES_MAX)} ` })).toEqual([]);
    });

    it("refuses a longer note", () => {
      expect(issues({ notes: "א".repeat(NOTES_MAX + 1) })).toEqual([`עד ${NOTES_MAX} תווים בהערות`]);
    });

    it("trims the note", () => {
      expect(routeSchema.parse({ ...valid, notes: "  מחכה 5 דקות " }).notes).toBe("מחכה 5 דקות");
    });
  });

  describe("stops", () => {
    it("needs a pickup stop", () => {
      expect(issues({ stops: [dropoff] })).toEqual(["יש להוסיף לפחות תחנת איסוף אחת"]);
      expect(issues({ stops: [] })).toEqual(["יש להוסיף לפחות תחנת איסוף אחת"]);
    });

    it("needs a drop-off stop", () => {
      expect(issues({ stops: [pickup] })).toEqual(["יש להוסיף לפחות תחנת הורדה אחת"]);
    });

    it("gives a stop without a name one message", () => {
      expect(issues({ stops: [{ ...pickup, label: "   " }, dropoff] })).toEqual(["יש לתת שם לתחנה"]);
    });

    it("explains that a one-letter name is too short", () => {
      expect(issues({ stops: [{ ...pickup, label: " א " }, dropoff] })).toEqual(["שם התחנה צריך להכיל לפחות 2 תווים"]);
    });

    it(`accepts a name of up to ${STOP_LABEL_MAX} characters and refuses a longer one`, () => {
      expect(issues({ stops: [{ ...pickup, label: "א".repeat(STOP_LABEL_MAX) }, dropoff] })).toEqual([]);
      expect(issues({ stops: [{ ...pickup, label: "א".repeat(STOP_LABEL_MAX + 1) }, dropoff] })).toEqual([
        `עד ${STOP_LABEL_MAX} תווים בשם התחנה`,
      ]);
    });

    // Marking a stop on the map is optional (spec B3).
    it("accepts stops that aren't on the map", () => {
      expect(issues({ stops: [{ ...pickup, lat: null, lng: null }, dropoff] })).toEqual([]);
    });

    it("refuses coordinates off the globe", () => {
      expect(issues({ stops: [{ ...pickup, lat: 91 }, dropoff] })).toHaveLength(1);
      expect(issues({ stops: [{ ...pickup, lng: -181 }, dropoff] })).toHaveLength(1);
    });

    it("accepts a saved stop's id and an empty one for a new stop, nothing else", () => {
      expect(issues({ stops: [{ ...pickup, id: ID.pickup }, dropoff] })).toEqual([]);
      expect(issues({ stops: [{ ...pickup, id: "s1" }, dropoff] })).toHaveLength(1);
    });
  });

  it("needs a group", () => {
    expect(issues({ groupId: "" })).toEqual(["יש לבחור קבוצת נסיעה"]);
  });

  it("refuses an unknown ride kind", () => {
    expect(issues({ kind: "daily" as RouteValues["kind"] })).toHaveLength(1);
  });
});

// A published route takes only a new note and new stops (spec B4).
describe("routeUpdateSchema", () => {
  const newStop = { kind: "dropoff" as const, label: "צומת גומא", lat: null, lng: null };

  it("accepts a note change without new stops", () => {
    expect(routeUpdateSchema.safeParse({ notes: "חדש", stops: [] }).success).toBe(true);
  });

  it("accepts new stops and clearing the note", () => {
    expect(routeUpdateSchema.parse({ notes: "   ", stops: [newStop] })).toEqual({ notes: "", stops: [newStop] });
  });

  it("checks the note and each new stop's name", () => {
    expect(routeUpdateSchema.safeParse({ notes: "א".repeat(NOTES_MAX + 1), stops: [] }).success).toBe(false);
    expect(routeUpdateSchema.safeParse({ notes: "", stops: [{ ...newStop, label: "" }] }).success).toBe(false);
  });

  it("drops a stop id: existing stops can't be changed through it", () => {
    const parsed = routeUpdateSchema.parse({ notes: "", stops: [{ ...newStop, id: ID.pickup }] });
    expect(parsed.stops[0]).not.toHaveProperty("id");
  });
});
