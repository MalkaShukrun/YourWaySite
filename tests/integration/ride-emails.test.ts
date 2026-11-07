import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { check, createWorld, daysFromToday, DENIED, type User, type World } from "./support/world";

// Emails about a member's own rides (spec A7): what the database queues when a
// booking changes, and what claim_ride_emails hands the Edge Function.

type Claimed = { ids: number[]; kind: string; to_name: string; to_email: string; rides: Record<string, unknown>[] };

let w: World;
let driver: User;
let passenger: User;
let other: User;
const tomorrow = daysFromToday(1);
const later = daysFromToday(2);

const claim = async () => {
  const ours = [driver.email, passenger.email, other.email];
  return (check(await w.service.rpc("claim_ride_emails")) as Claimed[])
    .filter((c) => ours.includes(c.to_email))
    .sort((a, b) => a.to_email.localeCompare(b.to_email) || a.kind.localeCompare(b.kind));
};
const settings = (user: User, values: Record<string, unknown>) => w.service.from("profiles").update(values).eq("id", user.id);
const cancelDate = (route: { id: string }, date: string) =>
  driver.db.from("ride_exceptions").upsert({ route_id: route.id, ride_date: date, cancelled: true }, { onConflict: "route_id,ride_date" });

beforeAll(async () => {
  w = createWorld();
  [driver, passenger, other] = await Promise.all([
    w.user("Driver", { fullName: "דנה נוהגת" }),
    w.user("Passenger", { fullName: "רחל נוסעת" }),
    w.user("Other", { fullName: "לאה נוסעת" }),
  ]);
});
beforeEach(async () => {
  check(await w.service.from("routes").update({ is_active: false }).eq("driver_id", driver.id));
  for (const user of [driver, passenger, other]) {
    check(await settings(user, { ride_emails_enabled: true }));
  }
  // What other tests, and removing the routes above, left waiting, so the
  // 50-member limit can't leave ours out.
  check(await w.service.from("email_outbox").update({ sent_at: new Date().toISOString() }).is("sent_at", null));
});
afterAll(() => w?.cleanup());

describe("a passenger books", () => {
  it("sends her the ride with her stops, the price and the driver's phone", async () => {
    const route = await w.route(driver, { date: tomorrow, time: "07:15", price: 15 });
    check(await w.book(passenger, route, tomorrow));

    const [email, ...others] = await claim();
    expect(others).toEqual([]);
    expect(email).toMatchObject({ kind: "booked", to_name: "רחל נוסעת", to_email: passenger.email });
    expect(email.rides).toEqual([
      expect.objectContaining({
        ride_date: tomorrow,
        out_time: "07:15",
        pickup: "Pickup A",
        dropoff: "Dropoff B",
        price: 15,
        driver_name: "דנה נוהגת",
        driver_phone: driver.phone,
      }),
    ]);
    expect(email.rides[0]).not.toHaveProperty("passenger_name");
  });

  it("puts several dates in one email, in date order", async () => {
    const route = await w.route(driver, { kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5, 6] });
    check(await w.book(passenger, route, later));
    check(await w.book(passenger, route, tomorrow));

    const [email, ...others] = await claim();
    expect(others).toEqual([]);
    expect(email.ids).toHaveLength(2);
    expect(email.rides.map((r) => r.ride_date)).toEqual([tomorrow, later]);
  });

  it("claims an email once, and again after a failed send is released", async () => {
    const route = await w.route(driver, { date: tomorrow });
    check(await w.book(passenger, route, tomorrow));

    const [email] = await claim();
    expect(await claim()).toEqual([]);

    // What the function does when the send fails.
    check(await w.service.from("email_outbox").update({ sent_at: null }).in("id", email.ids));
    expect(await claim()).toEqual([expect.objectContaining({ kind: "booked", ids: email.ids })]);
  });

  it("sends nothing for a booking cancelled before the email went out, only the cancellation", async () => {
    const route = await w.route(driver, { date: tomorrow });
    const booking = check(await w.book(passenger, route, tomorrow));
    check(await passenger.db.rpc("cancel_booking", { p_booking_id: booking }));

    expect((await claim()).map((c) => [c.to_email, c.kind])).toEqual(
      [[driver.email, "passenger_cancelled"], [passenger.email, "cancelled"]].sort((a, b) => a[0].localeCompare(b[0])),
    );
  });

  it("sends nothing for a ride that already left", async () => {
    const route = await w.route(driver, { date: daysFromToday(-1) });
    await w.bookDirectly(passenger, route, daysFromToday(-1));
    expect(await claim()).toEqual([]);
  });
});

