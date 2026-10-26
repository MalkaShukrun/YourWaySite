import { describe, expect, it } from "vitest";
import { routeSchema, type RouteValues } from "@/lib/validation/route";

const valid: RouteValues = {
  groupId: "11111111-1111-4111-8111-111111111111",
  kind: "recurring",
  weekdays: [0],
  rideDate: "",
  outTime: "07:30",
  seats: "4",
  price: "15",
  stops: [
    { id: "", kind: "pickup", label: "צומת", lat: 31.7, lng: 35 },
    { id: "", kind: "dropoff", label: "תחנה", lat: 31.8, lng: 35.2 },
  ],
};

function issues(overrides: Partial<RouteValues>) {
  const result = routeSchema.safeParse({ ...valid, ...overrides });
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("routeSchema", () => {
  it("accepts a valid recurring route", () => {
    expect(issues({})).toEqual([]);
  });

  it("accepts a one-time route without weekdays", () => {
    expect(issues({ kind: "one_time", weekdays: [], rideDate: "2026-11-02" })).toEqual([]);
  });

  it("doesn't require a date on a recurring route", () => {
    expect(issues({ rideDate: "garbage" })).toEqual([]);
  });

  it.each(["00:00", "23:59", "09:05"])("accepts the time %s", (outTime) => {
    expect(issues({ outTime })).toEqual([]);
  });

  it.each(["24:00", "7:30", "07:60", "0730", ""])("rejects the time %j", (outTime) => {
    expect(issues({ outTime })).toEqual(["שעה לא תקינה"]);
  });

  it.each(["1", "8"])("accepts %s seats", (seats) => {
    expect(issues({ seats })).toEqual([]);
  });

  it.each(["0", "9", "10", "", "two"])("rejects %j seats", (seats) => {
    expect(issues({ seats })).toEqual(["בין 1 ל־8 מקומות"]);
  });

  it.each(["0", "15", "12.5", "9999.99"])("accepts the price %s", (price) => {
    expect(issues({ price })).toEqual([]);
  });

  it.each(["-1", "10000", "1.234", "", "₪15"])("rejects the price %j", (price) => {
    expect(issues({ price })).toEqual(["מחיר לא תקין"]);
  });

  it("rejects weekdays outside 0–6", () => {
    expect(issues({ weekdays: [7] })).toHaveLength(1);
  });

  it("rejects a stop with a one-letter label", () => {
    expect(issues({ stops: [{ ...valid.stops[0], label: " א " }, valid.stops[1]] })).toEqual(["יש לתת שם לתחנה"]);
  });

  it("accepts stops that aren't marked on the map", () => {
    expect(issues({ stops: valid.stops.map((s) => ({ ...s, lat: null, lng: null })) })).toEqual([]);
  });

  it("rejects out-of-range coordinates", () => {
    expect(issues({ stops: [{ ...valid.stops[0], lat: 91 }, valid.stops[1]] })).toHaveLength(1);
  });

  it("asks for a pickup before a dropoff when there are no stops", () => {
    expect(issues({ stops: [] })).toEqual(["יש להוסיף לפחות תחנת איסוף אחת"]);
  });
});
