import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteValues } from "@/lib/validation/route";

// Minimal in-memory stand-in for the routes table and the save_route RPC
// (supabase/migrations/0003_driver.sql), so flows run end to end.
type Row = { id: string; driver_id: string; is_active: boolean; route: Record<string, unknown>; stops: unknown[] };

const DRIVER = "11111111-1111-4111-8111-111111111111";
const OTHER_DRIVER = "22222222-2222-4222-8222-222222222222";
const GROUP = "33333333-3333-4333-8333-333333333333";

const db = vi.hoisted(() => ({
  routes: new Map<string, Row>(),
  nextId: 0,
  currentUser: "",
  failNext: null as string | null,
}));

function newId() {
  db.nextId += 1;
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(db.nextId).padStart(12, "0")}`;
}

const supabase = {
  rpc: vi.fn(async (fn: string, args: { p_route_id: string | null; p_route: Record<string, unknown>; p_stops: { kind: string }[] }) => {
    if (fn !== "save_route") throw new Error(`unexpected rpc ${fn}`);
    if (db.failNext) return { data: null, error: { message: db.failNext } };
    let id = args.p_route_id;
    if (id === null) {
      id = newId();
      db.routes.set(id, { id, driver_id: db.currentUser, is_active: true, route: args.p_route, stops: args.p_stops });
    } else {
      const row = db.routes.get(id);
      if (!row || row.driver_id !== db.currentUser || !row.is_active) {
        return { data: null, error: { message: 'P0001: ROUTE_NOT_FOUND' } };
      }
      row.route = args.p_route;
      row.stops = args.p_stops;
    }
    return { data: id, error: null };
  }),
  from: vi.fn((table: string) => ({
    update: vi.fn((patch: Partial<Row>) => {
      const filters: Record<string, string> = {};
      const chain = {
        eq(col: string, val: string) {
          filters[col] = val;
          return chain;
        },
        then(resolve: (r: { error: null }) => void) {
          if (table === "routes") {
            for (const row of db.routes.values()) {
              if (row.id === filters.id && row.driver_id === filters.driver_id) Object.assign(row, patch);
            }
          }
          resolve({ error: null });
        },
      };
      return chain;
    }),
    upsert: vi.fn(async () => ({ error: db.failNext ? { message: db.failNext } : null })),
  })),
};

class RedirectError extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectError(url);
  }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => supabase) }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => ({ id: db.currentUser })) }));

const { saveRoute, archiveRoute, updateRideTime, setRideCancelled } = await import("@/app/(app)/(driver)/actions");
const { refresh } = await import("next/cache");

function routeValues(overrides: Partial<RouteValues> = {}): RouteValues {
  return {
    groupId: GROUP,
    kind: "recurring",
    weekdays: [0, 2, 4],
    rideDate: "",
    outTime: "07:30",
    seats: "4",
    price: "15",
    stops: [
      { id: "", kind: "pickup", label: "קניון עזריאלי", lat: 32.074, lng: 34.792 },
      { id: "", kind: "dropoff", label: "תחנה מרכזית", lat: 31.789, lng: 35.203 },
    ],
    ...overrides,
  };
}

// saveRoute ends in redirect() on success; return the URL, or the error result.
async function save(values: RouteValues, routeId: string | null) {
  try {
    return await saveRoute(values, routeId);
  } catch (e) {
    if (e instanceof RedirectError) return { redirectedTo: e.url };
    throw e;
  }
}

function onlyRoute() {
  expect(db.routes.size).toBe(1);
  return [...db.routes.values()][0];
}

beforeEach(() => {
  db.routes.clear();
  db.nextId = 0;
  db.currentUser = DRIVER;
  db.failNext = null;
  vi.clearAllMocks();
});

describe("add route", () => {
  it("creates a recurring route and redirects to the list", async () => {
    const result = await save(routeValues(), null);

    expect(result).toEqual({ redirectedTo: "/routes?saved=1" });
    const row = onlyRoute();
    expect(row.driver_id).toBe(DRIVER);
    expect(row.is_active).toBe(true);
    expect(row.route).toEqual({
      group_id: GROUP,
      kind: "recurring",
      weekdays: [0, 2, 4],
      ride_date: "",
      out_time: "07:30",
      seats: "4",
      price: "15",
    });
    expect(supabase.rpc).toHaveBeenCalledWith("save_route", expect.objectContaining({ p_route_id: null }));
  });

  it("creates a one-time route", async () => {
    const result = await save(routeValues({ kind: "one_time", weekdays: [], rideDate: "2026-11-02" }), null);

    expect(result).toEqual({ redirectedTo: "/routes?saved=1" });
    expect(onlyRoute().route).toMatchObject({ kind: "one_time", ride_date: "2026-11-02" });
  });

  it("sends stops in order with only the fields the RPC expects", async () => {
    await save(routeValues(), null);

    expect(onlyRoute().stops).toEqual([
      { id: "", kind: "pickup", label: "קניון עזריאלי", lat: 32.074, lng: 34.792 },
      { id: "", kind: "dropoff", label: "תחנה מרכזית", lat: 31.789, lng: 35.203 },
    ]);
  });

  it.each([
    ["no weekdays on a recurring route", { weekdays: [] }, "יש לבחור לפחות יום אחד"],
    ["a one-time route without a date", { kind: "one_time" as const, rideDate: "" }, "יש לבחור תאריך"],
    ["an invalid time", { outTime: "25:00" }, "שעה לא תקינה"],
    ["too many seats", { seats: "9" }, "בין 1 ל־8 מקומות"],
    ["an invalid price", { price: "abc" }, "מחיר לא תקין"],
    ["no group", { groupId: "" }, "יש לבחור קבוצת נסיעה"],
  ])("rejects %s without touching the database", async (_name, overrides, message) => {
    const result = await save(routeValues(overrides as Partial<RouteValues>), null);

    expect(result).toEqual({ error: message });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(db.routes.size).toBe(0);
  });

  it("rejects a route without a pickup stop", async () => {
    const stops = routeValues().stops.filter((s) => s.kind !== "pickup");
    expect(await save(routeValues({ stops }), null)).toEqual({ error: "יש להוסיף לפחות תחנת איסוף אחת" });
  });

  it("rejects a route without a dropoff stop", async () => {
    const stops = routeValues().stops.filter((s) => s.kind !== "dropoff");
    expect(await save(routeValues({ stops }), null)).toEqual({ error: "יש להוסיף לפחות תחנת הורדה אחת" });
  });

  it("maps a database STOPS_REQUIRED error to a friendly message", async () => {
    db.failNext = "STOPS_REQUIRED";
    expect(await save(routeValues(), null)).toEqual({
      error: "יש להגדיר לפחות תחנת איסוף אחת ותחנת הורדה אחת.",
    });
  });

  it("falls back to a generic message for unknown database errors", async () => {
    db.failNext = "connection reset";
    expect(await save(routeValues(), null)).toEqual({ error: "משהו השתבש. נסי שוב בעוד רגע." });
  });
});

describe("update route", () => {
  it("updates an existing route in place", async () => {
    await save(routeValues(), null);
    const { id } = onlyRoute();

    const result = await save(routeValues({ outTime: "08:15", seats: "3", price: "20", weekdays: [1] }), id);

    expect(result).toEqual({ redirectedTo: "/routes?saved=1" });
    expect(onlyRoute().route).toMatchObject({ out_time: "08:15", seats: "3", price: "20", weekdays: [1] });
    expect(supabase.rpc).toHaveBeenLastCalledWith("save_route", expect.objectContaining({ p_route_id: id }));
  });

  it("keeps existing stop ids so the RPC updates them instead of re-creating", async () => {
    await save(routeValues(), null);
    const { id } = onlyRoute();
    const stopId = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
    const stops = routeValues().stops.map((s, i) => (i === 0 ? { ...s, id: stopId, label: "צומת גומא" } : s));

    await save(routeValues({ stops }), id);

    expect(onlyRoute().stops[0]).toEqual({ id: stopId, kind: "pickup", label: "צומת גומא", lat: 32.074, lng: 34.792 });
  });

  it("rejects a malformed route id without calling the database", async () => {
    expect(await save(routeValues(), "not-a-uuid")).toEqual({ error: "המסלול לא נמצא." });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("does not let a driver update someone else's route", async () => {
    await save(routeValues(), null);
    const { id } = onlyRoute();

    db.currentUser = OTHER_DRIVER;
    expect(await save(routeValues({ outTime: "09:00" }), id)).toEqual({ error: "המסלול לא נמצא." });
    expect(onlyRoute().route).toMatchObject({ out_time: "07:30" });
  });

  it("rejects invalid values on update and leaves the route unchanged", async () => {
    await save(routeValues(), null);
    const { id } = onlyRoute();

    expect(await save(routeValues({ outTime: "7:3" }), id)).toEqual({ error: "שעה לא תקינה" });
    expect(onlyRoute().route).toMatchObject({ out_time: "07:30" });
  });
});

describe("cancel route and add a new one", () => {
  it("archives the route and refreshes", async () => {
    await save(routeValues(), null);
    const { id } = onlyRoute();

    expect(await archiveRoute(id)).toEqual({});
    expect(onlyRoute().is_active).toBe(false);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("a cancelled route can no longer be edited", async () => {
    await save(routeValues(), null);
    const { id } = onlyRoute();
    await archiveRoute(id);

    expect(await save(routeValues({ outTime: "09:00" }), id)).toEqual({ error: "המסלול לא נמצא." });
  });

  it("creates a fresh route after cancelling, leaving the old one archived", async () => {
    await save(routeValues(), null);
    const oldId = onlyRoute().id;
    await archiveRoute(oldId);

    const result = await save(routeValues({ outTime: "17:00", weekdays: [3] }), null);

    expect(result).toEqual({ redirectedTo: "/routes?saved=1" });
    expect(db.routes.size).toBe(2);
    const [oldRoute, newRoute] = [...db.routes.values()];
    expect(oldRoute.id).toBe(oldId);
    expect(oldRoute.is_active).toBe(false);
    expect(oldRoute.route).toMatchObject({ out_time: "07:30" });
    expect(newRoute.id).not.toBe(oldId);
    expect(newRoute.is_active).toBe(true);
    expect(newRoute.route).toMatchObject({ out_time: "17:00", weekdays: [3] });
  });

  it("does not archive another driver's route", async () => {
    await save(routeValues(), null);
    const { id } = onlyRoute();

    db.currentUser = OTHER_DRIVER;
    await archiveRoute(id);

    expect(onlyRoute().is_active).toBe(true);
  });

  it("rejects a malformed route id", async () => {
    expect(await archiveRoute("123")).toEqual({ error: "המסלול לא נמצא." });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("per-date ride changes", () => {
  const routeId = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";

  it("updates the departure time for one date", async () => {
    expect(await updateRideTime(routeId, "2026-11-02", "08:00")).toEqual({});
    const upsert = supabase.from.mock.results[0].value.upsert;
    expect(supabase.from).toHaveBeenCalledWith("ride_exceptions");
    expect(upsert).toHaveBeenCalledWith(
      { route_id: routeId, ride_date: "2026-11-02", out_time: "08:00" },
      { onConflict: "route_id,ride_date" },
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each([
    ["bad time", routeId, "2026-11-02", "8:00"],
    ["bad date", routeId, "02/11/2026", "08:00"],
    ["bad route id", "x", "2026-11-02", "08:00"],
  ])("rejects a %s", async (_name, id, date, time) => {
    expect(await updateRideTime(id, date, time)).toEqual({ error: "שעה לא תקינה" });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it.each([true, false])("sets cancelled=%s for one date only", async (cancelled) => {
    expect(await setRideCancelled(routeId, "2026-11-02", cancelled)).toEqual({});
    const upsert = supabase.from.mock.results[0].value.upsert;
    expect(upsert).toHaveBeenCalledWith(
      { route_id: routeId, ride_date: "2026-11-02", cancelled },
      { onConflict: "route_id,ride_date" },
    );
  });

  it("rejects cancelling with an invalid date", async () => {
    expect(await setRideCancelled(routeId, "tomorrow", true)).toEqual({ error: "המסלול לא נמצא." });
  });
});
