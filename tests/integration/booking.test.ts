import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, daysFromToday, DENIED, rideDay, rideDayAfter, type Route, type User, type World } from "./support/world";

// Booking a seat, book_ride (spec C3–C6, §2 Bookings): every rule the database
// checks, the seat limit under a race, and what a passenger may change herself.

let w: World;
let driver: User;
let passenger: User;
let other: User;

beforeAll(async () => {
  w = createWorld();
  [driver, passenger, other] = await Promise.all([w.user("Driver"), w.user("Passenger"), w.user("Other")]);
});
afterAll(() => w?.cleanup());

const code = (result: { error: { message: string } | null }) => result.error?.message;

describe("a successful booking (spec C3)", () => {
  it("takes a seat and keeps the route's price", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date, seats: 3, price: 17.5 });
    const { data: id, error } = await w.book(passenger, route, date);
    expect(error).toBeNull();

    const { data } = await w.service.from("bookings").select("status, price, passenger_id, is_paid, added_by_driver").eq("id", id).single();
    expect(data).toEqual({ status: "active", price: 17.5, passenger_id: passenger.id, is_paid: false, added_by_driver: false });
    expect(await w.seatsLeft(passenger, route, date)).toBe(2);
  });

  // Several dates of a recurring route, with the same stops (spec C4).
  it("books several dates of a recurring route, each its own seat", async () => {
    const d1 = rideDay(1);
    const d2 = rideDayAfter(d1);
    const route = await w.route(driver, { kind: "recurring", date: null, seats: 1 });
    expect((await w.book(passenger, route, d1)).error).toBeNull();
    expect((await w.book(passenger, route, d2)).error).toBeNull();
    expect(code(await w.book(other, route, d1))).toContain("RIDE_FULL"); // the seat on d1 is gone, d2's too
  });
});

describe("refusals (spec C3 rules, C6)", () => {
  let route: Route;
  const date = daysFromToday(4);
  beforeAll(async () => {
    route = await w.route(driver, { date, seats: 2 });
  });

  it("a date the route doesn't run on", async () => {
    expect(code(await w.book(passenger, route, daysFromToday(5)))).toContain("RIDE_UNAVAILABLE");
  });

  it("a route that doesn't exist", async () => {
    const missing = { ...route, id: "00000000-0000-4000-8000-000000000000" };
    expect(code(await w.book(passenger, missing, date))).toContain("RIDE_UNAVAILABLE");
  });

  it("a removed route", async () => {
    const removed = await w.route(driver, { date, isActive: false });
    expect(code(await w.book(passenger, removed, date))).toContain("RIDE_UNAVAILABLE");
  });

  it("a date the driver cancelled", async () => {
    const cancelled = await w.route(driver, { date });
    await w.service.from("ride_exceptions").insert({ route_id: cancelled.id, ride_date: date, cancelled: true });
    expect(code(await w.book(passenger, cancelled, date))).toContain("RIDE_UNAVAILABLE");
  });

  it("a ride that already departed", async () => {
    const today = daysFromToday(0);
    const departed = await w.route(driver, { date: today, time: "00:00" });
    expect(code(await w.book(passenger, departed, today))).toContain("RIDE_UNAVAILABLE");
  });

  // Can't be booked by link either (spec H2).
  it("a route in a hidden group", async () => {
    const groupId = await w.group({ active: false });
    const hidden = await w.route(driver, { groupId, date });
    expect(code(await w.book(passenger, hidden, date))).toContain("RIDE_UNAVAILABLE");
  });

  // B6: the driver can't book her own ride.
  it("the driver's own ride", async () => {
    expect(code(await w.book(driver, route, date))).toContain("OWN_RIDE");
  });

  it("stops that aren't the route's, or of the wrong kind", async () => {
    const otherRoute = await w.route(driver, { date });
    expect(code(await w.book(passenger, { ...route, pickup: otherRoute.pickup }, date))).toContain("INVALID_STOP");
    expect(code(await w.book(passenger, { ...route, pickup: route.dropoff, dropoff: route.pickup }, date))).toContain("INVALID_STOP");
  });

  it("the same ride twice", async () => {
    const twice = await w.route(driver, { date, seats: 3 });
    expect((await w.book(passenger, twice, date)).error).toBeNull();
    expect(code(await w.book(passenger, twice, date))).toContain("ALREADY_BOOKED");
  });

  it("a full ride: no waiting list, no overbooking", async () => {
    const small = await w.route(driver, { date, seats: 1 });
    expect((await w.book(passenger, small, date)).error).toBeNull();
    expect(code(await w.book(other, small, date))).toContain("RIDE_FULL");
  });

  it("a signed-out visitor", async () => {
    const { error } = await w.anon.rpc("book_ride", {
      p_route_id: route.id,
      p_date: date,
      p_pickup_stop_id: route.pickup,
      p_dropoff_stop_id: route.dropoff,
    });
    expect(error).not.toBeNull();
  });

  it("can book again after cancelling", async () => {
    const again = await w.route(driver, { date, seats: 1 });
    const { data: id } = await w.book(passenger, again, date);
    await passenger.db.rpc("cancel_booking", { p_booking_id: id });
    expect((await w.book(passenger, again, date)).error).toBeNull();
  });
});

