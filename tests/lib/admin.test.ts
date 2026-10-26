import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/tests/supabase-mock";
import { getAdminGroups } from "@/lib/admin";

const sb = createSupabaseMock();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.client }));

beforeEach(() => sb.reset());

describe("getAdminGroups", () => {
  it("lists every group with its routes, sorted by origin then destination", async () => {
    const groups = [{ id: "g1", origin: "בית שמש", destination: "ירושלים", is_active: false, routes: [] }];
    sb.onTable("ride_groups", { data: groups });

    expect(await getAdminGroups()).toEqual(groups);
    expect(sb.callsOn("ride_groups")).toEqual([
      ["select", ["id, origin, destination, is_active, routes(driver_id, is_active)"]],
      ["order", ["origin"]],
      ["order", ["destination"]],
    ]);
  });

  it("returns an empty list when there's no data", async () => {
    expect(await getAdminGroups()).toEqual([]);
  });

  it("throws on database errors", async () => {
    sb.onTable("ride_groups", { error: { message: "denied" } });
    await expect(getAdminGroups()).rejects.toThrow("denied");
  });
});
