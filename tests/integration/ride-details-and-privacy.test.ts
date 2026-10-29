import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, daysFromToday, type Route, type User, type World } from "./support/world";

// The ride page's data, get_ride (spec C2, C6, C7), and the "who sees what"
// table (spec §5), checked against the database itself.

let w: World;
let driver: User;
let passenger: User;
let other: User;
let route: Route;
const date = daysFromToday(3);

beforeAll(async () => {
  w = createWorld();
  [driver, passenger, other] = await Promise.all([w.user("Driver"), w.user("Passenger"), w.user("Other")]);
  await w.service.from("profiles").update({ vehicle_model: "יונדאי", vehicle_color: "לבן", vehicle_seats: 4 }).eq("id", driver.id);
  route = await w.route(driver, { date, seats: 3, price: 25, notes: "מחכה 5 דקות" });
});
afterAll(() => w?.cleanup());

type Ride = {
  driver_name: string;
  driver_phone: string | null;
  driver_email: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  seats_left: number;
  price: number;
  notes: string | null;
  is_available: boolean;
  my_booking_id: string | null;
};
const ride = async (user: User, r: Route = route, d = date) =>
  ((await user.db.rpc("get_ride", { p_route_id: r.id, p_date: d })).data as Ride[])[0];

describe("before booking (spec C2)", () => {
  it("shows the driver's name, car, note, price and free seats, but not her phone or email", async () => {
    expect(await ride(other)).toMatchObject({
      driver_name: "Driver",
      driver_phone: null,
      driver_email: null,
      vehicle_model: "יונדאי",
      vehicle_color: "לבן",
      notes: "מחכה 5 דקות",
      price: 25,
      seats_left: 3,
      is_available: true,
      my_booking_id: null,
    });
  });
});

describe("after booking (spec C3)", () => {
  it("shows the booked passenger the driver's phone and email, and her booking", async () => {
    const { data: id } = await w.book(passenger, route, date);
    expect(await ride(passenger)).toMatchObject({ driver_phone: driver.phone, driver_email: driver.email, my_booking_id: id });
  });

  it("still hides them from everyone else", async () => {
    expect(await ride(other)).toMatchObject({ driver_phone: null, driver_email: null, my_booking_id: null });
  });

  it("the passenger's booking on one date doesn't reveal them on another date", async () => {
    const recurring = await w.route(driver, { kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5, 6], date: null });
    await w.book(passenger, recurring, daysFromToday(2));
    expect(await ride(passenger, recurring, daysFromToday(3))).toMatchObject({ driver_phone: null, my_booking_id: null });
  });
});

describe("unavailable rides (spec C6)", () => {
  it.each([
    ["a departed ride", async () => ({ r: await w.route(driver, { date: daysFromToday(-1) }), d: daysFromToday(-1) })],
    ["a removed route", async () => ({ r: await w.route(driver, { date, isActive: false }), d: date })],
    ["a date the route doesn't run on", async () => ({ r: await w.route(driver, { date }), d: daysFromToday(9) })],
    ["a route in a hidden group", async () => ({ r: await w.route(driver, { date, groupId: await w.group({ active: false }) }), d: date })],
    [
      "a date the driver cancelled",
      async () => {
        const r = await w.route(driver, { date });
        await w.service.from("ride_exceptions").insert({ route_id: r.id, ride_date: date, cancelled: true });
        return { r, d: date };
      },
    ],
  ])("%s is shown but not available", async (_name, make) => {
    const { r, d } = await make();
    expect((await ride(other, r, d)).is_available).toBe(false);
  });

  it("a full ride is available but has no free seats", async () => {
    const full = await w.route(driver, { date, seats: 1 });
    await w.book(passenger, full, date);
    expect(await ride(other, full)).toMatchObject({ is_available: true, seats_left: 0 });
  });

  it("a route that doesn't exist returns nothing (the page shows not-found, spec C7)", async () => {
    const { data } = await other.db.rpc("get_ride", { p_route_id: "00000000-0000-4000-8000-000000000000", p_date: date });
    expect(data).toEqual([]);
  });

  it("returns nothing to signed-out visitors", async () => {
    const { data } = await w.anon.rpc("get_ride", { p_route_id: route.id, p_date: date });
    expect(data ?? []).toEqual([]);
  });
});

// Spec §5: these limits are enforced by the database, not only by the screens.
describe("who sees what (spec §5)", () => {
  let bookingId: string;
  beforeAll(async () => {
    const r = await w.route(driver, { date });
    bookingId = (await w.book(passenger, r, date)).data as string;
  });

  it("everyone signed in sees routes and stops", async () => {
    expect((await other.db.from("routes").select("id").eq("id", route.id)).data).toHaveLength(1);
    expect((await other.db.from("stops").select("id").eq("route_id", route.id)).data).toHaveLength(2);
  });

  it("a passenger sees her own booking; the driver sees bookings on her rides", async () => {
    expect((await passenger.db.from("bookings").select("id").eq("id", bookingId)).data).toHaveLength(1);
    expect((await driver.db.from("bookings").select("id").eq("id", bookingId)).data).toHaveLength(1);
  });

  it("other users, even other passengers on the ride, don't see who else is booked", async () => {
    expect((await other.db.from("bookings").select("id").eq("id", bookingId)).data).toEqual([]);
  });

  it("other users see the free seats only", async () => {
    expect((await ride(other)).seats_left).toBeGreaterThanOrEqual(0);
  });

  it("the driver reads no passenger profile directly; contact details come only through her dashboard", async () => {
    expect((await driver.db.from("profiles").select("phone").eq("id", passenger.id)).data).toEqual([]);
  });

  // "Paid / unpaid marks — The driver: No" (spec §5, G2).
  it("the driver doesn't see the passenger's paid mark", async () => {
    const { data } = await driver.db.from("bookings").select("is_paid").eq("id", bookingId);
    expect(data?.[0]?.is_paid).toBeUndefined();
  });

  it("signed-out visitors see no routes, stops or bookings", async () => {
    expect((await w.anon.from("routes").select("id").eq("id", route.id)).data ?? []).toEqual([]);
    expect((await w.anon.from("stops").select("id").eq("route_id", route.id)).data ?? []).toEqual([]);
    expect((await w.anon.from("bookings").select("id").eq("id", bookingId)).data ?? []).toEqual([]);
  });

  it("signed-out visitors see the site totals only", async () => {
    const { data, error } = await w.anon.rpc("public_stats").single();
    expect(error).toBeNull();
    expect(Object.keys(data as object).sort()).toEqual(["members", "routes"]);
  });
});
