import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseMock, signInAs } from "../helpers/supabase-mock";
import { ID } from "../helpers/fixtures";

// Google sign-in returns to /auth/callback (spec A1).

const sb = vi.hoisted(() => ({ mock: null as unknown as ReturnType<typeof createSupabaseMock> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.mock.client }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));
sb.mock = createSupabaseMock();
const { GET } = await import("@/app/auth/callback/route");

const callback = (query: string) => GET(new NextRequest(new URL(`/auth/callback${query}`, "http://localhost:3000")));
const locationOf = (response: Response) => response.headers.get("location");

beforeEach(() => {
  sb.mock.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("auth callback", () => {
  it("sends a new user (no phone yet) to onboarding on the sign-in page", async () => {
    signInAs(sb.mock, ID.user);
    sb.mock.onTable("profiles", { data: { full_name: "רחל", email: "r@example.test", phone: null, is_admin: false } });
    const response = await callback("?code=abc");
    expect(sb.mock.client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.status).toBe(307);
    expect(locationOf(response)).toBe("/login");
  });

  it("sends a returning passenger to search and an admin to group management", async () => {
    signInAs(sb.mock, ID.user);
    sb.mock.onTable("profiles", { data: { full_name: "רחל", email: "", phone: "050-123-4567", is_admin: false } });
    expect(locationOf(await callback("?code=abc"))).toBe("/");

    sb.mock.onTable("profiles", { data: { full_name: "רחל", email: "", phone: "050-123-4567", is_admin: true } });
    expect(locationOf(await callback("?code=abc"))).toBe("/admin/groups");
  });

  // A relative address, so the hosting proxy's internal origin never leaks.
  it("redirects with a relative address and ignores any 'next' parameter", async () => {
    signInAs(sb.mock, ID.user);
    sb.mock.onTable("profiles", { data: { full_name: "", email: "", phone: "050-123-4567", is_admin: false } });
    expect(locationOf(await callback("?code=abc&next=https://evil.example"))).toBe("/");
  });

  it("reports a missing code", async () => {
    expect(locationOf(await callback(""))).toBe("/login?error=missing%20code");
  });

  it("reports the reason Google or Supabase gave", async () => {
    expect(locationOf(await callback("?error=access_denied&error_description=User%20cancelled"))).toBe("/login?error=User%20cancelled");
    expect(locationOf(await callback("?error=server_error"))).toBe("/login?error=server_error");
  });

  it("reports a code that can't be exchanged", async () => {
    sb.mock.client.auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { message: "invalid grant" } });
    expect(locationOf(await callback("?code=bad"))).toBe("/login?error=invalid%20grant");
  });

  it("reports a session without a user", async () => {
    expect(locationOf(await callback("?code=abc"))).toBe("/login?error=no%20user%20after%20sign-in");
  });
});
