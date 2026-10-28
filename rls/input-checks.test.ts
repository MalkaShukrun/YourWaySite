import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, type World } from "./world";

// The database's own input checks (0015): writes straight through the API,
// skipping the forms' validation, are refused the same way.

let w: World;

beforeAll(async () => {
  w = await createWorld();
});
afterAll(async () => {
  await w?.cleanup();
});

const CHECK_VIOLATION = "23514";

describe("profiles", () => {
  const save = (row: Record<string, unknown>) => w.stranger.db.from("profiles").update(row).eq("id", w.stranger.id);

  it("accepts valid details", async () => {
    expect((await save({ full_name: "Valid Name", phone: "050-123-4567", vehicle_model: "Corolla", vehicle_color: "White" })).error)
      .toBeNull();
    expect((await save({ phone: "0501234567", vehicle_model: null, vehicle_color: null })).error).toBeNull();
  });

  it.each([
    ["a name over 60 characters", { full_name: "x".repeat(61) }],
    ["a name with control characters", { full_name: "Ra\nchel" }],
    ["a malformed phone", { phone: "123" }],
    ["a phone with text after it", { phone: "050-123-4567 call me" }],
    ["an international phone", { phone: "+972501234567" }],
    ["a vehicle model over 40 characters", { vehicle_model: "x".repeat(41) }],
    ["an empty vehicle model", { vehicle_model: "" }],
    ["a vehicle color over 20 characters", { vehicle_color: "x".repeat(21) }],
  ])("refuses %s", async (_case, row) => {
    expect((await save(row)).error?.code).toBe(CHECK_VIOLATION);
  });

  it("a long Google name is cut to 60 characters at sign-up", async () => {
    const { data, error } = await w.service.auth.admin.createUser({
      email: `rls-longname-${Date.now()}@example.test`,
      email_confirm: true,
      user_metadata: { full_name: "א".repeat(80) },
    });
    if (error) throw error;
    try {
      const { data: profile } = await w.service.from("profiles").select("full_name").eq("id", data.user.id).single();
      expect(profile!.full_name).toHaveLength(60);
    } finally {
      await w.service.auth.admin.deleteUser(data.user.id);
    }
  });
});

describe("stops", () => {
  it.each([
    ["a one-character label", "x"],
    ["a label over 60 characters", "x".repeat(61)],
  ])("refuses %s", async (_case, label) => {
    const { error } = await w.driver.db.from("stops").insert({ route_id: w.routeId, kind: "pickup", label, position: 9 });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it("refuses an overlong label through save_route as well", async () => {
    const { data: stops } = await w.service.from("stops").select("id, kind, label").eq("route_id", w.routeId);
    const { error } = await w.driver.db.rpc("save_route", {
      p_route_id: w.routeId,
      p_route: { group_id: w.groupId, kind: "one_time", weekdays: [], ride_date: w.rideDate, out_time: "08:00", seats: "3", price: "20", notes: "" },
      p_stops: stops!.map((s, i) => ({ ...s, label: i === 0 ? "x".repeat(61) : s.label, lat: null, lng: null })),
    });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });
});

describe("routes", () => {
  it.each([
    ["a repeated weekday", [1, 1]],
    ["a weekday out of range", [7]],
  ])("refuses %s", async (_case, weekdays) => {
    const { error } = await w.driver.db.from("routes").update({ kind: "recurring", weekdays }).eq("id", w.routeId);
    expect(error?.code).toBe(CHECK_VIOLATION);
  });
});

describe("ride groups", () => {
  it.each([
    ["a one-character name", { origin: "x", destination: "Somewhere" }],
    ["a name over 40 characters", { origin: "x".repeat(41), destination: "Somewhere" }],
    ["the same origin and destination", { origin: "Same Place", destination: "Same Place" }],
  ])("refuses %s, even from an admin", async (_case, row) => {
    expect((await w.admin.db.from("ride_groups").insert(row)).error?.code).toBe(CHECK_VIOLATION);
  });
});
