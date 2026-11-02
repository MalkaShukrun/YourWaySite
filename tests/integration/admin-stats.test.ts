import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { check, createWorld, daysFromToday, DENIED, type Route, type User, weekdayOf, type World } from "./support/world";

// The admin page's site-wide totals (spec H5). Each test checks the change in
// the totals, since the database holds other tests' data.

type Stats = {
  users: number;
  rides_today: number;
  passengers_today: number;
  rides_departed: number;
  passengers_departed: number;
};

let w: World;
let admin: User;
let driver: User;
let passenger: User;
let other: User;

const stats = async () => check(await admin.db.rpc("admin_stats").single<Stats>());

async function changeFrom(before: Stats) {
  const after = await stats();
  return Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value - before[key as keyof Stats]]));
}

const none = { users: 0, rides_today: 0, passengers_today: 0, rides_departed: 0, passengers_departed: 0 };
const today = () => daysFromToday(0);
const yesterday = () => daysFromToday(-1);

function oneTime(date: string, time: string) {
  return w.route(driver, { kind: "one_time", date, time, seats: 4 });
}

async function cancelDate(route: Route, date: string) {
  check(await w.service.from("ride_exceptions").insert({ route_id: route.id, ride_date: date, cancelled: true }));
}

beforeAll(async () => {
  w = createWorld();
  [admin, driver, passenger, other] = await Promise.all([
    w.user("Admin", { admin: true }),
    w.user("Driver"),
    w.user("Passenger"),
    w.user("Other"),
  ]);
});
afterAll(() => w?.cleanup());

describe("today (spec H5)", () => {
  it("counts a ride with its passengers", async () => {
    const before = await stats();
    const route = await oneTime(today(), "23:59");
    await w.bookDirectly(passenger, route, today());
    await w.bookDirectly(other, route, today());
    expect(await changeFrom(before)).toEqual({ ...none, rides_today: 1, passengers_today: 2 });
  });

  it("counts a ride nobody booked yet", async () => {
    const before = await stats();
    await oneTime(today(), "23:59");
    expect(await changeFrom(before)).toEqual({ ...none, rides_today: 1 });
  });

  it("counts passengers a driver added", async () => {
    const route = await oneTime(today(), "23:59");
    const before = await stats();
    check(await w.addGuest(driver, route, today()));
    expect(await changeFrom(before)).toEqual({ ...none, passengers_today: 1 });
  });

  it("leaves out a date the driver cancelled", async () => {
    const before = await stats();
    const route = await oneTime(today(), "23:59");
    await w.bookDirectly(passenger, route, today());
    await cancelDate(route, today());
    expect(await changeFrom(before)).toEqual(none);
  });

  it("leaves out a passenger who cancelled", async () => {
    const route = await oneTime(today(), "23:59");
    const before = await stats();
    const id = await w.bookDirectly(passenger, route, today());
    check(await passenger.db.rpc("cancel_booking", { p_booking_id: id }));
    expect(await changeFrom(before)).toEqual(none);
  });
});

describe("to date (spec H5)", () => {
  it("counts a departed ride once, and each of its passengers", async () => {
    const before = await stats();
    const route = await oneTime(yesterday(), "08:00");
    await w.bookDirectly(passenger, route, yesterday());
    await w.bookDirectly(other, route, yesterday());
    expect(await changeFrom(before)).toEqual({ ...none, rides_departed: 1, passengers_departed: 2 });
  });

  it("counts each date of a recurring route as its own ride", async () => {
    const dates = [daysFromToday(-14), daysFromToday(-7)];
    const before = await stats();
    const route = await w.route(driver, { kind: "recurring", weekdays: [weekdayOf(dates[0])], seats: 4 });
    for (const date of dates) await w.bookDirectly(passenger, route, date);
    const change = await changeFrom(before);
    expect(change.rides_departed).toBe(2);
    expect(change.passengers_departed).toBe(2);
  });

  it("doesn't count a departed ride nobody was on", async () => {
    const before = await stats();
    await oneTime(yesterday(), "08:00");
    expect(await changeFrom(before)).toEqual(none);
  });

  it("doesn't count a cancelled date or a ride still to come", async () => {
    const before = await stats();
    const cancelled = await oneTime(yesterday(), "08:00");
    await w.bookDirectly(passenger, cancelled, yesterday());
    await cancelDate(cancelled, yesterday());
    const upcoming = await oneTime(daysFromToday(1), "08:00");
    await w.bookDirectly(passenger, upcoming, daysFromToday(1));
    expect(await changeFrom(before)).toEqual(none);
  });

  it("keeps a departed ride after the route was removed", async () => {
    const route = await oneTime(yesterday(), "08:00");
    await w.bookDirectly(passenger, route, yesterday());
    const before = await stats();
    check(await w.service.from("routes").update({ is_active: false }).eq("id", route.id));
    expect(await changeFrom(before)).toEqual(none);
  });
});

describe("users and access (spec H5)", () => {
  it("counts only users who finished sign-up", async () => {
    const before = await stats();
    await w.user("Finished");
    await w.user("Unfinished", { phone: null });
    expect(await changeFrom(before)).toEqual({ ...none, users: 1 });
  });

  it("returns nothing to a regular user", async () => {
    const { data, error } = await passenger.db.rpc("admin_stats");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("is closed to visitors who aren't signed in", async () => {
    const { error } = await w.anon.rpc("admin_stats");
    expect(error?.code).toBe(DENIED);
  });
});
