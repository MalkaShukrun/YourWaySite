import { beforeEach, describe, expect, it, vi } from "vitest";
import { refresh } from "next/cache";
import { createSupabaseMock } from "../helpers/supabase-mock";
import { ID } from "../helpers/fixtures";

// Group management (spec H1–H3).

const sb = vi.hoisted(() => ({ mock: null as unknown as ReturnType<typeof createSupabaseMock> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.mock.client }));
vi.mock("@/lib/auth/session", () => ({ requireAdmin: vi.fn(async () => ({ id: ID.user, isAdmin: true })) }));
sb.mock = createSupabaseMock();
const { createGroup, createPlace, deleteGroup, deletePlace, setGroupActive, updateGroup, updatePlace } = await import("@/app/(app)/admin/actions");
const { requireAdmin } = await import("@/lib/auth/session");

const group = { originId: ID.place, destinationId: ID.place2 };
const saved = { origin_place_id: ID.place, destination_place_id: ID.place2 };

beforeEach(() => sb.mock.reset());

describe("createGroup", () => {
  it("saves the two places and refreshes", async () => {
    expect(await createGroup(group)).toEqual({});
    expect(sb.mock.callsOn("ride_groups")).toEqual([["insert", [saved]]]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("is for admins only", async () => {
    await createGroup(group);
    expect(requireAdmin).toHaveBeenCalledOnce();
  });

  it("refuses a duplicate (spec H1)", async () => {
    sb.mock.onTable("ride_groups", { error: { message: "duplicate key", code: "23505" } });
    expect(await createGroup(group)).toEqual({ error: "הקבוצה הזו כבר קיימת." });
  });

  // Another admin deleted a picked place while the dialog was open.
  it("refuses a place that is no longer on the list", async () => {
    sb.mock.onTable("ride_groups", { error: { message: "violates foreign key", code: "23503" } });
    expect(await createGroup(group)).toEqual({ error: "המקום לא נמצא." });
    expect(await updateGroup(ID.group, group)).toEqual({ error: "המקום לא נמצא." });
  });

  it.each([
    [{ originId: "", destinationId: ID.place2 }, "יש לבחור נקודת מוצא"],
    [{ originId: ID.place, destinationId: "x" }, "יש לבחור יעד"],
    [{ originId: ID.place, destinationId: ID.place }, "היעד חייב להיות שונה מנקודת המוצא"],
  ])("refuses %o without touching the database", async (values, message) => {
    expect(await createGroup(values)).toEqual({ error: message });
    expect(sb.mock.client.from).not.toHaveBeenCalled();
  });
});

describe("updateGroup (rename)", () => {
  it("renames the group", async () => {
    expect(await updateGroup(ID.group, group)).toEqual({});
    expect(sb.mock.callsOn("ride_groups")).toEqual([
      ["update", [saved]],
      ["eq", ["id", ID.group]],
    ]);
  });

  it("refuses a malformed id", async () => {
    expect(await updateGroup("x", group)).toEqual({ error: "הקבוצה לא נמצאה." });
  });

  it("refuses renaming to an existing group", async () => {
    sb.mock.onTable("ride_groups", { error: { message: "duplicate", code: "23505" } });
    expect(await updateGroup(ID.group, group)).toEqual({ error: "הקבוצה הזו כבר קיימת." });
  });
});

describe("setGroupActive (hide / show, spec H2)", () => {
  it.each([false, true])("sets is_active = %s", async (active) => {
    expect(await setGroupActive(ID.group, active)).toEqual({});
    expect(sb.mock.argsOf("ride_groups", "update")).toEqual([{ is_active: active }]);
  });

  it("refuses a malformed id or value", async () => {
    expect(await setGroupActive("x", true)).toEqual({ error: "הקבוצה לא נמצאה." });
    expect(await setGroupActive(ID.group, "no" as unknown as boolean)).toEqual({ error: "הקבוצה לא נמצאה." });
  });
});

describe("deleteGroup (spec H3)", () => {
  it("deletes an unused group", async () => {
    expect(await deleteGroup(ID.group)).toEqual({});
    expect(sb.mock.callsOn("ride_groups")).toEqual([["delete", []], ["eq", ["id", ID.group]]]);
  });

  it("refuses a group a route has used, suggesting to hide it", async () => {
    sb.mock.onTable("ride_groups", { error: { message: "violates foreign key", code: "23503" } });
    expect(await deleteGroup(ID.group)).toEqual({ error: "יש מסלולים בקבוצה הזו — אפשר להסתיר אותה במקום למחוק." });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the general message for anything else", async () => {
    sb.mock.onTable("ride_groups", { error: { message: "permission denied", code: "42501" } });
    expect(await deleteGroup(ID.group)).toEqual({ error: "משהו השתבש. נסי שוב בעוד רגע." });
  });
});

// The list of places groups go from and to (0040).
describe("places", () => {
  const place = { city: " בית שמש ", neighborhood: "רמה ג " };
  const trimmed = { city: "בית שמש", neighborhood: "רמה ג" };

  it("adds a place with trimmed names, for admins only", async () => {
    expect(await createPlace(place)).toEqual({});
    expect(sb.mock.callsOn("places")).toEqual([["insert", [trimmed]]]);
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each([
    [{ city: "א", neighborhood: "רמה ג" }, "לפחות 2 תווים"],
    [{ city: "בית שמש", neighborhood: "" }, "לפחות 2 תווים"],
    [{ city: "בית שמש, רמה", neighborhood: "ג" }, "בלי פסיק בשם העיר"],
    [{ city: "בית שמש", neighborhood: "א".repeat(41) }, "עד 40 תווים"],
  ])("refuses %o without touching the database", async (values, message) => {
    expect(await createPlace(values)).toEqual({ error: message });
    expect(sb.mock.client.from).not.toHaveBeenCalled();
  });

  it("refuses a place already on the list", async () => {
    sb.mock.onTable("places", { error: { message: "duplicate key", code: "23505" } });
    expect(await createPlace(place)).toEqual({ error: "המקום הזה כבר ברשימה." });
  });

  it("renames a place", async () => {
    expect(await updatePlace(ID.place, place)).toEqual({});
    expect(sb.mock.callsOn("places")).toEqual([["update", [trimmed]], ["eq", ["id", ID.place]]]);
    expect(await updatePlace("x", place)).toEqual({ error: "המקום לא נמצא." });
  });

  it("deletes an unused place, and refuses one a group uses", async () => {
    expect(await deletePlace(ID.place)).toEqual({});
    expect(sb.mock.callsOn("places")).toEqual([["delete", []], ["eq", ["id", ID.place]]]);
    sb.mock.reset();
    sb.mock.onTable("places", { error: { message: "violates foreign key", code: "23503" } });
    expect(await deletePlace(ID.place)).toEqual({ error: "יש קבוצות עם המקום הזה, ולכן אי אפשר למחוק אותו." });
  });
});
