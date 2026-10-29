import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../helpers/supabase-mock";
import { ID } from "../../helpers/fixtures";

const sb = vi.hoisted(() => ({ mock: null as unknown as ReturnType<typeof createSupabaseMock> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.mock.client }));
sb.mock = createSupabaseMock();
const { getDriverDay, getMyRoutes, getRouteForEdit, isPastOneTimeRide } = await import("@/lib/driver/data");

beforeEach(() => sb.mock.reset());

// A one-time ride moves to history once its date and time pass (spec B2, F2, G1).
describe("isPastOneTimeRide", () => {
  const oneTime = { kind: "one_time" as const, ride_date: "2026-11-01", out_time: "07:30:00" };

  it("is past from the departure minute on", () => {
    expect(isPastOneTimeRide(oneTime, "2026-11-01 07:29")).toBe(false);
    expect(isPastOneTimeRide(oneTime, "2026-11-01 07:30")).toBe(true);
    expect(isPastOneTimeRide(oneTime, "2026-11-02 00:00")).toBe(true);
  });

  it("is not past the day before, even late at night", () => {
    expect(isPastOneTimeRide(oneTime, "2026-10-31 23:59")).toBe(false);
  });

  // Past dates of a recurring route aren't listed in history (spec §8).
  it("never applies to a recurring route", () => {
    expect(isPastOneTimeRide({ kind: "recurring", ride_date: "2020-01-01", out_time: "07:00:00" }, "2026-11-01 08:00")).toBe(false);
  });

  it("is false without a date", () => {
    expect(isPastOneTimeRide({ ...oneTime, ride_date: null }, "2030-01-01 00:00")).toBe(false);
  });
});

const routeRow = (overrides: Record<string, unknown> = {}) => ({
  id: ID.route,
  kind: "one_time",
  group_id: ID.group,
  weekdays: [],
  ride_date: "2026-11-01",
  out_time: "07:30:00",
  return_time: null,
  seats: 3,
  price: 20,
  notes: null,
  ride_groups: { origin: "בית שמש", destination: "ירושלים" },
  ride_exceptions: [],
  ...overrides,
});

describe("getMyRoutes", () => {
  it("lists the driver's active routes, newest first, with the group's names", async () => {
    sb.mock.onTable("routes", { data: [routeRow()] });
    const [route] = await getMyRoutes(ID.driver);
    expect(route).toMatchObject({ id: ID.route, origin: "בית שמש", destination: "ירושלים", ride_cancelled: false });
    expect(route).not.toHaveProperty("ride_groups");
    expect(sb.mock.callsOn("routes")).toEqual(
      expect.arrayContaining([
        ["eq", ["driver_id", ID.driver]],
        ["eq", ["is_active", true]],
        ["order", ["created_at", { ascending: false }]],
      ]),
    );
  });

  // A one-time ride cancelled for its date goes to "מסלולים מבוטלים" (spec F3).
  it("marks a one-time ride cancelled for its own date", async () => {
    sb.mock.onTable("routes", { data: [routeRow({ ride_exceptions: [{ ride_date: "2026-11-01", cancelled: true }] })] });
    expect((await getMyRoutes(ID.driver))[0].ride_cancelled).toBe(true);
  });

  it("ignores cancellations of other dates, and of a recurring route's single dates", async () => {
    sb.mock.onTable("routes", {
      data: [
        routeRow({ ride_exceptions: [{ ride_date: "2026-11-02", cancelled: true }] }),
        routeRow({ kind: "recurring", ride_date: "2026-11-01", ride_exceptions: [{ ride_date: "2026-11-01", cancelled: true }] }),
      ],
    });
    expect((await getMyRoutes(ID.driver)).map((r) => r.ride_cancelled)).toEqual([false, false]);
  });

  it("copes with a missing group", async () => {
    sb.mock.onTable("routes", { data: [routeRow({ ride_groups: null, ride_exceptions: null })] });
    expect((await getMyRoutes(ID.driver))[0]).toMatchObject({ origin: "", destination: "" });
  });

  it("throws on a database error", async () => {
    sb.mock.onTable("routes", { data: null, error: { message: "down" } });
    await expect(getMyRoutes(ID.driver)).rejects.toThrow("down");
  });
});

describe("getRouteForEdit", () => {
  it("returns the route with its stops", async () => {
    sb.mock.onTable("routes", { data: routeRow() });
    sb.mock.onTable("stops", { data: [{ id: ID.pickup }] });
    expect(await getRouteForEdit(ID.driver, ID.route)).toMatchObject({ id: ID.route, stops: [{ id: ID.pickup }] });
    expect(sb.mock.callsOn("routes")).toEqual(
      expect.arrayContaining([["eq", ["id", ID.route]], ["eq", ["driver_id", ID.driver]], ["eq", ["is_active", true]]]),
    );
  });

  // Another driver's route, or a removed one, can't be opened (spec B4).
  it("is null for a route that isn't the driver's active route", async () => {
    sb.mock.onTable("routes", { data: null });
    expect(await getRouteForEdit(ID.driver, ID.route)).toBeNull();
  });
});

describe("getDriverDay", () => {
  const passenger = (route_id: string, booking_id: string) => ({ booking_id, route_id });

  it("gives each ride its own passengers and stops", async () => {
    sb.mock.onRpc("driver_rides", { data: [{ route_id: ID.route }, { route_id: ID.route2 }] });
    sb.mock.onRpc("driver_passengers", { data: [passenger(ID.route, "b1"), passenger(ID.route2, "b2"), passenger(ID.route, "b3")] });
    sb.mock.onTable("stops", { data: [{ id: "s1", route_id: ID.route2 }, { id: "s2", route_id: ID.route }] });

    const { rides } = await getDriverDay("2026-11-01");
    expect(rides.map((r) => r.passengers.map((p) => p.booking_id))).toEqual([["b1", "b3"], ["b2"]]);
    expect(rides.map((r) => r.stops.map((s) => s.id))).toEqual([["s2"], ["s1"]]);
    expect(sb.mock.client.rpc).toHaveBeenCalledWith("driver_rides", { p_date: "2026-11-01" });
    expect(sb.mock.client.rpc).toHaveBeenCalledWith("driver_passengers", { p_date: "2026-11-01" });
    expect(sb.mock.argsOf("stops", "in")).toEqual(["route_id", [ID.route, ID.route2]]);
  });

  it("doesn't query stops on a day without rides", async () => {
    sb.mock.onRpc("driver_rides", { data: [] });
    expect(await getDriverDay("2026-11-01")).toEqual({ rides: [] });
    expect(sb.mock.client.from).not.toHaveBeenCalled();
  });

  it.each(["driver_rides", "driver_passengers"])("throws when %s fails", async (fn) => {
    sb.mock.onRpc(fn, { data: null, error: { message: `${fn} failed` } });
    await expect(getDriverDay("2026-11-01")).rejects.toThrow(`${fn} failed`);
  });
});
