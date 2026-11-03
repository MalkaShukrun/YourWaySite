import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { check, createWorld, daysFromToday, DENIED, type User, type World } from "./support/world";

// The driver's daily email (spec D7): claim_daily_passenger_emails, and
// claim_passenger_update_emails for passengers who book after it.

type Claimed = {
  driver_id: string;
  driver_email: string;
  ride_date: string;
  since?: string;
  rides: {
    out_time: string;
    passengers: { name: string; phone: string | null; email: string | null; pickup: string; is_new?: boolean }[];
  }[];
};

let w: World;
let driver: User;
let passenger: User;
let late: User;
const tomorrow = daysFromToday(1);

const mine = (rows: unknown) => (rows as Claimed[]).filter((c) => c.driver_id === driver.id);
const claim = async () => mine(check(await w.service.rpc("claim_daily_passenger_emails")));
const claimUpdates = async () => mine(check(await w.service.rpc("claim_passenger_update_emails")));
const settings = (values: Record<string, unknown>) => w.service.from("profiles").update(values).eq("id", driver.id);

beforeAll(async () => {
  w = createWorld();
  [driver, passenger, late] = await Promise.all([
    w.user("Driver"),
    w.user("Passenger", { fullName: "רחל נוסעת" }),
    w.user("Late", { fullName: "לאה מאחרת" }),
  ]);
});
beforeEach(async () => {
  check(await w.service.from("routes").update({ is_active: false }).eq("driver_id", driver.id));
  check(await settings({
    daily_email_enabled: true,
    daily_email_updates_enabled: true,
    daily_email_time: "00:00",
    daily_email_sent_for: null,
    daily_email_retry_for: null,
    daily_email_sent_at: null,
  }));
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

  it("retries a failed send for its own date, whatever her time", async () => {
    const route = await w.route(driver, { date: tomorrow });
    check(await w.book(passenger, route, tomorrow));
    expect(await claim()).toHaveLength(1);

    // What the function does when the send fails.
    check(await settings({ daily_email_retry_for: tomorrow, daily_email_time: "23:59:59" }));
    const [retry, ...others] = await claim();
    expect(others).toEqual([]);
    expect(retry.ride_date).toBe(tomorrow);
    expect(await claim()).toEqual([]);
  });

  it("after midnight, retries the ride day itself with only the rides that haven't left", async () => {
    const today = daysFromToday(0);
    const later = await w.route(driver, { date: today, time: "23:59:59" });
    const left = await w.route(driver, { date: today, time: "00:00" });
    await w.bookDirectly(passenger, later, today);
    await w.bookDirectly(passenger, left, today);

    // Last night's send for today failed, and it's now after midnight.
    check(await settings({ daily_email_sent_for: today, daily_email_retry_for: today, daily_email_time: "23:59:59" }));
    const [retry] = await claim();
    expect(retry.ride_date).toBe(today);
    expect(retry.rides.map((r) => r.out_time)).toEqual(["23:59"]);
  });

  it("drops a retry once its date is over", async () => {
    const yesterday = daysFromToday(-1);
    const route = await w.route(driver, { date: yesterday });
    await w.bookDirectly(passenger, route, yesterday);

    check(await settings({ daily_email_sent_for: yesterday, daily_email_retry_for: yesterday, daily_email_time: "23:59:59" }));
    expect(await claim()).toEqual([]);
  });

  it("skips a driver who didn't turn it on, or whose time hasn't come", async () => {
    const route = await w.route(driver, { date: tomorrow });
    check(await w.book(passenger, route, tomorrow));

    check(await settings({ daily_email_enabled: false }));
    expect(await claim()).toEqual([]);

    check(await settings({ daily_email_enabled: true, daily_email_time: "23:59:59" }));
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

describe("claim_passenger_update_emails", () => {
  it("after the daily email, sends the full list again with the passenger who just booked marked", async () => {
    const route = await w.route(driver, { date: tomorrow });
    check(await w.book(passenger, route, tomorrow));
    expect(await claim()).toHaveLength(1);
    expect(await claimUpdates()).toEqual([]);

    check(await w.book(late, route, tomorrow));
    const [update, ...others] = await claimUpdates();
    expect(others).toEqual([]);
    expect(update.ride_date).toBe(tomorrow);
    expect(update.since).toBeTruthy();
    expect(update.rides[0].passengers.map((p) => [p.name, p.is_new])).toEqual([
      ["רחל נוסעת", false],
      ["לאה מאחרת", true],
    ]);
    expect(await claimUpdates()).toEqual([]);
  });

  it("finds the same passenger again once a failed update is released", async () => {
    const route = await w.route(driver, { date: tomorrow });
    check(await w.book(passenger, route, tomorrow));
    await claim();
    check(await w.book(late, route, tomorrow));

    const [update] = await claimUpdates();
    // What the function does when the send fails.
    check(await settings({ daily_email_sent_at: update.since }));
    expect(await claimUpdates()).toHaveLength(1);
  });

  it("sends nothing before the daily email, when it's off, or for a passenger the driver added", async () => {
    const route = await w.route(driver, { date: tomorrow });
    check(await w.book(passenger, route, tomorrow));
    expect(await claimUpdates()).toEqual([]);

    await claim();
    check(await w.addGuest(driver, route, tomorrow));
    expect(await claimUpdates()).toEqual([]);

    check(await settings({ daily_email_updates_enabled: false }));
    check(await w.book(late, route, tomorrow));
    expect(await claimUpdates()).toEqual([]);
  });

  it("leaves a driver whose daily email waits for a retry to that retry", async () => {
    const route = await w.route(driver, { date: tomorrow });
    check(await w.book(passenger, route, tomorrow));
    await claim();
    check(await settings({ daily_email_retry_for: tomorrow }));
    check(await w.book(late, route, tomorrow));

    expect(await claimUpdates()).toEqual([]);
  });
});

describe("access", () => {
  it("only the system can claim, or read the list", async () => {
    for (const fn of ["claim_daily_passenger_emails", "claim_passenger_update_emails"]) {
      const { error } = await driver.db.rpc(fn);
      expect(error?.code).toBe(DENIED);
    }
    const { error } = await driver.db.rpc("daily_email_rides", { p_driver: driver.id, p_date: tomorrow });
    expect(error?.code).toBe(DENIED);
  });

  it("a driver edits her settings, but not what was already sent", async () => {
    const values = { daily_email_enabled: false, daily_email_updates_enabled: false, daily_email_time: "07:30" };
    check(await driver.db.from("profiles").update(values).eq("id", driver.id));
    const { data } = await driver.db
      .from("profiles")
      .select("daily_email_enabled, daily_email_updates_enabled, daily_email_time")
      .eq("id", driver.id)
      .single();
    expect(data).toEqual({ ...values, daily_email_time: "07:30:00" });

    for (const column of ["daily_email_sent_for", "daily_email_retry_for", "daily_email_sent_at"]) {
      const { error } = await driver.db.from("profiles").update({ [column]: tomorrow }).eq("id", driver.id);
      expect(error?.code).toBe(DENIED);
    }
  });
});
