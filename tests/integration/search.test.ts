import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, daysFromToday, rideDay, rideDayAfter, weekdayOf, type User, type World } from "./support/world";

// Ride search, search_rides (spec C1, B1, B2, H2): the 7-day window, the
// filters, and the rides it never lists. Each test searches its own group, so
// other data in the database doesn't matter.

let w: World;
let driver: User;
let passenger: User;

beforeAll(async () => {
  w = createWorld();
  [driver, passenger] = await Promise.all([w.user("Driver"), w.user("Passenger")]);
});
afterAll(() => w?.cleanup());

type Row = { route_id: string; ride_date: string; out_time: string; kind: string; seats_left: number; notes: string | null; driver_name: string; origin: string };

async function search(groupId: string, filters: Record<string, unknown> = {}, user = passenger) {
  const { data, error } = await user.db.rpc("search_rides", { p_group_id: groupId, ...filters });
  if (error) throw new Error(error.message);
  return data as Row[];
}

describe("the window (spec C1)", () => {
  it("without a date, lists rides from today through the next 6 days", async () => {
    const groupId = await w.group();
    const inWindow = await w.route(driver, { groupId, date: daysFromToday(6) });
    const outside = await w.route(driver, { groupId, date: daysFromToday(7) });
    const ids = (await search(groupId)).map((r) => r.route_id);
    expect(ids).toContain(inWindow.id);
    expect(ids).not.toContain(outside.id);
  });

  it("with a date, lists that day only, even beyond the week", async () => {
    const groupId = await w.group();
    const later = await w.route(driver, { groupId, date: daysFromToday(20) });
    const other = await w.route(driver, { groupId, date: daysFromToday(2) });
    const rows = await search(groupId, { p_date: daysFromToday(20) });
    expect(rows.map((r) => r.route_id)).toEqual([later.id]);
    expect(rows.map((r) => r.route_id)).not.toContain(other.id);
  });

  // A recurring route produces a ride on each of its weekdays, from its start date (spec B1, §2).
  it("lists a recurring route once per weekday from its start date, never on Saturday", async () => {
    const groupId = await w.group();
    await w.route(driver, { groupId, kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5], date: daysFromToday(3), time: "12:00" });
    const expected = [3, 4, 5, 6].map(daysFromToday).filter((d) => weekdayOf(d) !== 6);
    expect((await search(groupId)).map((r) => r.ride_date)).toEqual(expected);
  });

  it("lists only the route's own weekdays", async () => {
    const groupId = await w.group();
    await w.route(driver, { groupId, kind: "recurring", weekdays: [1], date: null, time: "23:59" }); // Mondays
    const rows = await search(groupId);
    expect(rows).toHaveLength(1); // one Monday in any 7 days
    expect(weekdayOf(rows[0].ride_date)).toBe(1);
  });
});

describe("rides search never lists (spec C1)", () => {
  it("a ride that already departed", async () => {
    const groupId = await w.group();
    await w.route(driver, { groupId, date: daysFromToday(0), time: "00:00" });
    expect(await search(groupId, { p_date: daysFromToday(0) })).toEqual([]);
  });

  it("a date in the past, even asked for", async () => {
    const groupId = await w.group();
    await w.route(driver, { groupId, date: daysFromToday(-3) });
    expect(await search(groupId, { p_date: daysFromToday(-3) })).toEqual([]);
  });

  it("a date the driver cancelled — the route's other dates stay", async () => {
    const groupId = await w.group();
    const d1 = rideDay(1);
    const d2 = rideDayAfter(d1);
    const route = await w.route(driver, { groupId, kind: "recurring", weekdays: [weekdayOf(d1), weekdayOf(d2)], date: null, time: "12:00" });
    await w.service.from("ride_exceptions").insert({ route_id: route.id, ride_date: d1, cancelled: true });
    const dates = (await search(groupId)).map((r) => r.ride_date);
    expect(dates).not.toContain(d1);
    expect(dates).toContain(d2);
  });

  it("a removed route", async () => {
    const groupId = await w.group();
    await w.route(driver, { groupId, isActive: false });
    expect(await search(groupId)).toEqual([]);
  });

  it("a route in a hidden group (spec H2)", async () => {
    const groupId = await w.group({ active: false });
    const route = await w.route(driver, { groupId });
    expect(await search(groupId)).toEqual([]);
    expect((await search(null as unknown as string)).map((r) => r.route_id)).not.toContain(route.id);
  });

  it("anything for signed-out visitors", async () => {
    const groupId = await w.group();
    await w.route(driver, { groupId });
    const { data } = await w.anon.rpc("search_rides", { p_group_id: groupId });
    expect(data ?? []).toEqual([]);
  });
});

