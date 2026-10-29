import { describe, expect, it } from "vitest";
import { isCharged, splitByDeparture } from "@/lib/rides/bookings";
import { booking } from "../../helpers/fixtures";

const DEPARTURE = "2026-11-01T05:30:00+00:00";
const at = (offsetMinutes: number) => Date.parse(DEPARTURE) + offsetMinutes * 60_000;

// My rides: upcoming until the ride departs, then history (spec G1, E2).
describe("splitByDeparture", () => {
  const early = booking({ booking_id: "early", departure_at: "2026-11-01T05:30:00+00:00" });
  const late = booking({ booking_id: "late", departure_at: "2026-11-03T05:30:00+00:00" });

  it("puts rides that haven't left in upcoming and the rest in history", () => {
    const { upcoming, history } = splitByDeparture([early, late], Date.parse("2026-11-02T00:00:00Z"));
    expect(upcoming.map((b) => b.booking_id)).toEqual(["late"]);
    expect(history.map((b) => b.booking_id)).toEqual(["early"]);
  });

  it("moves a ride to history at its exact departure time, not a minute later", () => {
    expect(splitByDeparture([early], at(-1)).upcoming).toHaveLength(1);
    expect(splitByDeparture([early], at(0)).history).toHaveLength(1);
  });

  it("keeps the order it was given", () => {
    const { upcoming } = splitByDeparture([late, early], at(-60));
    expect(upcoming.map((b) => b.booking_id)).toEqual(["late", "early"]);
  });

  it("handles no bookings", () => {
    expect(splitByDeparture([], at(0))).toEqual({ upcoming: [], history: [] });
  });
});

// A booking counts as a charge only when it's still active, the driver didn't
// cancel that date, and the ride has departed (spec §2 Charges, §6).
describe("isCharged", () => {
  it("charges an active ride once it has departed", () => {
    expect(isCharged(booking({ departure_at: DEPARTURE }), at(0))).toBe(true);
    expect(isCharged(booking({ departure_at: DEPARTURE }), at(60 * 24 * 30))).toBe(true);
  });

  it("doesn't charge before departure", () => {
    expect(isCharged(booking({ departure_at: DEPARTURE }), at(-1))).toBe(false);
  });

  it("never charges a ride the passenger cancelled", () => {
    expect(isCharged(booking({ status: "cancelled", departure_at: DEPARTURE }), at(60))).toBe(false);
  });

  it("never charges a date the driver cancelled, or a removed route's dates", () => {
    expect(isCharged(booking({ ride_cancelled: true, departure_at: DEPARTURE }), at(60))).toBe(false);
  });

  it("charges paid and unpaid rides alike (the mark is only the passenger's note)", () => {
    expect(isCharged(booking({ is_paid: true, departure_at: DEPARTURE }), at(60))).toBe(true);
  });
});
