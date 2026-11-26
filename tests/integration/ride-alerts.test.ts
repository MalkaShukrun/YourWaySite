import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { check, createWorld, daysFromToday, DENIED, type User, type World } from "./support/world";

// Ride alerts (spec C10, C11, A7): saving one, the limit and duplicates, which
// new routes match it, and what claim_alert_emails hands the Edge Function.

type Alert = Record<string, unknown> & { id: string };
type Claimed = {
  alert_ids: string[];
  route_id: string;
  to_name: string;
  to_email: string;
  ride: { origin: string; destination: string; out_time: string; price: number; driver_name: string; dates: string[] };
  alerts: Alert[];
};

let w: World;
let driver: User;
let passenger: User;
let other: User;
let third: User;
let groupId: string;
let place: { origin: string; originCity: string; destination: string; destinationCity: string };

const inDays = (n: number) => daysFromToday(n);

const createAlert = (user: User, fields: Record<string, unknown> = {}) =>
  user.db.rpc("create_ride_alert", {
    p_origins: [place.origin],
    p_destinations: [place.destination],
    ...fields,
  });

const claim = async () => {
  const ours = [driver.email, passenger.email, other.email];
  return (check(await w.service.rpc("claim_alert_emails")) as Claimed[]).filter((c) => ours.includes(c.to_email));
};

const claimSeat = async () => {
  const ours = [driver.email, passenger.email, other.email, third.email];
  return (check(await w.service.rpc("claim_seat_alert_emails")) as (Claimed & { reason: string; ride_date: string })[])
    .filter((c) => ours.includes(c.to_email));
};

const alertsOf = async (user: User) => check(await user.db.from("ride_alerts").select("*").order("created_at")) as Alert[];

beforeAll(async () => {
  w = createWorld();
  [driver, passenger, other, third] = await Promise.all([
    w.user("AlertDriver", { fullName: "דנה נוהגת" }),
    w.user("AlertPassenger", { fullName: "רחל נוסעת" }),
    w.user("AlertOther", { fullName: "לאה נוסעת" }),
    w.user("AlertThird", { fullName: "שרה נוסעת" }),
  ]);
  groupId = await w.group();
  const g = check(
    await w.service
      .from("ride_groups")
      .select("origin_place_id, origin_city, destination_place_id, destination_city")
      .eq("id", groupId)
      .single(),
  );
  place = {
    origin: g.origin_place_id,
    originCity: g.origin_city,
    destination: g.destination_place_id,
    destinationCity: g.destination_city,
  };
});
beforeEach(async () => {
  for (const user of [driver, passenger, other, third]) {
    check(await w.service.from("ride_alerts").delete().eq("passenger_id", user.id));
    check(await w.service.from("profiles").update({ ride_emails_enabled: true }).eq("id", user.id));
  }
  // Other tests' waiting matches, so the 50-passenger limit can't leave ours out.
  check(await w.service.from("alert_matches").update({ sent_at: new Date().toISOString() }).is("sent_at", null));
  check(await w.service.from("alert_seat_matches").update({ sent_at: new Date().toISOString() }).is("sent_at", null));
});
afterAll(() => w?.cleanup());

