import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, daysFromToday, type User, type World } from "./support/world";

// Removing a route (spec F1–F3): its upcoming booked dates become cancelled by
// the driver, history stays, and a one-time ride that took place can't be removed.

let w: World;
let driver: User;
let passenger: User;

beforeAll(async () => {
  w = createWorld();
  [driver, passenger] = await Promise.all([w.user("Driver"), w.user("Passenger")]);
});
afterAll(() => w?.cleanup());

const remove = (id: string) => driver.db.from("routes").update({ is_active: false }).eq("id", id);
const exceptionsOf = async (id: string) =>
  ((await w.service.from("ride_exceptions").select("ride_date, cancelled").eq("route_id", id).order("ride_date")).data ?? []) as {
    ride_date: string;
    cancelled: boolean;
  }[];
type Mine = { booking_id: string; ride_cancelled: boolean; status: string };
const mine = async (user: User) => (await user.db.rpc("my_bookings")).data as Mine[];

describe("a route with upcoming bookings (spec F1)", () => {
  it("marks exactly the booked upcoming dates as cancelled by the driver", async () => {
    const route = await w.route(driver, { kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5, 6], date: null, seats: 3 });
    const [d1, d2, unbooked] = [daysFromToday(2), daysFromToday(4), daysFromToday(3)];
    const { data: b1 } = await w.book(passenger, route, d1);
    const { data: b2 } = await w.book(passenger, route, d2);

    expect((await remove(route.id)).error).toBeNull();

    expect(await exceptionsOf(route.id)).toEqual([
      { ride_date: d1, cancelled: true },
      { ride_date: d2, cancelled: true },
    ]);
    expect((await exceptionsOf(route.id)).map((x) => x.ride_date)).not.toContain(unbooked);
    const rows = await mine(passenger);
    expect(rows.find((b) => b.booking_id === b1)).toMatchObject({ ride_cancelled: true, status: "active" });
    expect(rows.find((b) => b.booking_id === b2)).toMatchObject({ ride_cancelled: true });
  });

  it("a passenger who booked one date sees one cancelled ride", async () => {
    const route = await w.route(driver, { kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5, 6], date: null });
    const { data: id } = await w.book(passenger, route, daysFromToday(3));
    await remove(route.id);
    const cancelled = (await mine(passenger)).filter((b) => b.ride_cancelled && b.booking_id === id);
    expect(cancelled).toHaveLength(1);
    expect(await exceptionsOf(route.id)).toHaveLength(1);
  });

  it("leaves rides that already departed as they were, in history and payments", async () => {
    const route = await w.route(driver, { kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5, 6], date: daysFromToday(-10) });
    const past = daysFromToday(-2);
    const pastBooking = await w.bookDirectly(passenger, route, past);
    await remove(route.id);
    expect((await exceptionsOf(route.id)).map((x) => x.ride_date)).not.toContain(past);
    expect((await mine(passenger)).find((b) => b.booking_id === pastBooking)).toMatchObject({ ride_cancelled: false, status: "active" });
  });

  it("disappears from search and the driver's dashboard", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    await remove(route.id);
    expect((await passenger.db.rpc("search_rides", { p_group_id: route.groupId })).data).toEqual([]);
    const rides = (await driver.db.rpc("driver_rides", { p_date: date })).data as { route_id: string }[];
    expect(rides.map((r) => r.route_id)).not.toContain(route.id);
  });

  it("a route without bookings is removed without cancelling anything", async () => {
    const route = await w.route(driver);
    await remove(route.id);
    expect(await exceptionsOf(route.id)).toEqual([]);
  });
});

describe("a one-time ride that took place (spec F2)", () => {
  it("can't be removed", async () => {
    const route = await w.route(driver, { date: daysFromToday(-1) });
    const { error } = await remove(route.id);
    expect(error?.message).toContain("RIDE_PAST");
    expect((await w.service.from("routes").select("is_active").eq("id", route.id).single()).data!.is_active).toBe(true);
  });

  it("an upcoming one-time ride can be removed", async () => {
    const route = await w.route(driver, { date: daysFromToday(1), time: "00:00" });
    expect((await remove(route.id)).error).toBeNull();
  });

  // Only one-time rides are kept this way; a recurring route with past dates can be removed.
  it("doesn't apply to a recurring route with past dates", async () => {
    const route = await w.route(driver, { kind: "recurring", date: daysFromToday(-30) });
    expect((await remove(route.id)).error).toBeNull();
  });
});

// Hiding the buttons is done in the page only; the database doesn't block it (spec F3 note, §8).
describe("a one-time ride cancelled for its date (spec F3)", () => {
  it("can still be removed through the database", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    await driver.db.from("ride_exceptions").insert({ route_id: route.id, ride_date: date, cancelled: true });
    expect((await remove(route.id)).error).toBeNull();
  });
});
