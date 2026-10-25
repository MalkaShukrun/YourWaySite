import { beforeEach, describe, expect, it, vi } from "vitest";
import { refresh } from "next/cache";
import { createSupabaseMock } from "@/test/supabase-mock";
import { runAction } from "@/test/redirect";
import { requireAdmin } from "@/lib/auth";
import { RedirectError } from "@/test/setup";
import { createGroup, deleteGroup, setGroupActive, updateGroup } from "./actions";

const sb = createSupabaseMock();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.client }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => ({ id: "admin" })) }));

const GROUP = "11111111-1111-4111-8111-111111111111";
const values = { origin: "בית שמש", destination: "ירושלים" };

beforeEach(() => sb.reset());

describe("createGroup", () => {
  it("inserts the trimmed group and refreshes", async () => {
    expect(await createGroup({ origin: "  בית שמש ", destination: "ירושלים" })).toEqual({});
    expect(sb.callsOn("ride_groups")).toEqual([["insert", [values]]]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each([
    ["a too-short origin", { origin: "א", destination: "ירושלים" }, "לפחות 2 תווים"],
    ["a too-long destination", { origin: "בית שמש", destination: "א".repeat(41) }, "עד 40 תווים"],
    ["the same place twice", { origin: "ירושלים", destination: "ירושלים" }, "היעד חייב להיות שונה מנקודת המוצא"],
  ])("rejects %s", async (_name, input, message) => {
    expect(await createGroup(input)).toEqual({ error: message });
    expect(sb.client.from).not.toHaveBeenCalled();
  });

  it("reports a duplicate group", async () => {
    sb.onTable("ride_groups", { error: { code: "23505" } });
    expect(await createGroup(values)).toEqual({ error: "הקבוצה הזו כבר קיימת." });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is admin-only", async () => {
    vi.mocked(requireAdmin).mockRejectedValueOnce(new RedirectError("/"));
    expect(await runAction(() => createGroup(values))).toEqual({ redirectedTo: "/" });
    expect(sb.client.from).not.toHaveBeenCalled();
  });
});

describe("updateGroup", () => {
  it("renames the group", async () => {
    expect(await updateGroup(GROUP, values)).toEqual({});
    expect(sb.callsOn("ride_groups")).toEqual([
      ["update", [values]],
      ["eq", ["id", GROUP]],
    ]);
  });

  it("rejects a malformed id", async () => {
    expect(await updateGroup("x", values)).toEqual({ error: "הקבוצה לא נמצאה." });
  });

  it("rejects invalid values", async () => {
    expect(await updateGroup(GROUP, { origin: "ירושלים", destination: "ירושלים" })).toEqual({
      error: "היעד חייב להיות שונה מנקודת המוצא",
    });
    expect(sb.client.from).not.toHaveBeenCalled();
  });
});

describe("setGroupActive", () => {
  it.each([true, false])("sets is_active=%s", async (active) => {
    expect(await setGroupActive(GROUP, active)).toEqual({});
    expect(sb.callsOn("ride_groups")).toEqual([
      ["update", [{ is_active: active }]],
      ["eq", ["id", GROUP]],
    ]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("rejects a malformed id", async () => {
    expect(await setGroupActive("x", true)).toEqual({ error: "הקבוצה לא נמצאה." });
  });
});

describe("deleteGroup", () => {
  it("deletes an unused group", async () => {
    expect(await deleteGroup(GROUP)).toEqual({});
    expect(sb.callsOn("ride_groups")).toEqual([
      ["delete", []],
      ["eq", ["id", GROUP]],
    ]);
  });

  it("explains that a group with routes can only be hidden", async () => {
    sb.onTable("ride_groups", { error: { code: "23503" } });
    expect(await deleteGroup(GROUP)).toEqual({ error: "יש מסלולים בקבוצה הזו — אפשר להסתיר אותה במקום למחוק." });
  });

  it("falls back to a generic message", async () => {
    sb.onTable("ride_groups", { error: { code: "XX000" } });
    expect(await deleteGroup(GROUP)).toEqual({ error: "משהו השתבש. נסי שוב בעוד רגע." });
  });

  it("rejects a malformed id", async () => {
    expect(await deleteGroup("x")).toEqual({ error: "הקבוצה לא נמצאה." });
  });
});
