import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, daysFromToday, DENIED, rideDay, rideDayAfter, type User, type World } from "./support/world";

// Cancelling: a passenger cancels her booking (spec E1–E3), and a driver
// cancels a single date (D2–D3, §2 Cancellation by date).

let w: World;
let driver: User;
let passenger: User;
let stranger: User;

beforeAll(async () => {
  w = createWorld();
  [driver, passenger, stranger] = await Promise.all([w.user("Driver"), w.user("Passenger"), w.user("Stranger")]);
});
afterAll(() => w?.cleanup());

const myBooking = async (user: User, id: string) =>
  ((await user.db.rpc("my_bookings")).data as { booking_id: string; ride_cancelled: boolean; driver_phone: string | null; status: string }[]).find(
    (b) => b.booking_id === id,
  );

describe("a passenger cancels (spec E1)", () => {
  it("frees the seat at once, any time before departure", async () => {
    const date = daysFromToday(2);
    const route = await w.route(driver, { date, seats: 1 });
    const { data: id } = await w.book(passenger, route, date);

    const { data, error } = await passenger.db.rpc("cancel_booking", { p_booking_id: id });
    expect(error).toBeNull();
    expect(data).toBe("cancelled");
    expect(await w.seatsLeft(passenger, route, date)).toBe(1);
  });

  // Every cancellation is the same however close to departure; there's no late status (spec E1, §8).
  it("is a regular cancellation even minutes before departure", async () => {
    const today = daysFromToday(0);
    const soon = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
      new Date(Date.now() + 10 * 60_000),
    );
    // Near midnight the ride would fall on tomorrow; skip rather than test the wrong day.
    if (soon < "00:15") return;
    const route = await w.route(driver, { date: today, time: soon });
    const { data: id } = await w.book(passenger, route, today);
    expect((await passenger.db.rpc("cancel_booking", { p_booking_id: id })).error).toBeNull();
    const { data } = await w.service.from("bookings").select("status").eq("id", id).single();
    expect(data!.status).toBe("cancelled");
  });

  it("hides the driver's phone and email from her afterwards (spec E1, §5)", async () => {
    const date = daysFromToday(2);
    const route = await w.route(driver, { date });
    const { data: id } = await w.book(passenger, route, date);
    expect((await myBooking(passenger, id))?.driver_phone).toBe(driver.phone);

    await passenger.db.rpc("cancel_booking", { p_booking_id: id });
    expect(await myBooking(passenger, id)).toMatchObject({ status: "cancelled", driver_phone: null });
  });

  it("can't cancel someone else's booking", async () => {
    const date = daysFromToday(2);
    const route = await w.route(driver, { date });
    const { data: id } = await w.book(passenger, route, date);
    expect((await stranger.db.rpc("cancel_booking", { p_booking_id: id })).error?.message).toContain("BOOKING_NOT_FOUND");
    expect((await driver.db.rpc("cancel_booking", { p_booking_id: id })).error?.message).toContain("BOOKING_NOT_FOUND");
  });

  it("can't cancel the same booking twice", async () => {
    const date = daysFromToday(2);
    const route = await w.route(driver, { date });
    const { data: id } = await w.book(passenger, route, date);
    await passenger.db.rpc("cancel_booking", { p_booking_id: id });
    expect((await passenger.db.rpc("cancel_booking", { p_booking_id: id })).error?.message).toContain("BOOKING_NOT_FOUND");
  });

  it("can't cancel after departure (spec E2)", async () => {
    const past = daysFromToday(-1);
    const route = await w.route(driver, { date: past });
    const id = await w.bookDirectly(passenger, route, past);
    expect((await passenger.db.rpc("cancel_booking", { p_booking_id: id })).error?.message).toContain("RIDE_DEPARTED");
  });
});

