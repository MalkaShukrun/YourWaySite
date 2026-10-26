import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { updateSession } from "@/lib/supabase/proxy";

const getClaims = vi.fn();
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn(() => ({ auth: { getClaims } })) }));

function request(path: string) {
  return new NextRequest(`https://yourway.test${path}`);
}

function signedIn(yes: boolean) {
  getClaims.mockResolvedValue({ data: yes ? { claims: { sub: "u1" } } : null });
}

beforeEach(() => vi.clearAllMocks());

describe("updateSession", () => {
  it("lets signed-in users through", async () => {
    signedIn(true);
    const response = await updateSession(request("/my-rides"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("sends signed-out visitors to /login and drops the query", async () => {
    signedIn(false);
    const response = await updateSession(request("/routes?saved=1"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://yourway.test/login");
  });

  it.each(["/login", "/auth/callback", "/privacy"])("keeps %s public", async (path) => {
    signedIn(false);
    expect((await updateSession(request(path))).headers.get("location")).toBeNull();
  });

  it("forwards a stray OAuth code to the callback", async () => {
    const response = await updateSession(request("/?code=abc"));
    expect(response.headers.get("location")).toBe("https://yourway.test/auth/callback?code=abc");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("forwards a stray OAuth error to the callback", async () => {
    const response = await updateSession(request("/?error_description=denied"));
    expect(response.headers.get("location")).toBe("https://yourway.test/auth/callback?error_description=denied");
  });

  it("doesn't loop when the code is already on the callback", async () => {
    signedIn(false);
    expect((await updateSession(request("/auth/callback?code=abc"))).headers.get("location")).toBeNull();
  });

  it("writes refreshed session cookies to the response", async () => {
    vi.mocked(createServerClient).mockImplementationOnce((_url, _key, options) => {
      const auth = {
        getClaims: async () => {
          options.cookies.setAll!([{ name: "sb-token", value: "fresh", options: {} }], {});
          return { data: { claims: { sub: "u1" } } };
        },
      };
      return { auth } as unknown as ReturnType<typeof createServerClient>;
    });

    const response = await updateSession(request("/"));
    expect(response.cookies.get("sb-token")?.value).toBe("fresh");
  });
});
