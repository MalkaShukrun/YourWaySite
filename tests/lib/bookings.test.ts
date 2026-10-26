import { describe, expect, it } from "vitest";
import type { MyBooking } from "@/lib/ride-types";
import { isCharged, splitByDeparture } from "@/lib/bookings";

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