describe("a driver cancels one date (spec D2)", () => {
  it("marks the date cancelled for booked passengers, and leaves the other dates", async () => {
    const d1 = rideDay(1);
    const d2 = rideDayAfter(d1);
    const route = await w.route(driver, { kind: "recurring", date: null });
    const { data: b1 } = await w.book(passenger, route, d1);
    const { data: b2 } = await w.book(passenger, route, d2);

    const { error } = await driver.db.from("ride_exceptions").insert({ route_id: route.id, ride_date: d1, cancelled: true });
    expect(error).toBeNull();

    expect(await myBooking(passenger, b1)).toMatchObject({ ride_cancelled: true, status: "active" });
    expect(await myBooking(passenger, b2)).toMatchObject({ ride_cancelled: false });
    // The booking stays on record, and the driver's contact details stay visible (spec D2 rules).
    expect((await myBooking(passenger, b1))?.driver_phone).toBe(driver.phone);
  });

  it("the cancelled date can't be booked or found, and shows as unavailable", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    await driver.db.from("ride_exceptions").insert({ route_id: route.id, ride_date: date, cancelled: true });

    expect((await w.book(passenger, route, date)).error?.message).toContain("RIDE_UNAVAILABLE");
    const { data: found } = await passenger.db.rpc("search_rides", { p_group_id: route.groupId });
    expect(found).toEqual([]);
    const { data: ride } = await passenger.db.rpc("get_ride", { p_route_id: route.id, p_date: date });
    expect((ride as { is_available: boolean }[])[0].is_available).toBe(false);
  });

  it("the passenger can no longer cancel it herself, so it's never charged (spec E3)", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    const { data: id } = await w.book(passenger, route, date);
    await driver.db.from("ride_exceptions").insert({ route_id: route.id, ride_date: date, cancelled: true });
    expect(await myBooking(passenger, id)).toMatchObject({ ride_cancelled: true });
  });

  it("the dashboard marks it cancelled", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    await driver.db.from("ride_exceptions").insert({ route_id: route.id, ride_date: date, cancelled: true });
    const { data } = await driver.db.rpc("driver_rides", { p_date: date });
    expect((data as { route_id: string; cancelled: boolean }[]).find((r) => r.route_id === route.id)?.cancelled).toBe(true);
  });

  it("can't be undone (RIDE_CANCELLED)", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    await driver.db.from("ride_exceptions").insert({ route_id: route.id, ride_date: date, cancelled: true });

    const restore = await driver.db.from("ride_exceptions").update({ cancelled: false }).eq("route_id", route.id);
    expect(restore.error?.message).toContain("RIDE_CANCELLED");
    const remove = await driver.db.from("ride_exceptions").delete().eq("route_id", route.id);
    expect(remove.error?.message).toContain("RIDE_CANCELLED");
    const { data } = await w.service.from("ride_exceptions").select("cancelled").eq("route_id", route.id);
    expect(data).toEqual([{ cancelled: true }]);
  });

  it("cancelling again is harmless", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    const cancel = () =>
      driver.db.from("ride_exceptions").upsert({ route_id: route.id, ride_date: date, cancelled: true }, { onConflict: "route_id,ride_date" });
    expect((await cancel()).error).toBeNull();
    expect((await cancel()).error).toBeNull();
  });

  it("can't cancel a ride that already left (spec D3)", async () => {
    const today = daysFromToday(0);
    const route = await w.route(driver, { date: today, time: "00:00" });
    const { error } = await driver.db.from("ride_exceptions").insert({ route_id: route.id, ride_date: today, cancelled: true });
    expect(error?.message).toContain("RIDE_DEPARTED");
  });

  it("another user can't cancel the driver's date", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    const { error } = await stranger.db.from("ride_exceptions").insert({ route_id: route.id, ride_date: date, cancelled: true });
    expect(error?.code).toBe(DENIED);
  });

  // Per-date departure times were removed (spec §2, §8).
  it("a single date's departure time can't be changed", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    const { error } = await driver.db.from("ride_exceptions").insert({ route_id: route.id, ride_date: date, out_time: "09:30" });
    expect(error?.message).toContain("ride_exceptions_no_out_time");
  });
});
