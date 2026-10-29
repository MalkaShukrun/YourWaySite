import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../helpers/supabase-mock";
import { ID, ride } from "../../helpers/fixtures";

const sb = vi.hoisted(() => ({ mock: null as unknown as ReturnType<typeof createSupabaseMock> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.mock.client }));
sb.mock = createSupabaseMock();
const { getMyBookings, getRide, getRideGroups, getRouteDates, getRouteStops, searchRides } = await import("@/lib/rides/data");

beforeEach(() => sb.mock.reset());

const searchArgs = () => sb.mock.client.rpc.mock.calls.filter(([fn]) => fn === "search_rides").map(([, args]) => args);

describe("searchRides", () => {
  it("searches all groups in one call when none is picked", async () => {
    sb.mock.onRpc("search_rides", { data: [ride()] });
    expect(await searchRides({})).toEqual([ride()]);
    expect(searchArgs()).toEqual([{ p_group_id: null, p_date: null, p_kind: null, p_from_time: null, p_to_time: null }]);
  });

  it("passes the date, kind and departure range", async () => {
    await searchRides({ groupIds: [ID.group], date: "2026-11-01", kind: "one_time", from: "07:00", to: "09:00" });
    expect(searchArgs()).toEqual([
      // "Until" is inclusive in the app; the database's bound is exclusive, so it gets the next minute.
      { p_group_id: ID.group, p_date: "2026-11-01", p_kind: "one_time", p_from_time: "07:00", p_to_time: "09:01" },
    ]);
  });

  it.each([
    ["10:59", "11:00"],
    ["00:00", "00:01"],
    ["23:58", "23:59"],
    ["23:59", null], // no upper bound left
  ])("'until %s' is sent as before %s", async (to, bound) => {
    await searchRides({ to });
    expect(searchArgs()[0]).toMatchObject({ p_to_time: bound });
  });

  it("searches each picked group and merges by date, then time", async () => {
    sb.mock.onRpc(
      "search_rides",
      { data: [ride({ route_id: "a", ride_date: "2026-11-02", out_time: "07:00:00" })] },
      { data: [ride({ route_id: "b", ride_date: "2026-11-01", out_time: "09:00:00" }), ride({ route_id: "c", ride_date: "2026-11-02", out_time: "06:00:00" })] },
    );
    const results = await searchRides({ groupIds: [ID.group, ID.group2] });
    expect(results.map((r) => r.route_id)).toEqual(["b", "c", "a"]);
    expect(searchArgs().map((a) => (a as { p_group_id: string }).p_group_id)).toEqual([ID.group, ID.group2]);
  });

  it("returns nothing when the database returns nothing", async () => {
    sb.mock.onRpc("search_rides", { data: null });
    expect(await searchRides({})).toEqual([]);
  });

  it("fails loudly on a database error, for the page's error screen (spec I2)", async () => {
    sb.mock.onRpc("search_rides", { data: null, error: { message: "boom" } });
    await expect(searchRides({})).rejects.toThrow("boom");
  });
});

describe("getRouteDates", () => {
  it("keeps only the route's dates from this week's search", async () => {
    sb.mock.onRpc("search_rides", { data: [ride({ ride_date: "2026-11-01" }), ride({ route_id: ID.route2 }), ride({ ride_date: "2026-11-02" })] });
    expect((await getRouteDates(ID.route)).map((r) => r.ride_date)).toEqual(["2026-11-01", "2026-11-02"]);
  });
});

describe("getRideGroups", () => {
  it("lists only shown groups, by origin then destination", async () => {
    sb.mock.onTable("ride_groups", { data: [{ id: ID.group, origin: "א", destination: "ב" }] });
    expect(await getRideGroups()).toHaveLength(1);
    expect(sb.mock.callsOn("ride_groups")).toEqual([
      ["select", ["id, origin, destination"]],
      ["eq", ["is_active", true]],
      ["order", ["origin"]],
      ["order", ["destination"]],
    ]);
  });

  it("is empty when nothing comes back", async () => {
    expect(await getRideGroups()).toEqual([]);
  });
});

describe("getRouteStops", () => {
  it("reads the route's active stops in the driver's order", async () => {
    await getRouteStops(ID.route);
    expect(sb.mock.callsOn("stops")).toEqual([
      ["select", ["id, kind, label, lat, lng"]],
      ["eq", ["route_id", ID.route]],
      ["eq", ["is_active", true]],
      ["order", ["position"]],
    ]);
  });
});

describe("getRide", () => {
  it("returns the ride with its stops", async () => {
    const stops = [{ id: ID.pickup, kind: "pickup", label: "צומת", lat: null, lng: null }];
    sb.mock.onRpc("get_ride", { data: [{ ...ride(), is_available: true }] });
    sb.mock.onTable("stops", { data: stops });
    const result = await getRide(ID.route, "2026-11-01");
    expect(result?.ride.route_id).toBe(ID.route);
    expect(result?.stops).toEqual(stops);
    expect(sb.mock.client.rpc).toHaveBeenCalledWith("get_ride", { p_route_id: ID.route, p_date: "2026-11-01" });
  });

  it("is null for a route that doesn't exist (the page shows not-found, spec C7)", async () => {
    sb.mock.onRpc("get_ride", { data: [] });
    expect(await getRide(ID.route, "2026-11-01")).toBeNull();
  });
});

describe("getMyBookings", () => {
  it("returns the passenger's bookings", async () => {
    sb.mock.onRpc("my_bookings", { data: [{ booking_id: ID.booking }] });
    expect(await getMyBookings()).toEqual([{ booking_id: ID.booking }]);
  });

  it("throws on a database error", async () => {
    sb.mock.onRpc("my_bookings", { data: null, error: { message: "down" } });
    await expect(getMyBookings()).rejects.toThrow("down");
  });
});