describe("saving an alert", () => {
  it("keeps it for her alone", async () => {
    check(await createAlert(passenger, { p_from_time: "07:00", p_until_time: "09:00" }));
    const [alert, ...more] = await alertsOf(passenger);
    expect(more).toEqual([]);
    expect(alert).toMatchObject({ origins: [place.origin], destinations: [place.destination], from_time: "07:00:00", until_time: "09:00:00" });
    expect(await alertsOf(other)).toEqual([]);
  });

  it("can't be written directly", async () => {
    const { error } = await passenger.db.from("ride_alerts").insert({
      passenger_id: passenger.id, origins: [place.origin], destinations: [place.destination], expires_at: new Date().toISOString(),
    });
    expect(error?.code).toBe(DENIED);
  });

  it("expires 7 days after saving without dates", async () => {
    check(await createAlert(passenger));
    const [alert] = await alertsOf(passenger);
    const days = (Date.parse(alert.expires_at as string) - Date.parse(alert.created_at as string)) / 86_400_000;
    expect(days).toBeCloseTo(7, 5);
  });

  it("expires at the end of the end date, or of the 7th day after a start date", async () => {
    const endOfDay = async (date: string) =>
      check(await w.service.rpc("departure_at", { p_date: date, p_time: "00:00" })) as string;
    check(await createAlert(passenger, { p_start_date: inDays(2), p_end_date: inDays(4) }));
    check(await createAlert(passenger, { p_start_date: inDays(2) }));
    check(await createAlert(passenger, { p_end_date: inDays(3) }));
    const [both, startOnly, endOnly] = await alertsOf(passenger);
    expect(Date.parse(both.expires_at as string)).toBe(Date.parse(await endOfDay(inDays(5))));
    expect(Date.parse(startOnly.expires_at as string)).toBe(Date.parse(await endOfDay(inDays(10))));
    expect(Date.parse(endOnly.expires_at as string)).toBe(Date.parse(await endOfDay(inDays(4))));
  });

  it("allows 3 at a time", async () => {
    for (const time of ["06:00", "07:00", "08:00"]) check(await createAlert(passenger, { p_from_time: time }));
    const { error } = await createAlert(passenger, { p_from_time: "09:00" });
    expect(error?.message).toContain("ALERT_LIMIT");

    // Cancelling one makes room.
    const [first] = await alertsOf(passenger);
    check(await passenger.db.from("ride_alerts").delete().eq("id", first.id));
    check(await createAlert(passenger, { p_from_time: "09:00" }));
  });

  it("doesn't count expired alerts toward the limit", async () => {
    for (const time of ["06:00", "07:00", "08:00"]) check(await createAlert(passenger, { p_from_time: time }));
    check(await w.service.from("ride_alerts").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("passenger_id", passenger.id));
    check(await createAlert(passenger, { p_from_time: "09:00" }));
    expect(await alertsOf(passenger)).toHaveLength(1);
  });

  it("refuses the same places and ranges twice, but not with other dates", async () => {
    check(await createAlert(passenger));
    expect((await createAlert(passenger)).error?.message).toContain("ALERT_DUPLICATE");
    check(await createAlert(passenger, { p_start_date: inDays(1), p_end_date: inDays(2) }));
    expect((await createAlert(passenger, { p_start_date: inDays(1), p_end_date: inDays(2) })).error?.message).toContain("ALERT_DUPLICATE");
  });

  it("refuses no places, a past date and a start after the end", async () => {
    const invalid = [
      { p_origins: [] },
      { p_destinations: ["not a pick"] },
      { p_start_date: inDays(-1) },
      { p_end_date: inDays(-1) },
      { p_start_date: inDays(3), p_end_date: inDays(2) },
    ];
    for (const fields of invalid) {
      expect((await createAlert(passenger, fields)).error?.message).toContain("INVALID_ALERT");
    }
    expect(await alertsOf(passenger)).toEqual([]);
  });
});