describe("filters (spec C1)", () => {
  let groupId: string;
  beforeAll(async () => {
    groupId = await w.group();
    const date = daysFromToday(4);
    await w.route(driver, { groupId, date, time: "06:59" });
    await w.route(driver, { groupId, date, time: "07:00" });
    await w.route(driver, { groupId, date, time: "09:00" });
    await w.route(driver, { groupId, date, time: "09:01" });
    await w.route(driver, { groupId, kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5], date: null, time: "08:00" });
  });

  it("'from' includes rides leaving at that time", async () => {
    const times = (await search(groupId, { p_date: daysFromToday(4), p_from_time: "07:00" })).map((r) => r.out_time);
    expect(times).not.toContain("06:59:00");
    expect(times).toContain("07:00:00");
  });

  // The app sends "until 09:00" as before 09:01 (lib/rides/data.ts), so 09:00 is included.
  it("'until' is exclusive in the database", async () => {
    const times = (await search(groupId, { p_date: daysFromToday(4), p_to_time: "09:01" })).map((r) => r.out_time);
    expect(times).toContain("09:00:00");
    expect(times).not.toContain("09:01:00");
  });

  it("filters by ride type", async () => {
    const recurring = await search(groupId, { p_kind: "recurring" });
    const oneTime = await search(groupId, { p_kind: "one_time" });
    expect(recurring.length).toBeGreaterThan(0);
    expect(recurring.every((r) => r.kind === "recurring")).toBe(true);
    expect(oneTime.map((r) => r.kind)).toEqual(["one_time", "one_time", "one_time", "one_time"]);
  });

  it("sorts by date, then time", async () => {
    const rows = await search(groupId);
    const keys = rows.map((r) => `${r.ride_date} ${r.out_time}`);
    expect(keys).toEqual([...keys].sort());
  });

  it("lists every group when none is picked", async () => {
    const all = await search(null as unknown as string, { p_date: daysFromToday(4) });
    const mine = await search(groupId, { p_date: daysFromToday(4) });
    for (const ride of mine) expect(all.map((r) => r.route_id)).toContain(ride.route_id);
  });
});

describe("what a result shows", () => {
  it("free seats count every active booking, guests included; a full date still appears", async () => {
    const groupId = await w.group();
    const date = daysFromToday(3);
    const route = await w.route(driver, { groupId, date, seats: 2 });
    await w.book(passenger, route, date);
    expect((await search(groupId))[0].seats_left).toBe(1);

    await w.addGuest(driver, route, date);
    expect((await search(groupId))[0].seats_left).toBe(0); // listed, full
  });

  it("a cancelled booking frees its seat in search", async () => {
    const groupId = await w.group();
    const date = daysFromToday(3);
    const route = await w.route(driver, { groupId, date, seats: 2 });
    const { data: id } = await w.book(passenger, route, date);
    await passenger.db.rpc("cancel_booking", { p_booking_id: id });
    expect((await search(groupId))[0].seats_left).toBe(2);
  });

  it("includes the driver's name and note", async () => {
    const groupId = await w.group();
    await w.route(driver, { groupId, notes: "מחכה 5 דקות" });
    expect((await search(groupId))[0]).toMatchObject({ driver_name: "Driver", notes: "מחכה 5 דקות" });
  });

  // B6: the driver also sees her own route in search.
  it("the driver finds her own route too", async () => {
    const groupId = await w.group();
    const route = await w.route(driver, { groupId });
    expect((await search(groupId, {}, driver)).map((r) => r.route_id)).toContain(route.id);
  });
});
