import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/tests/supabase-mock";
import { getDriverDay, getMyRoutes, getRouteForEdit } from "@/lib/driver";

const sb = createSupabaseMock();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.client }));

const ROUTE_COLUMNS =
  "id, kind, group_id, weekdays, ride_date, out_time, return_time, seats, price, ride_groups(origin, destination)";

beforeEach(() => sb.reset());

describe("getDriverDay", () => {
  it("attaches each route's passengers and stops", async () => {
    sb.onRpc("driver_rides", { data: [{ route_id: "r1" }, { route_id: "r2" }] });
    sb.onRpc("driver_passengers", {
      data: [
        { booking_id: "b1", route_id: "r1" },
        { booking_id: "b2", route_id: "r2" },
        { booking_id: "b3", route_id: "r1" },
      ],
    });
    sb.onTable("stops", {
      data: [
        { id: "s1", route_id: "r1" },
        { id: "s2", route_id: "r2" },
      ],
    });

    const { rides } = await getDriverDay("2026-11-02");

    expect(rides).toEqual([
      {
        route_id: "r1",
        passengers: [
          { booking_id: "b1", route_id: "r1" },
          { booking_id: "b3", route_id: "r1" },
        ],
        stops: [{ id: "s1", route_id: "r1" }],
      },
      { route_id: "r2", passengers: [{ booking_id: "b2", route_id: "r2" }], stops: [{ id: "s2", route_id: "r2" }] },
    ]);
    expect(sb.client.rpc).toHaveBeenCalledWith("driver_rides", { p_date: "2026-11-02" });
    expect(sb.client.rpc).toHaveBeenCalledWith("driver_passengers", { p_date: "2026-11-02" });
    expect(sb.callsOn("stops")).toContainEqual(["in", ["route_id", ["r1", "r2"]]]);
  });

  it("skips the stops query on a day without rides", async () => {
    expect(await getDriverDay("2026-11-02")).toEqual({ rides: [] });
    expect(sb.client.from).not.toHaveBeenCalled();
  });

  it.each(["driver_rides", "driver_passengers"])("throws when %s fails", async (fn) => {
    sb.onRpc(fn, { error: { message: `${fn} failed` } });
    await expect(getDriverDay("2026-11-02")).rejects.toThrow(`${fn} failed`);
  });
});

describe("getMyRoutes", () => {
  it("lists the driver's active routes, newest first, with the group names flattened", async () => {
    sb.onTable("routes", {
      data: [
        { id: "r1", seats: 4, ride_groups: { origin: "בית שמש", destination: "ירושלים" } },
        { id: "r2", seats: 3, ride_groups: null },
      ],
    });

    expect(await getMyRoutes("d1")).toEqual([
      { id: "r1", seats: 4, origin: "בית שמש", destination: "ירושלים" },
      { id: "r2", seats: 3, origin: "", destination: "" },
    ]);
    expect(sb.callsOn("routes")).toEqual([
      ["select", [ROUTE_COLUMNS]],
      ["eq", ["driver_id", "d1"]],
      ["eq", ["is_active", true]],
      ["order", ["created_at", { ascending: false }]],
    ]);
  });

  it("throws on database errors", async () => {
    sb.onTable("routes", { error: { message: "denied" } });
    await expect(getMyRoutes("d1")).rejects.toThrow("denied");
  });
});

describe("getRouteForEdit", () => {
  it("returns the route with its stops", async () => {
    sb.onTable("routes", { data: { id: "r1", ride_groups: { origin: "א", destination: "ב" } } });
    sb.onTable("stops", { data: [{ id: "s1" }] });

    expect(await getRouteForEdit("d1", "r1")).toEqual({ id: "r1", origin: "א", destination: "ב", stops: [{ id: "s1" }] });
    expect(sb.callsOn("routes")).toEqual([
      ["select", [ROUTE_COLUMNS]],
      ["eq", ["id", "r1"]],
      ["eq", ["driver_id", "d1"]],
      ["eq", ["is_active", true]],
      ["maybeSingle", []],
    ]);
  });

  it("returns null for a route that isn't the driver's or was cancelled", async () => {
    sb.onTable("routes", { data: null });
    expect(await getRouteForEdit("d1", "r1")).toBeNull();
  });
});