describe("a new route", () => {
  it("emails her the ride and the alert it matched", async () => {
    check(await createAlert(passenger));
    const route = await w.route(driver, { groupId, date: inDays(3), time: "07:15", price: 15 });

    const [email, ...others] = await claim();
    expect(others).toEqual([]);
    expect(email).toMatchObject({ route_id: route.id, to_name: "רחל נוסעת", to_email: passenger.email });
    expect(email.ride).toMatchObject({ out_time: "07:15", price: 15, driver_name: "דנה נוהגת", dates: [inDays(3)] });
    expect(email.alerts).toHaveLength(1);
    expect(email.alerts[0].id).toBe(email.alert_ids[0]);
  });

  it("matches a whole-city pick", async () => {
    check(await createAlert(passenger, { p_origins: [`city:${place.originCity}`], p_destinations: [`city:${place.destinationCity}`] }));
    await w.route(driver, { groupId, date: inDays(3) });
    expect(await claim()).toHaveLength(1);
  });

  it("lists every alert it matched in one email", async () => {
    check(await createAlert(passenger));
    check(await createAlert(passenger, { p_from_time: "07:00", p_until_time: "09:00" }));
    await w.route(driver, { groupId, date: inDays(3), time: "08:00" });

    const [email, ...others] = await claim();
    expect(others).toEqual([]);
    expect(email.alerts).toHaveLength(2);
  });

  it("lists a recurring route's dates in the alert's range only", async () => {
    check(await createAlert(passenger, { p_start_date: inDays(2), p_end_date: inDays(4) }));
    await w.route(driver, { groupId, kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5, 6], date: null });

    const [email] = await claim();
    expect(email.ride.dates).toEqual([inDays(2), inDays(3), inDays(4)]);
  });

  it("matches a time range that crosses midnight", async () => {
    check(await createAlert(passenger, { p_from_time: "23:00", p_until_time: "01:00" }));
    await w.route(driver, { groupId, date: inDays(3), time: "00:30" });
    await w.route(driver, { groupId, date: inDays(3), time: "12:00" });
    expect(await claim()).toHaveLength(1);
  });

  it("includes both ends of the time range", async () => {
    check(await createAlert(passenger, { p_from_time: "07:00", p_until_time: "08:00" }));
    await w.route(driver, { groupId, date: inDays(3), time: "07:00" });
    await w.route(driver, { groupId, date: inDays(3), time: "08:00" });
    await w.route(driver, { groupId, date: inDays(3), time: "08:01" });
    expect(await claim()).toHaveLength(2);
  });

  it("doesn't match another group, a date out of range, or the driver's own alert", async () => {
    check(await createAlert(passenger, { p_start_date: inDays(1), p_end_date: inDays(2) }));
    check(await createAlert(driver));
    await w.route(driver, { groupId, date: inDays(3) });
    await w.route(driver, { date: inDays(1) }); // a group of its own
    expect(await claim()).toEqual([]);
  });

  it("doesn't match a ride leaving after the alert expires", async () => {
    check(await createAlert(passenger));
    await w.route(driver, { groupId, date: inDays(9) });
    expect(await claim()).toEqual([]);
  });

  it("doesn't match an alert saved after it", async () => {
    await w.route(driver, { groupId, date: inDays(3) });
    check(await createAlert(passenger));
    expect(await claim()).toEqual([]);
  });

  it("doesn't trigger alerts when a route is edited", async () => {
    const route = await w.route(driver, { groupId: (await w.group()), date: inDays(3) });
    check(await createAlert(passenger));
    check(await w.service.from("routes").update({ group_id: groupId }).eq("id", route.id));
    expect(await claim()).toEqual([]);
  });
});

