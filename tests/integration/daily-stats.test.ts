import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { check, createWorld, daysFromToday, DENIED, type User, type World } from "./support/world";

// The admin page's daily charts (0042, 0044). Each test checks a day's change
// in the counts, since the database holds other tests' data.

type Day = { day: string; new_users: number; visitors: number; non_driver_visitors: number; passengers: number };
type Counts = Omit<Day, "day">;

let w: World;
let admin: User;

async function dayRow(day = daysFromToday(0)) {
  const days = check(await admin.db.rpc("admin_daily_stats", { p_from: daysFromToday(-2) })) as Day[];
  return days.find((d) => d.day === day)!;
}
const todayRow = () => dayRow();

async function changeFrom(before: Day): Promise<Counts> {
  const after = await dayRow(before.day);
  return {
    new_users: after.new_users - before.new_users,
    visitors: after.visitors - before.visitors,
    non_driver_visitors: after.non_driver_visitors - before.non_driver_visitors,
    passengers: after.passengers - before.passengers,
  };
}

const none: Counts = { new_users: 0, visitors: 0, non_driver_visitors: 0, passengers: 0 };

beforeAll(async () => {
  w = createWorld();
  admin = await w.user("Admin", { admin: true });
});
afterAll(() => w?.cleanup());

describe("daily counts (0042)", () => {
  it("returns one row a day, from the given date to today", async () => {
    const days = check(await admin.db.rpc("admin_daily_stats", { p_from: daysFromToday(-2) })) as Day[];
    expect(days.map((d) => d.day)).toEqual([daysFromToday(-2), daysFromToday(-1), daysFromToday(0)]);
  });

  it("counts a new member, and a passenger's visit once a day", async () => {
    const before = await todayRow();
    const passenger = await w.user("Passenger");
    expect(await changeFrom(before)).toEqual({ ...none, new_users: 1 });

    check(await passenger.db.rpc("record_visit"));
    check(await passenger.db.rpc("record_visit"));
    expect(await changeFrom(before)).toEqual({ ...none, new_users: 1, visitors: 1, non_driver_visitors: 1 });
  });

  it("counts a driver's visit among everyone, not among those without a route", async () => {
    const driver = await w.user("Driver");
    await w.route(driver);
    const before = await todayRow();
    check(await driver.db.rpc("record_visit"));
    expect(await changeFrom(before)).toEqual({ ...none, visitors: 1 });
  });

  it("leaves out members who haven't finished sign-up", async () => {
    const before = await todayRow();
    const unfinished = await w.user("Unfinished", { phone: null });
    check(await unfinished.db.rpc("record_visit"));
    expect(await changeFrom(before)).toEqual(none);
  });

  it("counts each passenger on a departed ride on its date", async () => {
    const yesterday = daysFromToday(-1);
    const [driver, passenger, other] = await Promise.all([w.user("Driver"), w.user("Passenger"), w.user("Other")]);
    const route = await w.route(driver, { date: yesterday, seats: 4 });
    const before = await dayRow(yesterday);
    await w.bookDirectly(passenger, route, yesterday);
    await w.bookDirectly(other, route, yesterday);
    expect(await changeFrom(before)).toEqual({ ...none, passengers: 2 });
  });

  it("leaves out a cancelled booking, a cancelled date and a ride still to come", async () => {
    const yesterday = daysFromToday(-1);
    const [driver, passenger] = await Promise.all([w.user("Driver"), w.user("Passenger")]);
    const [cancelledBooking, cancelledDate, upcoming] = await Promise.all([
      w.route(driver, { date: yesterday }),
      w.route(driver, { date: yesterday }),
      w.route(driver, { date: daysFromToday(0), time: "23:59" }),
    ]);
    const [beforeYesterday, beforeToday] = await Promise.all([dayRow(yesterday), todayRow()]);

    const booking = await w.bookDirectly(passenger, cancelledBooking, yesterday);
    check(await w.service.from("bookings").update({ status: "cancelled" }).eq("id", booking));
    await w.bookDirectly(passenger, cancelledDate, yesterday);
    check(await w.service.from("ride_exceptions").insert({ route_id: cancelledDate.id, ride_date: yesterday, cancelled: true }));
    await w.bookDirectly(passenger, upcoming, daysFromToday(0));

    expect(await changeFrom(beforeYesterday)).toEqual(none);
    expect(await changeFrom(beforeToday)).toEqual(none);
  });

  it("is for admins only", async () => {
    const member = await w.user("Member");
    expect(check(await member.db.rpc("admin_daily_stats", { p_from: daysFromToday(-2) }))).toEqual([]);
    expect((await w.anon.rpc("admin_daily_stats", { p_from: daysFromToday(-2) })).error?.code).toBe(DENIED);
    expect((await w.anon.rpc("record_visit")).error?.code).toBe(DENIED);
  });

  it("keeps the visits table closed to direct reads", async () => {
    expect(check(await admin.db.from("daily_visits").select("day"))).toEqual([]);
  });
});
