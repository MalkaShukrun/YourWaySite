import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseMock } from "@/tests/supabase-mock";
import { getCurrentUser } from "@/lib/auth";
import { GET } from "@/app/auth/callback/route";

const sb = createSupabaseMock();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.client }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUser: vi.fn(),
}));

const user = { id: "u1", email: "a@example.com", fullName: "א", phone: "050-123-4567", isAdmin: false };

async function callback(query: string) {
  const response = await GET(new NextRequest(`https://yourway.test/auth/callback${query}`));
  return { status: response.status, location: response.headers.get("location") };
}

beforeEach(() => {
  sb.reset();
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /auth/callback", () => {
  it("exchanges the code and sends the user home", async () => {
    expect(await callback("?code=abc")).toEqual({ status: 307, location: "https://yourway.test/" });
    expect(sb.client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it("sends admins to group management", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...user, isAdmin: true });
    expect((await callback("?code=abc")).location).toBe("https://yourway.test/admin/groups");
  });

  it("sends new users to onboarding", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...user, phone: null });
    expect((await callback("?code=abc")).location).toBe("https://yourway.test/login");
  });

  it("reports a failed code exchange", async () => {
    sb.client.auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { message: "invalid grant" } });
    expect((await callback("?code=abc")).location).toBe("https://yourway.test/login?error=invalid%20grant");
  });

  it("reports a missing user after sign-in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await callback("?code=abc")).location).toBe("https://yourway.test/login?error=no%20user%20after%20sign-in");
  });

  it("passes the provider's error description through", async () => {
    expect((await callback("?error=access_denied&error_description=User%20cancelled")).location).toBe(
      "https://yourway.test/login?error=User%20cancelled",
    );
    expect(sb.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("falls back to the error code, then to 'missing code'", async () => {
    expect((await callback("?error=access_denied")).location).toBe("https://yourway.test/login?error=access_denied");
    expect((await callback("")).location).toBe("https://yourway.test/login?error=missing%20code");
  });
});