describe("a seat that opens (0052)", () => {
  // A one-seat ride on inDays(3), published before the alert and filled by `other`.
  const fullRide = async (fields: Record<string, unknown> = {}) => {
    const route = await w.route(driver, { groupId, date: inDays(3), seats: 1, time: "07:15", price: 15 });
    const booking = check(await w.book(other, route, inDays(3))) as string;
    check(await createAlert(passenger, fields));
    return { route, booking };
  };
  const cancel = async (user: User, id: string) => check(await user.db.rpc("cancel_booking", { p_booking_id: id }));

  it("emails her the date when a booking on the full ride is cancelled", async () => {
    const { route, booking } = await fullRide();
    await cancel(other, booking);

    const [email, ...others] = await claimSeat();
    expect(others).toEqual([]);
    expect(email).toMatchObject({ reason: "seat", route_id: route.id, ride_date: inDays(3), to_email: passenger.email });
    expect(email.ride).toMatchObject({ out_time: "07:15", price: 15, driver_name: "דנה נוהגת", dates: [inDays(3)] });
    expect(email.alerts).toHaveLength(1);
    expect(await claim()).toEqual([]); // not a new route
  });

  it("emails her when the driver removes a passenger she added", async () => {
    const route = await w.route(driver, { groupId, date: inDays(3), seats: 1 });
    const { data: guest } = await w.addGuest(driver, route, inDays(3));
    check(await createAlert(passenger));
    check(await driver.db.rpc("remove_passenger", { p_booking_id: guest }));
    expect(await claimSeat()).toHaveLength(1);
  });

  it("doesn't fire when the ride wasn't full", async () => {
    const route = await w.route(driver, { groupId, date: inDays(3), seats: 2 });
    const booking = check(await w.book(other, route, inDays(3))) as string;
    check(await createAlert(passenger));
    await cancel(other, booking);
    expect(await claimSeat()).toEqual([]);
  });

  it("doesn't fire for an alert of other places, dates or times", async () => {
    const { booking } = await fullRide({ p_start_date: inDays(4) });
    check(await createAlert(passenger, { p_from_time: "09:00", p_until_time: "10:00" }));
    await cancel(other, booking);
    expect(await claimSeat()).toEqual([]);
  });

  it("doesn't tell the passenger who cancelled", async () => {
    const route = await w.route(driver, { groupId, date: inDays(3), seats: 1 });
    const booking = check(await w.book(passenger, route, inDays(3))) as string;
    check(await createAlert(passenger));
    await cancel(passenger, booking);
    expect(await claimSeat()).toEqual([]);
  });

  it("tells her once per date, however often a seat opens", async () => {
    const { route, booking } = await fullRide();
    await cancel(other, booking);
    expect(await claimSeat()).toHaveLength(1);
    const again = check(await w.book(third, route, inDays(3))) as string;
    await cancel(third, again);
    expect(await claimSeat()).toEqual([]);
  });

  it("isn't sent when the seat was taken again before the run", async () => {
    const { route, booking } = await fullRide();
    await cancel(other, booking);
    check(await w.book(third, route, inDays(3)));
    expect(await claimSeat()).toEqual([]);
  });

  it("isn't sent when her ride emails are off", async () => {
    check(await w.service.from("profiles").update({ ride_emails_enabled: false }).eq("id", passenger.id));
    const { booking } = await fullRide();
    await cancel(other, booking);
    expect(await claimSeat()).toEqual([]);
  });

  it("isn't open to users", async () => {
    expect((await passenger.db.rpc("claim_seat_alert_emails")).error?.code).toBe(DENIED);
    expect((await passenger.db.from("alert_seat_matches").select("*")).error?.code).toBe(DENIED);
  });
});

describe("claiming", () => {
  it("claims an email once, and again after a failed send is released", async () => {
    check(await createAlert(passenger));
    const route = await w.route(driver, { groupId, date: inDays(3) });

    const [email] = await claim();
    expect(await claim()).toEqual([]);
    check(await w.service.from("alert_matches").update({ sent_at: null }).in("alert_id", email.alert_ids).eq("route_id", route.id));
    expect(await claim()).toHaveLength(1);
  });

  it("sends nothing when her ride emails are off", async () => {
    check(await w.service.from("profiles").update({ ride_emails_enabled: false }).eq("id", passenger.id));
    check(await createAlert(passenger));
    await w.route(driver, { groupId, date: inDays(3) });
    expect(await claim()).toEqual([]);

    // Claimed all the same: turning them back on doesn't send it later.
    check(await w.service.from("profiles").update({ ride_emails_enabled: true }).eq("id", passenger.id));
    expect(await claim()).toEqual([]);
  });

  it("leaves out a route removed before the run", async () => {
    check(await createAlert(passenger));
    const route = await w.route(driver, { groupId, date: inDays(3) });
    check(await w.service.from("routes").update({ is_active: false }).eq("id", route.id));
    expect(await claim()).toEqual([]);
  });

  it("still sends when the ride filled since", async () => {
    check(await createAlert(passenger));
    const route = await w.route(driver, { groupId, date: inDays(3), seats: 1 });
    check(await w.book(other, route, inDays(3)));
    expect(await claim()).toHaveLength(1);
  });

  it("deletes expired alerts", async () => {
    check(await createAlert(passenger));
    check(await w.service.from("ride_alerts").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("passenger_id", passenger.id));
    await claim();
    expect(check(await w.service.from("ride_alerts").select("id").eq("passenger_id", passenger.id))).toEqual([]);
  });

  it("isn't open to users", async () => {
    expect((await passenger.db.rpc("claim_alert_emails")).error?.code).toBe(DENIED);
    expect((await passenger.db.from("alert_matches").select("*")).error?.code).toBe(DENIED);
  });
});
