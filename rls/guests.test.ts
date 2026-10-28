import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createWorld, type User, type World } from "./world";

// Passengers the driver adds by hand (0012, 0013): only the driver of the
// ride can add, see or remove them — not other users, passengers on the same
// ride, admins or signed-out visitors, through the tables or the functions.
// They take a seat, adding the same phone to the ride again replaces the
// booking (0014), and the booking is never linked to a user account — not one
// with that phone now, nor one that saves it later.

let w: World;
let stop: (kind: string) => string;
const extraUsers: string[] = [];

beforeAll(async () => {
  w = await createWorld();
  await w.service.from("routes").update({ seats: 8 }).eq("id", w.routeId);
  const { data } = await w.service.from("stops").select("id, kind").eq("route_id", w.routeId);
  stop = (kind) => data!.find((s) => s.kind === kind)!.id;
});
// The ride has at most 8 seats: each test starts with only the world's own
// passenger booked.
beforeEach(async () => {
  await w.service.from("bookings").update({ status: "cancelled" })
    .eq("route_id", w.routeId).eq("added_by_driver", true).eq("status", "active");
});
afterAll(async () => {
  await Promise.all(extraUsers.map((id) => w.service.auth.admin.deleteUser(id)));
  await w?.cleanup();
});

const add = (u: User, phone: string, { name = "Guest", pickup = stop("pickup"), dropoff = stop("dropoff") } = {}) =>
  u.db.rpc("add_passenger", {
    p_route_id: w.routeId,
    p_date: w.rideDate,
    p_name: name,
    p_phone: phone,
    p_pickup_stop_id: pickup,
    p_dropoff_stop_id: dropoff,
  });

// A phone no other test user has, written with dashes.
const guestPhone = () => {
  const digits = String(randomInt(10_000_000)).padStart(7, "0");
  return `059-${digits.slice(0, 3)}-${digits.slice(3)}`;
};

async function signUp() {
  const email = `rls-guest-${randomUUID().slice(0, 8)}@example.test`;
  const { data, error } = await w.service.auth.admin.createUser({ email, password: "rls-test-password", email_confirm: true });
  if (error) throw error;
  extraUsers.push(data.user.id);
  return data.user.id;
}

const bookingOwner = async (id: string) =>
  (await w.service.from("bookings").select("passenger_id, status").eq("id", id).single()).data!;

const seatsLeft = async () =>
  ((await w.stranger.db.rpc("get_ride", { p_route_id: w.routeId, p_date: w.rideDate })).data as { seats_left: number }[])[0]
    .seats_left;

