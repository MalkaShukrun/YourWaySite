import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, signInAs } from "../../helpers/supabase-mock";
import { runAction } from "../../helpers/run-action";
import { ID } from "../../helpers/fixtures";

const sb = vi.hoisted(() => ({ mock: null as unknown as ReturnType<typeof createSupabaseMock> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.mock.client }));
// cache() would keep the first test's user for the whole file.
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));
sb.mock = createSupabaseMock();
const { getCurrentUser, homePathFor, needsOnboarding, requireAdmin, requireUser } = await import("@/lib/auth/session");

const profile = (overrides: Record<string, unknown> = {}) => ({
  full_name: "רחל לוי",
  email: "rachel@example.test",
  phone: "050-123-4567",
  is_admin: false,
  ...overrides,
});

beforeEach(() => sb.mock.reset());

describe("getCurrentUser", () => {
  it("is null when signed out", async () => {
    expect(await getCurrentUser()).toBeNull();
    expect(sb.mock.client.from).not.toHaveBeenCalled();
  });

  it("reads the signed-in user's profile", async () => {
    signInAs(sb.mock, ID.user);
    sb.mock.onTable("profiles", { data: profile({ is_admin: true }) });
    expect(await getCurrentUser()).toEqual({
      id: ID.user,
      email: "rachel@example.test",
      fullName: "רחל לוי",
      phone: "050-123-4567",
      isAdmin: true,
    });
    expect(sb.mock.argsOf("profiles", "eq")).toEqual(["id", ID.user]);
  });

  it("falls back to the sign-in's email, and empty details, when there's no profile row yet", async () => {
    signInAs(sb.mock, ID.user, "from-google@example.test");
    sb.mock.onTable("profiles", { data: null });
    expect(await getCurrentUser()).toEqual({
      id: ID.user,
      email: "from-google@example.test",
      fullName: "",
      phone: null,
      isAdmin: false,
    });
  });
});

// Until a phone is saved, every signed-in page sends her back to onboarding (spec A1).
describe("needsOnboarding", () => {
  const user = { id: ID.user, email: "", fullName: "רחל", isAdmin: false };

  it("is true without a phone and false with one", () => {
    expect(needsOnboarding({ ...user, phone: null })).toBe(true);
    expect(needsOnboarding({ ...user, phone: "" })).toBe(true);
    expect(needsOnboarding({ ...user, phone: "050-123-4567" })).toBe(false);
  });
});

// Passengers land on search, admins on group management (spec §1, A1).
describe("homePathFor", () => {
  it("sends admins to group management and everyone else to search", () => {
    const user = { id: ID.user, email: "", fullName: "", phone: "050-123-4567" };
    expect(homePathFor({ ...user, isAdmin: true })).toBe("/admin/groups");
    expect(homePathFor({ ...user, isAdmin: false })).toBe("/");
  });
});

describe("requireUser", () => {
  it("sends signed-out visitors to sign-in (spec A2)", async () => {
    expect(await runAction(requireUser)).toEqual({ redirectedTo: "/login" });
  });

  it("sends a user without a phone back to onboarding", async () => {
    signInAs(sb.mock, ID.user);
    sb.mock.onTable("profiles", { data: profile({ phone: null }) });
    expect(await runAction(requireUser)).toEqual({ redirectedTo: "/login" });
  });

  it("lets a user with a completed profile through", async () => {
    signInAs(sb.mock, ID.user);
    sb.mock.onTable("profiles", { data: profile() });
    expect(await requireUser()).toMatchObject({ id: ID.user });
  });
});

describe("requireAdmin", () => {
  it("sends a regular user to search", async () => {
    signInAs(sb.mock, ID.user);
    sb.mock.onTable("profiles", { data: profile() });
    expect(await runAction(requireAdmin)).toEqual({ redirectedTo: "/" });
  });

  it("lets an admin through", async () => {
    signInAs(sb.mock, ID.user);
    sb.mock.onTable("profiles", { data: profile({ is_admin: true }) });
    expect(await requireAdmin()).toMatchObject({ isAdmin: true });
  });

  it("sends a signed-out visitor to sign-in first", async () => {
    expect(await runAction(requireAdmin)).toEqual({ redirectedTo: "/login" });
  });
});
