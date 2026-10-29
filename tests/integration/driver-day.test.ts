import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, daysFromToday, rideDay, weekdayOf, type User, type World } from "./support/world";

// The driver's weekly dashboard (spec D1): driver_rides and driver_passengers.

let w: World;
let driver: User;
let otherDriver: User;
let passenger: User;

beforeAll(async () => {
  w = createWorld();
  [driver, otherDriver, passenger] = await Promise.all([
    w.user("Driver"),
    w.user("OtherDriver"),
    w.user("Passenger", { fullName: "רחל נוסעת" }),
  ]);
});
afterAll(() => w?.cleanup());

type Ride = { route_id: string; booked: number; seats: number; cancelled: boolean; kind: string; out_time: string };
type Passenger = { route_id: string; passenger_name: string; passenger_phone: string | null; passenger_email: string | null; added_by_driver: boolean; pickup_label: string; dropoff_label: string };

const ridesOn = async (user: User, date: string) => (await user.db.rpc("driver_rides", { p_date: date })).data as Ride[];
const passengersOn = async (user: User, date: string) => (await user.db.rpc("driver_passengers", { p_date: date })).data as Passenger[];

describe("driver_rides", () => {
  it("lists the driver's rides that run on the date, with seats and bookings", async () => {
    const date = rideDay(2);
    const oneTime = await w.route(driver, { date, seats: 3, time: "07:00" });
    const recurring = await w.route(driver, { kind: "recurring", weekdays: [weekdayOf(date)], date: null, time: "06:00" });
    await w.book(passenger, oneTime, date);

    const rides = await ridesOn(driver, date);
    const ids = rides.map((r) => r.route_id);
    expect(ids).toEqual(expect.arrayContaining([oneTime.id, recurring.id]));
    expect(ids.indexOf(recurring.id)).toBeLessThan(ids.indexOf(oneTime.id)); // by departure time
    expect(rides.find((r) => r.route_id === oneTime.id)).toMatchObject({ booked: 1, seats: 3, cancelled: false });
  });

  it("leaves out dates the route doesn't run on", async () => {
    const date = rideDay(2);
    const route = await w.route(driver, { kind: "recurring", weekdays: [(weekdayOf(date) + 1) % 6], date: null });
    expect((await ridesOn(driver, date)).map((r) => r.route_id)).not.toContain(route.id);
  });

  // Removed routes don't appear (spec D1, F1).
  it("leaves out removed routes", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date, isActive: false });
    expect((await ridesOn(driver, date)).map((r) => r.route_id)).not.toContain(route.id);
  });

  it("shows only the driver's own rides", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    expect((await ridesOn(otherDriver, date)).map((r) => r.route_id)).not.toContain(route.id);
    expect(await ridesOn(passenger, date)).toEqual([]);
  });

  // Booked counts drop when a passenger cancels (spec E1).
  it("counts only active bookings", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date, seats: 3 });
    const { data: id } = await w.book(passenger, route, date);
    await passenger.db.rpc("cancel_booking", { p_booking_id: id });
    expect((await ridesOn(driver, date)).find((r) => r.route_id === route.id)?.booked).toBe(0);
  });

  // Past weeks are visible through the dashboard's date picker (spec §8).
  it("shows past dates too", async () => {
    const past = daysFromToday(-5);
    const route = await w.route(driver, { date: past });
    expect((await ridesOn(driver, past)).map((r) => r.route_id)).toContain(route.id);
  });
});

describe("driver_passengers (spec D1, C3, §5)", () => {
  it("shows each self-booked passenger's name, phone, email and stops", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    await w.book(passenger, route, date);

    const rows = (await passengersOn(driver, date)).filter((p) => p.route_id === route.id);
    expect(rows).toEqual([
      expect.objectContaining({
        passenger_name: "רחל נוסעת",
        passenger_phone: passenger.phone,
        passenger_email: passenger.email,
        added_by_driver: false,
        pickup_label: "Pickup A",
        dropoff_label: "Dropoff B",
      }),
    ]);
  });

  // A passenger's new name and phone reach her drivers (spec A3).
  it("shows the passenger's current profile details", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    const changing = await w.user("Changing");
    await w.book(changing, route, date);
    await changing.db.from("profiles").update({ full_name: "שם חדש", phone: "050-999-0000" }).eq("id", changing.id);

    const row = (await passengersOn(driver, date)).find((p) => p.route_id === route.id);
    expect(row).toMatchObject({ passenger_name: "שם חדש", passenger_phone: "050-999-0000" });
  });

  it("shows a guest with the details the driver entered, without an email", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    await w.addGuest(driver, route, date, { name: "אורחת", phone: "052-111-2222" });
    const row = (await passengersOn(driver, date)).find((p) => p.route_id === route.id);
    expect(row).toMatchObject({ passenger_name: "אורחת", passenger_phone: "052-111-2222", passenger_email: null, added_by_driver: true });
  });

  it("leaves out cancelled bookings", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    const { data: id } = await w.book(passenger, route, date);
    await passenger.db.rpc("cancel_booking", { p_booking_id: id });
    expect((await passengersOn(driver, date)).filter((p) => p.route_id === route.id)).toEqual([]);
  });

  it("shows nothing about another driver's passengers", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    await w.book(passenger, route, date);
    expect((await passengersOn(otherDriver, date)).filter((p) => p.route_id === route.id)).toEqual([]);
    expect((await passengersOn(passenger, date)).filter((p) => p.route_id === route.id)).toEqual([]);
  });
});
