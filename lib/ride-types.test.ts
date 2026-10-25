import { describe, expect, it } from "vitest";
import { avatarColorFor, formatPrice, groupLabel, initialsOf, isCharged, kindLabel, splitByDeparture, type MyBooking } from "./ride-types";
import { googleMapsUrl, wazeUrl, weekdaysLabel } from "./driver-types";

describe("splitByDeparture", () => {
  const at = (departure_at: string) => ({ booking_id: departure_at, departure_at }) as MyBooking;

  it("splits bookings around now; a ride leaving right now counts as history", () => {
    const now = Date.parse("2026-11-02T07:30:00+02:00");
    const past = at("2026-11-01T07:30:00+02:00");
    const leavingNow = at("2026-11-02T07:30:00+02:00");
    const future = at("2026-11-03T07:30:00+02:00");

    expect(splitByDeparture([past, future, leavingNow], now)).toEqual({ upcoming: [future], history: [past, leavingNow] });
  });

  it("handles an empty list", () => {
    expect(splitByDeparture([], Date.now())).toEqual({ upcoming: [], history: [] });
  });
});

describe("isCharged", () => {
  const now = Date.parse("2026-10-27T09:00:00+02:00");
  const booking = (over: Partial<MyBooking>) =>
    ({ status: "active", ride_cancelled: false, departure_at: "2026-10-27T08:15:00+02:00", ...over }) as MyBooking;

  it("charges a booked ride once it has departed", () => {
    expect(isCharged(booking({}), now)).toBe(true);
    expect(isCharged(booking({ departure_at: "2026-10-27T09:00:00+02:00" }), now)).toBe(true);
  });

  it("doesn't charge a ride that hasn't left yet", () => {
    expect(isCharged(booking({ departure_at: "2026-10-27T09:01:00+02:00" }), now)).toBe(false);
    expect(isCharged(booking({ departure_at: "2026-11-02T07:00:00+02:00" }), now)).toBe(false);
  });

  it("charges a late cancellation only after departure", () => {
    expect(isCharged(booking({ status: "late_cancelled" }), now)).toBe(true);
    expect(isCharged(booking({ status: "late_cancelled", departure_at: "2026-10-28T08:15:00+02:00" }), now)).toBe(false);
  });

  it("never charges a free cancellation or a ride the driver cancelled", () => {
    expect(isCharged(booking({ status: "cancelled" }), now)).toBe(false);
    expect(isCharged(booking({ ride_cancelled: true }), now)).toBe(false);
  });
});

describe("groupLabel", () => {
  it("joins origin and destination with an arrow", () => {
    expect(groupLabel("בית שמש", "ירושלים")).toBe("בית שמש ← ירושלים");
  });
});

describe("initialsOf", () => {
  it.each([
    ["מלכה כהן", "מכ"],
    ["  שרה   לוי  אברהם ", "של"],
    ["דנה", "ד"],
    ["", ""],
  ])("%j → %j", (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});

describe("avatarColorFor", () => {
  it("is stable for the same id", () => {
    expect(avatarColorFor("abc")).toBe(avatarColorFor("abc"));
  });

  it("always returns one of the palette colours", () => {
    for (const id of ["", "a", "11111111-1111-4111-8111-111111111111", "x".repeat(500)]) {
      expect(["coral", "lavender", "mint", "sand"]).toContain(avatarColorFor(id));
    }
  });
});

describe("kindLabel", () => {
  it("labels both kinds", () => {
    expect(kindLabel("recurring")).toBe("קבועה");
    expect(kindLabel("one_time")).toBe("חד־פעמית");
  });
});

describe("formatPrice", () => {
  it.each([
    [15, "₪15"],
    [12.5, "₪12.5"],
    [9.999, "₪10"],
    [1250, "₪1,250"],
  ])("%d → %s", (price, text) => {
    expect(formatPrice(price)).toBe(text);
  });

  it("accepts numeric strings from Postgres", () => {
    expect(formatPrice("20.00" as unknown as number)).toBe("₪20");
  });
});

describe("weekdaysLabel", () => {
  it("joins Hebrew weekday letters, with Saturday as ש׳", () => {
    expect(weekdaysLabel([0, 2, 4])).toBe("א׳ · ג׳ · ה׳");
    expect(weekdaysLabel([6])).toBe("ש׳");
    expect(weekdaysLabel([])).toBe("");
  });
});

describe("navigation links", () => {
  it("builds a Waze link", () => {
    expect(wazeUrl({ lat: 31.75, lng: 35.0 })).toBe("https://waze.com/ul?ll=31.75,35&navigate=yes");
  });

  it("builds a Google Maps directions link", () => {
    expect(googleMapsUrl({ lat: 31.75, lng: 35.21 })).toBe("https://www.google.com/maps/dir/?api=1&destination=31.75,35.21");
  });

  it("searches by name for a stop that isn't on the map", () => {
    expect(wazeUrl("צומת ביג")).toBe("https://waze.com/ul?q=%D7%A6%D7%95%D7%9E%D7%AA%20%D7%91%D7%99%D7%92&navigate=yes");
    expect(googleMapsUrl("צומת ביג")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=%D7%A6%D7%95%D7%9E%D7%AA%20%D7%91%D7%99%D7%92",
    );
  });
});
