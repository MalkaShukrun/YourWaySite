import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/tests/supabase-mock";
import { getMyBookings, getRide, getRideGroups, getRouteDates, searchRides } from "@/lib/rides";

const sb = createSupabaseMock();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.client }));

beforeEach(() => sb.reset());

describe("getRideGroups", () => {
  it("lists active groups sorted by origin then destination", async () => {
    const groups = [{ id: "g1", origin: "בית שמש", destination: "ירושלים" }];
    sb.onTable("ride_groups", { data: groups });

    expect(await getRideGroups()).toEqual(groups);
    expect(sb.callsOn("ride_groups")).toEqual([
      ["select", ["id, origin, destination"]],
      ["eq", ["is_active", true]],
      ["order", ["origin"]],
      ["order", ["destination"]],
    ]);
  });

  it("returns an empty list when there's no data", async () => {
    expect(await getRideGroups()).toEqual([]);
  });
});

describe("getRouteDates", () => {
  it("returns the coming week's dates of one route only", async () => {
    sb.onRpc("search_rides", {
      data: [
        { route_id: "r1", ride_date: "2026-10-27" },
        { route_id: "r2", ride_date: "2026-10-27" },
        { route_id: "r1", ride_date: "2026-10-29" },
      ],
    });
    expect((await getRouteDates("r1")).map((r) => r.ride_date)).toEqual(["2026-10-27", "2026-10-29"]);
  });
});

describe("searchRides", () => {
  it("passes nulls for missing filters", async () => {
    await searchRides({});
    expect(sb.client.rpc).toHaveBeenCalledWith("search_rides", {
      p_group_id: null,
      p_date: null,
      p_kind: null,
      p_from_time: null,
      p_to_time: null,
    });
  });

  it.each([
    ["early", "06:00", "07:30"],
    ["morning", "07:30", "09:00"],
    ["later", "09:00", null],
  ] as const)("maps the %s time window", async (time, from, to) => {
    await searchRides({ groupId: "g1", date: "2026-11-02", kind: "recurring", time });
    expect(sb.client.rpc).toHaveBeenCalledWith("search_rides", {
      p_group_id: "g1",
      p_date: "2026-11-02",
      p_kind: "recurring",
      p_from_time: from,
      p_to_time: to,
    });
  });

  it("returns the rides", async () => {
    sb.onRpc("search_rides", { data: [{ route_id: "r1" }] });
    expect(await searchRides({})).toEqual([{ route_id: "r1" }]);
  });

  it("throws on database errors", async () => {
    sb.onRpc("search_rides", { error: { message: "boom" } });
    await expect(searchRides({})).rejects.toThrow("boom");
  });
});

describe("getRide", () => {
  it("returns the ride with its active stops in order", async () => {
    sb.onRpc("get_ride", { data: [{ route_id: "r1" }] });
    sb.onTable("stops", { data: [{ id: "s1" }] });

    expect(await getRide("r1", "2026-11-02")).toEqual({ ride: { route_id: "r1" }, stops: [{ id: "s1" }] });
    expect(sb.client.rpc).toHaveBeenCalledWith("get_ride", { p_route_id: "r1", p_date: "2026-11-02" });
    expect(sb.callsOn("stops")).toEqual([
      ["select", ["id, kind, label, lat, lng"]],
      ["eq", ["route_id", "r1"]],
      ["eq", ["is_active", true]],
      ["order", ["position"]],
    ]);
  });

  it("returns null when the ride doesn't exist", async () => {
    sb.onRpc("get_ride", { data: [] });
    expect(await getRide("r1", "2026-11-02")).toBeNull();
  });
});

describe("getMyBookings", () => {
  it("returns the bookings", async () => {
    sb.onRpc("my_bookings", { data: [{ booking_id: "b1" }] });
    expect(await getMyBookings()).toEqual([{ booking_id: "b1" }]);
  });

  it("throws on database errors", async () => {
    sb.onRpc("my_bookings", { error: { message: "nope" } });
    await expect(getMyBookings()).rejects.toThrow("nope");
  });
});
