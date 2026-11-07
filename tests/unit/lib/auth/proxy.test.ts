import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The session proxy that runs before every page (lib/supabase/proxy.ts) and
// the redirect origin it uses (lib/auth/public-origin.ts).

const claims = vi.hoisted(() => ({ value: null as unknown }));
const rpc = vi.hoisted(() => vi.fn(async () => ({ error: null as { message: string } | null })));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims: async () => ({ data: claims.value }) }, rpc }),
}));
const { updateSession } = await import("@/lib/supabase/proxy");
const { publicOrigin } = await import("@/lib/auth/public-origin");

const request = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));
const locationOf = (response: Response) => response.headers.get("location");

beforeEach(() => {
  claims.value = null;
  rpc.mockClear();
  vi.stubEnv("SITE_URL", "");
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => vi.unstubAllEnvs());

// Only sign-in, the legal pages and the auth callback are open to visitors (spec A2, §3).
describe("signed-out visitors", () => {
  it.each(["/", "/my-rides", "/payments", "/dashboard", "/routes", "/routes/new", "/profile", "/admin/groups", "/ride/abc?date=2026-11-01"])(
    "are sent from %s to /login",
    async (path) => {
      const response = await updateSession(request(path));
      expect(response.status).toBe(307);
      expect(locationOf(response)).toBe("http://localhost:3000/login");
    },
  );

  it("lose the link they opened: sign-in leads home, not back to it", async () => {
    expect(locationOf(await updateSession(request("/routes?saved=1")))).toBe("http://localhost:3000/login");
  });

  it.each(["/login", "/login?error=x", "/privacy", "/terms", "/auth/callback"])("can open %s", async (path) => {
    const response = await updateSession(request(path));
    expect(locationOf(response)).toBeNull();
  });
});

describe("signed-in users", () => {
  it.each(["/", "/dashboard", "/admin/groups"])("pass through to %s", async (path) => {
    claims.value = { claims: { sub: "user" } };
    expect(locationOf(await updateSession(request(path)))).toBeNull();
  });
});

// The admin page's daily charts (0042): the first page each day records a visit.
describe("visits", () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const withCookie = (value: string) => new NextRequest(new URL("/", "http://localhost:3000"), { headers: { cookie: `yw_visit=${value}` } });

  it("records a signed-in user's first visit today, and remembers it in a cookie", async () => {
    claims.value = { claims: { sub: "user" } };
    const response = await updateSession(request("/"));
    expect(rpc).toHaveBeenCalledExactlyOnceWith("record_visit");
    expect(response.cookies.get("yw_visit")?.value).toBe(`user:${today}`);
  });

  it("doesn't record it again the same day", async () => {
    claims.value = { claims: { sub: "user" } };
    await updateSession(withCookie(`user:${today}`));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("records it for another user, or on a new day", async () => {
    claims.value = { claims: { sub: "user" } };
    await updateSession(withCookie(`other:${today}`));
    await updateSession(withCookie("user:2026-10-27"));
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("tries again on the next page when recording fails", async () => {
    claims.value = { claims: { sub: "user" } };
    rpc.mockResolvedValueOnce({ error: { message: "down" } });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await updateSession(request("/"));
    expect(response.cookies.get("yw_visit")).toBeUndefined();
    expect(locationOf(response)).toBeNull();
    error.mockRestore();
  });

  it("records nothing for signed-out visitors", async () => {
    await updateSession(request("/login"));
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("returns from Google", () => {
  // Supabase falls back to the site's root when /auth/callback isn't allowed.
  it("hands a stray ?code= to the callback", async () => {
    const response = await updateSession(request("/?code=abc"));
    expect(locationOf(response)).toBe("http://localhost:3000/auth/callback?code=abc");
  });

  it("hands a stray sign-in error to the callback", async () => {
    const response = await updateSession(request("/?error=access_denied&error_description=User%20cancelled"));
    expect(locationOf(response)).toBe("http://localhost:3000/auth/callback?error=access_denied&error_description=User%20cancelled");
  });
});

describe("publicOrigin", () => {
  it("uses SITE_URL when it's set (behind a hosting proxy)", () => {
    vi.stubEnv("SITE_URL", "https://yourway.example/some/path");
    expect(publicOrigin(request("/"))).toBe("https://yourway.example");
  });

  it("falls back to the request's own address", () => {
    expect(publicOrigin(request("/"))).toBe("http://localhost:3000");
  });

  it("never trusts the Host or X-Forwarded-Host headers", () => {
    const spoofed = new NextRequest(new URL("http://localhost:3000/"), { headers: { "x-forwarded-host": "evil.example", host: "evil.example" } });
    expect(publicOrigin(spoofed)).toBe("http://localhost:3000");
  });

  it("logs a warning in production without SITE_URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    publicOrigin(request("/"));
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
