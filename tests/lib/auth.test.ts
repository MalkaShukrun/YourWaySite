import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/tests/supabase-mock";
import { runAction } from "@/tests/redirect";
import { getCurrentUser, homePathFor, needsOnboarding, requireAdmin, requireUser } from "@/lib/auth";

const sb = createSupabaseMock();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.client }));

function signIn(profile: Record<string, unknown> | null, claims: Record<string, unknown> = { sub: "user-1", email: "g@example.com" }) {
  sb.client.auth.getClaims.mockResolvedValue({ data: { claims } });
  sb.onTable("profiles", { data: profile });
}

const fullProfile = { full_name: "מלכה כהן", email: "m@example.com", phone: "050-123-4567", is_admin: false };

beforeEach(() => sb.reset());

describe("getCurrentUser", () => {
  it("returns null when signed out", async () => {
    sb.client.auth.getClaims.mockResolvedValue({ data: null });
    expect(await getCurrentUser()).toBeNull();
    expect(sb.client.from).not.toHaveBeenCalled();
  });

  it("combines the session with the profile", async () => {
    signIn(fullProfile);
    expect(await getCurrentUser()).toEqual({
      id: "user-1",
      email: "m@example.com",
      fullName: "מלכה כהן",
      phone: "050-123-4567",
      isAdmin: false,
    });
    expect(sb.callsOn("profiles")).toEqual([
      ["select", ["full_name, email, phone, is_admin"]],
      ["eq", ["id", "user-1"]],
      ["single", []],
    ]);
  });

  it("falls back to the Google email and defaults when there is no profile row", async () => {
    signIn(null);
    expect(await getCurrentUser()).toEqual({ id: "user-1", email: "g@example.com", fullName: "", phone: null, isAdmin: false });
  });
});

describe("needsOnboarding / homePathFor", () => {
  const user = { id: "1", email: "", fullName: "", phone: "050", isAdmin: false };

  it("needs onboarding until a phone is set", () => {
    expect(needsOnboarding({ ...user, phone: null })).toBe(true);
    expect(needsOnboarding(user)).toBe(false);
  });

  it("sends admins to group management and everyone else home", () => {
    expect(homePathFor({ ...user, isAdmin: true })).toBe("/admin/groups");
    expect(homePathFor(user)).toBe("/");
  });
});

describe("requireUser", () => {
  it("returns a fully onboarded user", async () => {
    signIn(fullProfile);
    expect(await requireUser()).toMatchObject({ id: "user-1" });
  });

  it("redirects signed-out visitors to /login", async () => {
    sb.client.auth.getClaims.mockResolvedValue({ data: null });
    expect(await runAction(() => requireUser())).toEqual({ redirectedTo: "/login" });
  });

  it("redirects users without a phone to /login for onboarding", async () => {
    signIn({ ...fullProfile, phone: null });
    expect(await runAction(() => requireUser())).toEqual({ redirectedTo: "/login" });
  });
});

describe("requireAdmin", () => {
  it("lets admins through", async () => {
    signIn({ ...fullProfile, is_admin: true });
    expect(await requireAdmin()).toMatchObject({ isAdmin: true });
  });

  it("sends regular users home", async () => {
    signIn(fullProfile);
    expect(await runAction(() => requireAdmin())).toEqual({ redirectedTo: "/" });
  });
});