describe("a passenger cancels", () => {
  it("tells her, without the driver's phone, and tells the driver who cancelled", async () => {
    const route = await w.route(driver, { date: tomorrow });
    const booking = check(await w.book(passenger, route, tomorrow));
    await claim();
    check(await passenger.db.rpc("cancel_booking", { p_booking_id: booking }));

    const emails = await claim();
    const toDriver = emails.find((c) => c.to_email === driver.email)!;
    const toPassenger = emails.find((c) => c.to_email === passenger.email)!;
    expect(emails).toHaveLength(2);

    expect(toPassenger.kind).toBe("cancelled");
    expect(toPassenger.rides[0]).toMatchObject({ ride_date: tomorrow, pickup: "Pickup A", driver_name: "דנה נוהגת" });
    expect(toPassenger.rides[0]).not.toHaveProperty("driver_phone");
    expect(toPassenger.rides[0]).not.toHaveProperty("price");

    expect(toDriver.kind).toBe("passenger_cancelled");
    expect(toDriver.rides[0]).toMatchObject({ ride_date: tomorrow, passenger_name: "רחל נוסעת", pickup: "Pickup A" });
    expect(toDriver.rides[0]).not.toHaveProperty("driver_phone");
  });
});

describe("the driver cancels", () => {
  it("tells each booked passenger once, with the driver's phone; a guest gets nothing", async () => {
    const route = await w.route(driver, { date: tomorrow });
    check(await w.book(passenger, route, tomorrow));
    check(await w.book(other, route, tomorrow));
    check(await w.addGuest(driver, route, tomorrow));
    await claim();

    check(await cancelDate(route, tomorrow));
    const emails = await claim();
    expect(emails.map((c) => [c.to_email, c.kind]).sort()).toEqual(
      [[other.email, "ride_cancelled"], [passenger.email, "ride_cancelled"]].sort(),
    );
    expect(emails[0].rides[0]).toMatchObject({ ride_date: tomorrow, driver_phone: driver.phone });

    check(await cancelDate(route, tomorrow));
    expect(await claim()).toEqual([]);
  });

  it("removing a route tells the passengers of its upcoming dates", async () => {
    const route = await w.route(driver, { kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5, 6] });
    check(await w.book(passenger, route, tomorrow));
    check(await w.book(passenger, route, later));
    await claim();

    check(await driver.db.from("routes").update({ is_active: false }).eq("id", route.id));
    const [email, ...others] = await claim();
    expect(others).toEqual([]);
    expect(email.kind).toBe("ride_cancelled");
    expect(email.rides.map((r) => r.ride_date)).toEqual([tomorrow, later]);
  });

  it("adding or removing a guest sends nothing", async () => {
    const route = await w.route(driver, { date: tomorrow });
    check(await w.addGuest(driver, route, tomorrow));
    const { id } = check(await w.service.from("bookings").select("id").eq("route_id", route.id).single());
    check(await driver.db.rpc("remove_passenger", { p_booking_id: id }));
    expect(await claim()).toEqual([]);
  });
});

describe("turning the emails off", () => {
  it("stops them, including those already waiting", async () => {
    const route = await w.route(driver, { date: tomorrow });
    check(await w.book(passenger, route, tomorrow));
    check(await settings(passenger, { ride_emails_enabled: false }));
    expect(await claim()).toEqual([]);

    // And they don't come back when she turns them on again.
    check(await settings(passenger, { ride_emails_enabled: true }));
    expect(await claim()).toEqual([]);
  });
});

describe("access", () => {
  it("only the system claims or reads the queue", async () => {
    const { error: claimError } = await passenger.db.rpc("claim_ride_emails");
    expect(claimError?.code).toBe(DENIED);
    const { error } = await passenger.db.from("email_outbox").select("id");
    expect(error?.code).toBe(DENIED);
  });

  it("a member turns her emails off and on", async () => {
    const enabled = async () =>
      (await passenger.db.from("profiles").select("ride_emails_enabled").eq("id", passenger.id).single()).data;
    check(await passenger.db.from("profiles").update({ ride_emails_enabled: false }).eq("id", passenger.id));
    expect(await enabled()).toEqual({ ride_emails_enabled: false });
    check(await passenger.db.from("profiles").update({ ride_emails_enabled: true }).eq("id", passenger.id));
    expect(await enabled()).toEqual({ ride_emails_enabled: true });
  });
});
