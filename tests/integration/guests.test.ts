import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createWorld, daysFromToday, DENIED, uniquePhone, type Route, type User, type World } from "./support/world";

// Passengers the driver adds by hand (spec D4–D6, §2 Guest bookings): only her
// driver sees them, they take a seat, the same phone again replaces the booking
// once the driver confirms, and they're never linked to an account.

let w: World;
let driver: User;
let passenger: User;
let stranger: User;
let admin: User;
let route: Route;
const date = daysFromToday(4);

beforeAll(async () => {
  w = createWorld();
  [driver, passenger, stranger, admin] = await Promise.all([
    w.user("Driver"),
    w.user("Passenger"),
    w.user("Stranger"),
    w.user("Admin", { admin: true }),
  ]);
  route = await w.route(driver, { date, seats: 8 });
});
// Each test starts with no guests on the shared ride.
beforeEach(async () => {
  await w.service.from("bookings").update({ status: "cancelled" }).eq("route_id", route.id).eq("added_by_driver", true);
});
afterAll(() => w?.cleanup());

const guestRow = async (id: string) =>
  (await w.service.from("bookings").select("status, passenger_id, guest_name, guest_phone, added_by_driver").eq("id", id).single()).data!;

describe("adding (spec D4)", () => {
  it("adds a guest who takes a seat and is marked as added by the driver", async () => {
    const before = await w.seatsLeft(passenger, route, date);
    const { data: id, error } = await w.addGuest(driver, route, date, { name: " שרה כהן ", phone: "052-765-4321" });
    expect(error).toBeNull();
    expect(await guestRow(id)).toEqual({
      status: "active",
      passenger_id: null,
      guest_name: "שרה כהן",
      guest_phone: "052-765-4321",
      added_by_driver: true,
    });
    expect(await w.seatsLeft(passenger, route, date)).toBe(before - 1);
  });

  it("only the ride's driver can add", async () => {
    const { error } = await w.addGuest(stranger, route, date);
    expect(error?.message).toContain("ROUTE_NOT_FOUND");
  });

  it("refuses the driver's own phone", async () => {
    const { error } = await w.addGuest(driver, route, date, { phone: driver.phone!.replaceAll("-", "") });
    expect(error?.message).toContain("OWN_RIDE");
  });

  it("refuses the phone of a passenger who booked herself on this ride", async () => {
    await w.book(passenger, route, date);
    const { error } = await w.addGuest(driver, route, date, { phone: passenger.phone! });
    expect(error?.message).toContain("ALREADY_BOOKED");
  });

  it("refuses a full ride", async () => {
    const small = await w.route(driver, { date, seats: 1 });
    expect((await w.addGuest(driver, small, date)).error).toBeNull();
    expect((await w.addGuest(driver, small, date)).error?.message).toContain("RIDE_FULL");
  });

  it("refuses a cancelled date, and a date the route doesn't run on", async () => {
    const cancelled = await w.route(driver, { date });
    await w.service.from("ride_exceptions").insert({ route_id: cancelled.id, ride_date: date, cancelled: true });
    expect((await w.addGuest(driver, cancelled, date)).error?.message).toContain("RIDE_UNAVAILABLE");
    expect((await w.addGuest(driver, route, daysFromToday(5))).error?.message).toContain("RIDE_UNAVAILABLE");
  });

  it("refuses stops that aren't the route's", async () => {
    const other = await w.route(driver, { date });
    const { error } = await w.addGuest(driver, { ...route, pickup: other.pickup }, date);
    expect(error?.message).toContain("INVALID_STOP");
  });

  it.each([
    ["a one-letter name", { name: "א" }],
    ["a name over 60 characters", { name: "א".repeat(61) }],
    ["control characters in the name", { name: "שרה\nכהן" }],
    ["a bad phone", { phone: "12345" }],
  ])("refuses %s, even called directly", async (_case, options) => {
    expect((await w.addGuest(driver, route, date, options)).error?.message).toContain("INVALID_PASSENGER");
  });

  // Allowed after departure, to record who rode (spec D4).
  it("allows adding after the ride left", async () => {
    const past = daysFromToday(-1);
    const departed = await w.route(driver, { date: past });
    expect((await w.addGuest(driver, departed, past)).error).toBeNull();
  });

  // The driver can still add passengers in a hidden group (spec H2).
  it("allows adding in a hidden group", async () => {
    const groupId = await w.group({ active: false });
    const hidden = await w.route(driver, { groupId, date });
    expect((await w.addGuest(driver, hidden, date)).error).toBeNull();
  });

  it("can't be added by writing the table directly", async () => {
    const { error } = await driver.db.from("bookings").insert({
      route_id: route.id,
      ride_date: date,
      pickup_stop_id: route.pickup,
      dropoff_stop_id: route.dropoff,
      added_by_driver: true,
      guest_name: "Direct",
      guest_phone: uniquePhone(),
    });
    expect(error?.code).toBe(DENIED);
  });
});