describe("adding passengers", () => {
  it("only the ride's driver can add a passenger", async () => {
    const { error } = await add(w.stranger, guestPhone());
    expect(error?.message).toContain("ROUTE_NOT_FOUND");
  });

  it("the driver can't add herself", async () => {
    const phone = guestPhone();
    await w.service.from("profiles").update({ phone }).eq("id", w.driver.id);
    const { error } = await add(w.driver, phone);
    expect(error?.message).toContain("OWN_RIDE");
  });

  it("adding the same phone again replaces her booking, however the phone is written", async () => {
    const phone = guestPhone();
    const { data: oldId } = await add(w.driver, phone, { name: "Old Name" });
    const { data: newId, error } = await add(w.driver, phone.replaceAll("-", ""), { name: "New Name" });
    expect(error).toBeNull();
    expect(newId).not.toBe(oldId);
    expect((await bookingOwner(oldId)).status).toBe("cancelled");

    const { data: active } = await w.service.from("bookings").select("id, guest_name")
      .eq("route_id", w.routeId).eq("ride_date", w.rideDate).eq("status", "active").eq("added_by_driver", true);
    expect(active).toEqual([{ id: newId, guest_name: "New Name" }]);
  });

  it("a replacement keeps her seat on a full ride, but a new phone doesn't get one", async () => {
    await w.service.from("routes").update({ seats: 2 }).eq("id", w.routeId); // the world's passenger + one guest
    try {
      const phone = guestPhone();
      expect((await add(w.driver, phone)).error).toBeNull();
      expect((await add(w.driver, guestPhone())).error?.message).toContain("RIDE_FULL");
      expect((await add(w.driver, phone, { name: "Fixed Name" })).error).toBeNull();
      expect(await seatsLeft()).toBe(0);
    } finally {
      await w.service.from("routes").update({ seats: 8 }).eq("id", w.routeId);
    }
  });

  it("the same phone on another date is a separate booking", async () => {
    const phone = guestPhone();
    const { data: first } = await add(w.driver, phone);
    await w.service.from("routes").update({ kind: "recurring", weekdays: [0, 1, 2, 3, 4, 5, 6] }).eq("id", w.routeId);
    try {
      const nextDay = new Date(Date.parse(w.rideDate) + 86_400_000).toISOString().slice(0, 10);
      const { error } = await w.driver.db.rpc("add_passenger", {
        p_route_id: w.routeId, p_date: nextDay, p_name: "Guest", p_phone: phone,
        p_pickup_stop_id: stop("pickup"), p_dropoff_stop_id: stop("dropoff"),
      });
      expect(error).toBeNull();
      expect((await bookingOwner(first)).status).toBe("active");
    } finally {
      await w.service.from("bookings").update({ status: "cancelled" }).eq("route_id", w.routeId).neq("ride_date", w.rideDate);
      await w.service.from("routes").update({ kind: "one_time", weekdays: [] }).eq("id", w.routeId);
    }
  });

  it("removing her after a replacement removes the current booking", async () => {
    const phone = guestPhone();
    await add(w.driver, phone);
    const { data: current } = await add(w.driver, phone);
    expect((await w.driver.db.rpc("remove_passenger", { p_booking_id: current })).error).toBeNull();
    expect(await seatsLeft()).toBe(7);
  });

  it("a passenger who booked herself can't be added again by her phone", async () => {
    const phone = guestPhone();
    await w.service.from("profiles").update({ phone }).eq("id", w.passenger.id);
    expect((await add(w.driver, phone)).error?.message).toContain("ALREADY_BOOKED");
  });

  it.each([
    ["a name that is too short", { name: "x" }],
    ["a name that is too long", { name: "x".repeat(61) }],
    ["a name with control characters", { name: "Ra\nchel" }],
  ])("rejects %s, even called directly", async (_case, options) => {
    expect((await add(w.driver, guestPhone(), options)).error?.message).toContain("INVALID_PASSENGER");
  });

  it.each(["123", "abc-def-ghij", "050-123-4567; drop", "+972501234567"])("rejects the phone %j", async (phone) => {
    expect((await add(w.driver, phone)).error?.message).toContain("INVALID_PASSENGER");
  });

  it("rejects stops of another kind or another route", async () => {
    const swapped = await add(w.driver, guestPhone(), { pickup: stop("dropoff"), dropoff: stop("pickup") });
    expect(swapped.error?.message).toContain("INVALID_STOP");
    const unknown = await add(w.driver, guestPhone(), { pickup: randomUUID() });
    expect(unknown.error?.message).toContain("INVALID_STOP");
  });

  it("a guest takes a seat, and gives it back when removed", async () => {
    const before = await seatsLeft();
    const { data: bookingId } = await add(w.driver, guestPhone());
    expect(await seatsLeft()).toBe(before - 1);
    await w.driver.db.rpc("remove_passenger", { p_booking_id: bookingId });
    expect(await seatsLeft()).toBe(before);
  });
});

