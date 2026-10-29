import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../helpers/supabase-mock";
import { ID } from "../helpers/fixtures";

// Smaller data readers: the profile form (lib/profile/data.ts), the admin
// group list (lib/admin/data.ts) and the sign-in page's totals (lib/site/stats.ts).

const sb = vi.hoisted(() => ({ mock: null as unknown as ReturnType<typeof createSupabaseMock> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.mock.client }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => sb.mock.client }));
sb.mock = createSupabaseMock();
const { getProfileValues, vehicleColumns } = await import("@/lib/profile/data");
const { getAdminGroups } = await import("@/lib/admin/data");
const { getSiteStats } = await import("@/lib/site/stats");

beforeEach(() => {
  sb.mock.reset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getProfileValues", () => {
  it("fills the form from the saved profile", async () => {
    sb.mock.onTable("profiles", {
      data: { full_name: "רחל", phone: "050-123-4567", vehicle_model: "יונדאי", vehicle_color: "לבן", vehicle_seats: 5 },
    });
    expect(await getProfileValues(ID.user, "Google name")).toEqual({
      fullName: "רחל",
      phone: "050-123-4567",
      hasVehicle: true,
      vehicleModel: "יונדאי",
      vehicleColor: "לבן",
      vehicleSeats: "5",
    });
  });

  it("starts empty, with the Google name and 4 seats, when nothing is saved yet", async () => {
    sb.mock.onTable("profiles", { data: null });
    expect(await getProfileValues(ID.user, "Google name")).toEqual({
      fullName: "Google name",
      phone: "",
      hasVehicle: false,
      vehicleModel: "",
      vehicleColor: "",
      vehicleSeats: "4",
    });
  });
});

// Vehicle details are all-or-nothing (spec A3).
describe("vehicleColumns", () => {
  it("saves the car's details as columns", () => {
    expect(vehicleColumns({ hasVehicle: true, vehicleModel: "יונדאי", vehicleColor: "לבן", vehicleSeats: "5" })).toEqual({
      vehicle_model: "יונדאי",
      vehicle_color: "לבן",
      vehicle_seats: 5,
    });
  });

  it("clears every car column once the car is removed", () => {
    expect(vehicleColumns({ hasVehicle: false, vehicleModel: "יונדאי", vehicleColor: "לבן", vehicleSeats: "5" })).toEqual({
      vehicle_model: null,
      vehicle_color: null,
      vehicle_seats: null,
    });
  });
});

describe("getAdminGroups", () => {
  it("lists every group, hidden ones too, with the routes that use it", async () => {
    sb.mock.onTable("ride_groups", { data: [{ id: ID.group, routes: [] }] });
    expect(await getAdminGroups()).toEqual([{ id: ID.group, routes: [] }]);
    expect(sb.mock.callsOn("ride_groups")).not.toContainEqual(["eq", ["is_active", true]]);
  });

  it("throws on a database error", async () => {
    sb.mock.onTable("ride_groups", { error: { message: "denied" } });
    await expect(getAdminGroups()).rejects.toThrow("denied");
  });
});

// Site totals on the sign-in page, for everyone including visitors (spec §3, §5).
describe("getSiteStats", () => {
  // public_stats is read with .rpc(…).single().
  const statsReturn = (result: { data?: unknown; error?: { message: string } }) =>
    sb.mock.client.rpc.mockReturnValueOnce({ single: async () => ({ data: null, error: null, ...result }) } as never);

  it("returns the totals as numbers", async () => {
    statsReturn({ data: { members: "120", routes: 7 } });
    expect(await getSiteStats()).toEqual({ members: 120, routes: 7 });
    expect(sb.mock.client.rpc).toHaveBeenCalledWith("public_stats");
  });

  it("is null when the database can't be reached, so the page leaves the row out", async () => {
    statsReturn({ error: { message: "unreachable" } });
    expect(await getSiteStats()).toBeNull();
  });

  it("is null when a column is missing", async () => {
    statsReturn({ data: { members: 3 } });
    expect(await getSiteStats()).toBeNull();
  });
});
