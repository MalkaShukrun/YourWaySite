import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { check, createWorld, daysFromToday, DENIED, type User, type World } from "./support/world";

// The driver's daily email (spec D7): claim_daily_passenger_emails.

type Claimed = {
  driver_id: string;
  driver_email: string;
  ride_date: string;
  rides: {
    out_time: string;
    passengers: { name: string; phone: string | null; email: string | null; pickup: string }[];
  }[];
};

let w: World;
let driver: User;
let passenger: User;
const tomorrow = daysFromToday(1);

const claim = async () =>
  (check(await w.service.rpc("claim_daily_passenger_emails")) as Claimed[]).filter((c) => c.driver_id === driver.id);
const settings = (values: Record<string, unknown>) => w.service.from("profiles").update(values).eq("id", driver.id);

beforeAll(async () => {
  w = createWorld();
  // Admins only, for now (spec D7).
  [driver, passenger] = await Promise.all([w.user("Driver", { admin: true }), w.user("Passenger", { fullName: "רחל נוסעת" })]);
});
beforeEach(async () => {
  check(await w.service.from("routes").update({ is_active: false }).eq("driver_id", driver.id));
  check(await settings({ is_admin: true, daily_email_enabled: true, daily_email_time: "00:00", daily_email_sent_for: null }));
});
afterAll(() => w?.cleanup());

describe("claim_daily_passenger_emails", () => {
  it("returns tomorrow's rides with each passenger's phone, email and boarding stop", async () => {
    const route = await w.route(driver, { date: tomorrow });
    check(await w.book(passenger, route, tomorrow));

    const [email, ...others] = await claim();
    expect(others).toEqual([]);
    expect(email).toMatchObject({ driver_email: driver.email, ride_date: tomorrow });
    expect(email.rides).toEqual([
      expect.objectContaining({
        out_time: "08:00",
        passengers: [{ name: "רחל נוסעת", phone: passenger.phone, email: passenger.email, pickup: "Pickup A" }],
      }),
    ]);
  });

  it("claims a driver once per date, and again after the send is released", async () => {
    const route = await w.route(driver, { date: tomorrow });
    check(await w.book(passenger, route, tomorrow));

    expect(await claim()).toHaveLength(1);
    expect(await claim()).toEqual([]);

    check(await settings({ daily_email_sent_for: null }));
    expect(await claim()).toHaveLength(1);
  });

  it("skips a driver who didn't turn it on, or whose time hasn't come", async () => {
    const route = await w.route(driver, { date: tomorrow });
    check(await w.book(passenger, route, tomorrow));

    check(await settings({ daily_email_enabled: false }));
    expect(await claim()).toEqual([]);

    check(await settings({ daily_email_enabled: true, daily_email_time: "23:59:59" }));
    expect(await claim()).toEqual([]);
  });

  it("skips a driver who isn't an admin, even with it turned on (for now)", async () => {
    const route = await w.route(driver, { date: tomorrow });
    check(await w.book(passenger, route, tomorrow));

    check(await settings({ is_admin: false }));
    expect(await claim()).toEqual([]);
  });

  it("sends nothing for a ride with no passengers or a cancelled date", async () => {
    await w.route(driver, { date: tomorrow });
    expect(await claim()).toEqual([]);

    const route = await w.route(driver, { date: tomorrow });
    check(await w.book(passenger, route, tomorrow));
    check(await w.service.from("ride_exceptions").insert({ route_id: route.id, ride_date: tomorrow, cancelled: true }));
    check(await settings({ daily_email_sent_for: null }));
    expect(await claim()).toEqual([]);
  });

  it("leaves out cancelled bookings and other dates", async () => {
    const route = await w.route(driver, { kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5, 6] });
    const booking = check(await w.book(passenger, route, tomorrow)) as unknown as string;
    check(await w.book(passenger, route, daysFromToday(2)));
    check(await passenger.db.rpc("cancel_booking", { p_booking_id: booking }));

    expect(await claim()).toEqual([]);
  });

  it("shows the details the driver entered for a passenger she added, with no email", async () => {
    const route = await w.route(driver, { date: tomorrow });
    check(await w.service.from("bookings").insert({
      route_id: route.id,
      ride_date: tomorrow,
      pickup_stop_id: route.pickup,
      dropoff_stop_id: route.dropoff,
      added_by_driver: true,
      guest_name: "אורחת",
      guest_phone: "050-111-2222",
    }));

    const [email] = await claim();
    expect(email.rides[0].passengers).toEqual([{ name: "אורחת", phone: "050-111-2222", email: null, pickup: "Pickup A" }]);
  });
});

describe("access", () => {
  it("only the system can claim", async () => {
    const { error } = await driver.db.rpc("claim_daily_passenger_emails");
    expect(error?.code).toBe(DENIED);
  });

  it("a driver edits her settings, but not the date already sent", async () => {
    check(await driver.db.from("profiles").update({ daily_email_enabled: false, daily_email_time: "07:30" }).eq("id", driver.id));
    const { data } = await driver.db.from("profiles").select("daily_email_enabled, daily_email_time").eq("id", driver.id).single();
    expect(data).toEqual({ daily_email_enabled: false, daily_email_time: "07:30:00" });

    const { error } = await driver.db.from("profiles").update({ daily_email_sent_for: tomorrow }).eq("id", driver.id);
    expect(error?.code).toBe(DENIED);
  });
});