describe("guests stay apart from user accounts", () => {
  it("a registered user's phone isn't linked, and the driver can't tell she is registered", async () => {
    const phone = guestPhone();
    await w.service.from("profiles").update({ phone }).eq("id", w.stranger.id);
    const { data: bookingId } = await add(w.driver, phone.replaceAll("-", ""), { name: "Typed Name" });

    expect((await bookingOwner(bookingId)).passenger_id).toBeNull();
    const { data: mine } = await w.stranger.db.rpc("my_bookings");
    expect((mine as { booking_id: string }[]).map((b) => b.booking_id)).not.toContain(bookingId);

    const { data: list } = await w.driver.db.rpc("driver_passengers", { p_date: w.rideDate });
    const row = (list as { booking_id: string }[]).find((p) => p.booking_id === bookingId);
    expect(row).toMatchObject({ passenger_id: null, passenger_name: "Typed Name", passenger_email: null });
  });

  it("saving the guest's phone on a profile later doesn't move the booking", async () => {
    const phone = guestPhone();
    const { data: bookingId } = await add(w.driver, phone);

    const userId = await signUp();
    await w.service.from("profiles").update({ phone: phone.replaceAll("-", "") }).eq("id", userId);
    expect(await bookingOwner(bookingId)).toEqual({ passenger_id: null, status: "active" });
  });

  it("the driver who added her sees her details", async () => {
    const phone = guestPhone();
    const { data: bookingId } = await add(w.driver, phone, { name: "Seen By Driver" });
    const { data: rows } = await w.driver.db.from("bookings").select("guest_name, guest_phone").eq("id", bookingId);
    expect(rows).toEqual([{ guest_name: "Seen By Driver", guest_phone: phone }]);
  });

  describe.each([
    ["another user", () => w.stranger],
    ["a passenger on the same ride", () => w.passenger],
    ["the admin", () => w.admin],
  ])("%s", (_who, who) => {
    const privateGuest = async () => (await add(w.driver, guestPhone(), { name: "Private Guest" })).data as string;

    it("can't read the booking or see the guest anywhere", async () => {
      const u = who();
      const bookingId = await privateGuest();
      expect((await u.db.from("bookings").select("*").eq("id", bookingId)).data).toEqual([]);
      expect((await u.db.from("bookings").select("id").eq("guest_name", "Private Guest")).data).toEqual([]);
      const { data: list } = await u.db.rpc("driver_passengers", { p_date: w.rideDate });
      expect((list as { booking_id: string }[]).map((p) => p.booking_id)).not.toContain(bookingId);
      const { data: mine } = await u.db.rpc("my_bookings");
      expect((mine as { booking_id: string }[]).map((b) => b.booking_id)).not.toContain(bookingId);
    });

    it("can't change, cancel, delete or remove it", async () => {
      const u = who();
      const bookingId = await privateGuest();
      const paid = await u.db.from("bookings").update({ is_paid: true }).eq("id", bookingId).select("id");
      expect(paid.data ?? []).toEqual([]);
      expect((await u.db.from("bookings").update({ guest_name: "Hacked" }).eq("id", bookingId)).error).not.toBeNull();
      expect((await u.db.from("bookings").update({ status: "cancelled" }).eq("id", bookingId)).error).not.toBeNull();
      expect((await u.db.from("bookings").update({ passenger_id: u.id }).eq("id", bookingId)).error).not.toBeNull();
      expect((await u.db.from("bookings").delete().eq("id", bookingId)).error).not.toBeNull();
      expect((await u.db.rpc("cancel_booking", { p_booking_id: bookingId })).error?.message).toContain("BOOKING_NOT_FOUND");
      expect((await u.db.rpc("remove_passenger", { p_booking_id: bookingId })).error?.message).toContain("BOOKING_NOT_FOUND");

      const { data: row } = await w.service.from("bookings").select("passenger_id, status, is_paid, guest_name").eq("id", bookingId).single();
      expect(row).toEqual({ passenger_id: null, status: "active", is_paid: false, guest_name: "Private Guest" });
    });
  });

  it("a signed-out visitor can't read, add or write bookings", async () => {
    const { data: bookingId } = await add(w.driver, guestPhone());
    const read = await w.anon.from("bookings").select("id").eq("id", bookingId);
    expect(read.data ?? []).toEqual([]);
    expect((await w.anon.from("bookings").delete().eq("id", bookingId)).error).not.toBeNull();
    const { error } = await w.anon.rpc("add_passenger", {
      p_route_id: w.routeId, p_date: w.rideDate, p_name: "Anon", p_phone: guestPhone(),
      p_pickup_stop_id: stop("pickup"), p_dropoff_stop_id: stop("dropoff"),
    });
    expect(error).not.toBeNull();
    expect((await w.anon.rpc("remove_passenger", { p_booking_id: bookingId })).error).not.toBeNull();
    expect((await bookingOwner(bookingId)).status).toBe("active");
  });

  it("the database refuses a guest booking with an account", async () => {
    const { data: bookingId } = await add(w.driver, guestPhone());
    const { error } = await w.service.from("bookings").update({ passenger_id: w.stranger.id }).eq("id", bookingId);
    expect(error?.message).toContain("bookings_passenger_or_guest");
  });
});

describe("removing passengers", () => {
  it("the driver removes a passenger she added", async () => {
    const { data: bookingId } = await add(w.driver, guestPhone());
    expect((await w.driver.db.rpc("remove_passenger", { p_booking_id: bookingId })).error).toBeNull();
    expect((await bookingOwner(bookingId)).status).toBe("cancelled");
  });

  it("the driver can't remove a passenger who booked herself", async () => {
    const { error } = await w.driver.db.rpc("remove_passenger", { p_booking_id: w.bookingId });
    expect(error?.message).toContain("BOOKING_NOT_FOUND");
  });
});