// Bookings on a route are handled one at a time (spec C5).
describe("two passengers race for the last seat", () => {
  it("exactly one gets it", async () => {
    const date = daysFromToday(5);
    const route = await w.route(driver, { date, seats: 1 });
    const results = await Promise.all([w.book(passenger, route, date), w.book(other, route, date)]);

    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.filter((r) => r.error?.message.includes("RIDE_FULL"))).toHaveLength(1);
    expect(await w.seatsLeft(passenger, route, date)).toBe(0);
  });

  it("many at once never exceed the seats", async () => {
    const date = daysFromToday(5);
    const route = await w.route(driver, { date, seats: 3 });
    const crowd = await Promise.all(Array.from({ length: 6 }, (_, i) => w.user(`Crowd${i}`)));
    const results = await Promise.all(crowd.map((u) => w.book(u, route, date)));
    expect(results.filter((r) => r.error === null)).toHaveLength(3);
    const { count } = await w.service.from("bookings").select("id", { count: "exact", head: true }).eq("route_id", route.id).eq("status", "active");
    expect(count).toBe(3);
  });
});

describe("what a passenger can change herself", () => {
  let route: Route;
  let bookingId: string;
  const date = daysFromToday(6);
  beforeAll(async () => {
    route = await w.route(driver, { date, seats: 4 });
    bookingId = (await w.book(passenger, route, date)).data as string;
  });

  it("she can't insert a booking directly", async () => {
    const { error } = await other.db.from("bookings").insert({
      route_id: route.id,
      ride_date: date,
      passenger_id: other.id,
      pickup_stop_id: route.pickup,
      dropoff_stop_id: route.dropoff,
    });
    expect(error?.code).toBe(DENIED);
  });

  it("she can't change the status, price or stops directly", async () => {
    for (const patch of [{ status: "cancelled" }, { price: 0 }, { pickup_stop_id: route.dropoff }]) {
      const { error } = await passenger.db.from("bookings").update(patch).eq("id", bookingId);
      expect(error?.code).toBe(DENIED);
    }
  });

  it("she can't delete it", async () => {
    const { error } = await passenger.db.from("bookings").delete().eq("id", bookingId);
    expect(error?.code).toBe(DENIED);
  });

  // The paid mark (spec G2).
  it("she marks it paid and unpaid", async () => {
    expect((await passenger.db.from("bookings").update({ is_paid: true }).eq("id", bookingId)).error).toBeNull();
    expect((await w.service.from("bookings").select("is_paid").eq("id", bookingId).single()).data!.is_paid).toBe(true);
    await passenger.db.from("bookings").update({ is_paid: false }).eq("id", bookingId);
    expect((await w.service.from("bookings").select("is_paid").eq("id", bookingId).single()).data!.is_paid).toBe(false);
  });

  // The driver never sees or sets payment marks (spec G2, §5).
  it("nobody else can set her paid mark, not even the driver", async () => {
    for (const user of [driver, other]) {
      const { data } = await user.db.from("bookings").update({ is_paid: true }).eq("id", bookingId).select();
      expect(data ?? []).toEqual([]);
    }
    expect((await w.service.from("bookings").select("is_paid").eq("id", bookingId).single()).data!.is_paid).toBe(false);
  });
});