describe("the same phone again (spec D5)", () => {
  it("is refused until the driver confirms, with the current guest's name", async () => {
    const phone = uniquePhone();
    const { data: oldId } = await w.addGuest(driver, route, date, { name: "Old Name", phone });
    const { error } = await w.addGuest(driver, route, date, { name: "New Name", phone });
    expect(error?.message).toContain("GUEST_EXISTS");
    expect(error?.details).toBe("Old Name");
    expect((await guestRow(oldId)).status).toBe("active");
  });

  it("once confirmed, replaces her booking without taking another seat, however the phone is written", async () => {
    const phone = uniquePhone();
    const { data: oldId } = await w.addGuest(driver, route, date, { name: "Old Name", phone });
    const seats = await w.seatsLeft(passenger, route, date);

    const { data: newId, error } = await w.addGuest(driver, route, date, { name: "New Name", phone: phone.replaceAll("-", ""), replace: true });
    expect(error).toBeNull();
    expect((await guestRow(oldId)).status).toBe("cancelled");
    expect(await guestRow(newId)).toMatchObject({ status: "active", guest_name: "New Name" });
    expect(await w.seatsLeft(passenger, route, date)).toBe(seats);
  });

  it("replacing works on a full ride, since no extra seat is used", async () => {
    const small = await w.route(driver, { date, seats: 1 });
    const phone = uniquePhone();
    await w.addGuest(driver, small, date, { phone });
    expect((await w.addGuest(driver, small, date, { name: "Fixed Name", phone, replace: true })).error).toBeNull();
    expect(await w.seatsLeft(passenger, small, date)).toBe(0);
  });

  it("the same phone on another date is a separate booking", async () => {
    const recurring = await w.route(driver, { kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5, 6], date: null });
    const phone = uniquePhone();
    const [d1, d2] = [daysFromToday(3), daysFromToday(4)];
    const { data: first } = await w.addGuest(driver, recurring, d1, { phone });
    expect((await w.addGuest(driver, recurring, d2, { phone })).error).toBeNull();
    expect((await guestRow(first)).status).toBe("active");
  });

  it("asking to replace when there's nothing to replace just adds her", async () => {
    expect((await w.addGuest(driver, route, date, { replace: true })).error).toBeNull();
  });
});

describe("who sees guests (spec D4, §5)", () => {
  it("only her driver — not passengers on the ride, other users or admins", async () => {
    const { data: id } = await w.addGuest(driver, route, date, { name: "Hidden Guest" });
    expect((await driver.db.from("bookings").select("guest_name").eq("id", id)).data).toEqual([{ guest_name: "Hidden Guest" }]);
    for (const user of [passenger, stranger, admin]) {
      expect((await user.db.from("bookings").select("id").eq("id", id)).data, user.name).toEqual([]);
    }
  });

  it("other passengers see only one seat fewer", async () => {
    const before = await w.seatsLeft(stranger, route, date);
    await w.addGuest(driver, route, date);
    expect(await w.seatsLeft(stranger, route, date)).toBe(before - 1);
  });
});

describe("never linked to an account (spec D4)", () => {
  it("not to a user who already has that phone", async () => {
    const { data: id } = await w.addGuest(driver, route, date, { phone: stranger.phone! });
    expect((await guestRow(id)).passenger_id).toBeNull();
    const { data } = await stranger.db.rpc("my_bookings");
    expect((data as { booking_id: string }[]).map((b) => b.booking_id)).not.toContain(id);
  });

  it("not to a user who saves that phone later", async () => {
    const phone = uniquePhone();
    const { data: id } = await w.addGuest(driver, route, date, { phone });
    const later = await w.user("Later", { phone: null });
    await later.db.from("profiles").update({ phone }).eq("id", later.id);
    expect((await guestRow(id)).passenger_id).toBeNull();
    expect(((await later.db.rpc("my_bookings")).data as unknown[]).length).toBe(0);
  });
});

describe("removing (spec D6)", () => {
  it("the driver removes a guest, which frees the seat", async () => {
    const before = await w.seatsLeft(passenger, route, date);
    const { data: id } = await w.addGuest(driver, route, date);
    expect((await driver.db.rpc("remove_passenger", { p_booking_id: id })).error).toBeNull();
    expect((await guestRow(id)).status).toBe("cancelled");
    expect(await w.seatsLeft(passenger, route, date)).toBe(before);
  });

  it("after a replacement, removing removes the current booking", async () => {
    const phone = uniquePhone();
    const before = await w.seatsLeft(passenger, route, date);
    await w.addGuest(driver, route, date, { phone });
    const { data: current } = await w.addGuest(driver, route, date, { phone, replace: true });
    expect((await driver.db.rpc("remove_passenger", { p_booking_id: current })).error).toBeNull();
    expect(await w.seatsLeft(passenger, route, date)).toBe(before);
  });

  it("the driver can't remove a passenger who booked herself", async () => {
    const own = await w.route(driver, { date });
    const { data: id } = await w.book(passenger, own, date);
    expect((await driver.db.rpc("remove_passenger", { p_booking_id: id })).error?.message).toContain("BOOKING_NOT_FOUND");
    expect((await w.service.from("bookings").select("status").eq("id", id).single()).data!.status).toBe("active");
  });

  it("another user can't remove the driver's guest", async () => {
    const { data: id } = await w.addGuest(driver, route, date);
    expect((await stranger.db.rpc("remove_passenger", { p_booking_id: id })).error?.message).toContain("BOOKING_NOT_FOUND");
  });
});
