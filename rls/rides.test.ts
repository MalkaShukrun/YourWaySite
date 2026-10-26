import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, DENIED, type User, type World } from "./world";

// Routes, stops and bookings (0002, 0003, 0007, 0009): drivers manage only their own
// routes, bookings change only through book_ride / cancel_booking, and contact
// details reach only passengers booked with the driver.

let w: World;
beforeAll(async () => {
  w = await createWorld();
});
afterAll(() => w?.cleanup());

describe("routes and stops", () => {
  it("another user can't edit a driver's route", async () => {
    const { data } = await w.stranger.db.from("routes").update({ seats: 8 }).eq("id", w.routeId).select();
    expect(data).toEqual([]);
  });

  it("another user can't add a route in the driver's name", async () => {
    const { error } = await w.stranger.db.from("routes").insert({
      driver_id: w.driver.id,
      group_id: w.groupId,
      kind: "one_time",
      ride_date: w.rideDate,
      out_time: "09:00",
      seats: 3,
    });
    expect(error?.code).toBe(DENIED);
  });

  it("another user can't add stops to the driver's route", async () => {
    const { error } = await w.stranger.db
      .from("stops")
      .insert({ route_id: w.routeId, kind: "pickup", label: "Fake" });
    expect(error?.code).toBe(DENIED);
  });

  it("even the driver can't delete a route (it's archived instead)", async () => {
    const { error } = await w.driver.db.from("routes").delete().eq("id", w.routeId);
    expect(error?.code).toBe(DENIED);
  });

  it("the driver can edit their own route", async () => {
    const { data } = await w.driver.db.from("routes").update({ seats: 4 }).eq("id", w.routeId).select("seats");
    expect(data).toEqual([{ seats: 4 }]);
  });
});

describe("bookings", () => {
  it("a passenger can't insert a booking directly", async () => {
    const { data: stops } = await w.service.from("stops").select("id, kind").eq("route_id", w.routeId);
    const stop = (kind: string) => stops!.find((s) => s.kind === kind)!.id;
    const { error } = await w.stranger.db.from("bookings").insert({
      route_id: w.routeId,
      ride_date: w.rideDate,
      passenger_id: w.stranger.id,
      pickup_stop_id: stop("pickup"),
      dropoff_stop_id: stop("dropoff"),
    });
    expect(error?.code).toBe(DENIED);
  });

  it("a passenger can't change a booking's status directly", async () => {
    const { error } = await w.passenger.db.from("bookings").update({ status: "cancelled" }).eq("id", w.bookingId);
    expect(error?.code).toBe(DENIED);
  });

  it("a passenger can mark their own booking paid", async () => {
    const { data } = await w.passenger.db
      .from("bookings")
      .update({ is_paid: true })
      .eq("id", w.bookingId)
      .select("is_paid");
    expect(data).toEqual([{ is_paid: true }]);
  });

  it("another user can't see or touch the booking", async () => {
    const read = await w.stranger.db.from("bookings").select("id").eq("id", w.bookingId);
    expect(read.data).toEqual([]);
    const paid = await w.stranger.db.from("bookings").update({ is_paid: false }).eq("id", w.bookingId).select();
    expect(paid.data).toEqual([]);
    const cancel = await w.stranger.db.rpc("cancel_booking", { p_booking_id: w.bookingId });
    expect(cancel.error?.message).toContain("BOOKING_NOT_FOUND");
  });

  it("the driver sees bookings on their route", async () => {
    const { data } = await w.driver.db.from("bookings").select("id").eq("id", w.bookingId);
    expect(data).toHaveLength(1);
  });
});

describe("contact details", () => {
  const ride = (u: User) =>
    u.db.rpc("get_ride", { p_route_id: w.routeId, p_date: w.rideDate }).single<{ driver_phone: string | null }>();

  it("the driver's phone goes only to booked passengers", async () => {
    expect((await ride(w.passenger)).data?.driver_phone).toBe("050-0000000");
    expect((await ride(w.stranger)).data?.driver_phone).toBeNull();
  });

  it("only the driver gets the passengers' contact details", async () => {
    const passengers = (u: User) => u.db.rpc("driver_passengers", { p_date: w.rideDate });
    expect((await passengers(w.driver)).data).toHaveLength(1);
    expect((await passengers(w.passenger)).data).toEqual([]);
    expect((await passengers(w.stranger)).data).toEqual([]);
  });

  // Runs last in this file: the stranger books and then leaves the ride.
  it("the driver's phone is gone from a booking cancelled in time", async () => {
    const { data: stops } = await w.stranger.db.from("stops").select("id, kind").eq("route_id", w.routeId);
    const stop = (kind: string) => stops!.find((s) => s.kind === kind)!.id;
    const { data: bookingId } = await w.stranger.db.rpc("book_ride", {
      p_route_id: w.routeId,
      p_date: w.rideDate,
      p_pickup_stop_id: stop("pickup"),
      p_dropoff_stop_id: stop("dropoff"),
    });
    const driverPhone = async () => {
      const { data } = await w.stranger.db.rpc("my_bookings");
      return (data as { booking_id: string; driver_phone: string | null }[]).find((b) => b.booking_id === bookingId)
        ?.driver_phone;
    };

    expect(await driverPhone()).toBe("050-0000000");
    expect((await w.stranger.db.rpc("cancel_booking", { p_booking_id: bookingId })).data).toBe("cancelled");
    expect(await driverPhone()).toBeNull();
  });
});

describe("signed out", () => {
  it("can't call the ride functions", async () => {
    for (const [fn, args] of [
      ["search_rides", {}],
      ["get_ride", { p_route_id: w.routeId, p_date: w.rideDate }],
    ] as const) {
      const { error } = await w.anon.rpc(fn, args);
      expect(error?.code, fn).toBe(DENIED);
    }
  });
});
