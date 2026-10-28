import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { publicOrigin } from "@/lib/public-origin";

const internal = (headers: Record<string, string> = {}) => new NextRequest("https://localhost:10000/auth/callback", { headers });

afterEach(() => vi.unstubAllEnvs());

describe("publicOrigin", () => {
  it("uses SITE_URL when set, without its path", () => {
    vi.stubEnv("SITE_URL", "https://yourway.onrender.com/some/path");
    expect(publicOrigin(internal())).toBe("https://yourway.onrender.com");
  });

  it("uses the request URL without SITE_URL (local dev)", () => {
    vi.stubEnv("SITE_URL", "");
    expect(publicOrigin(internal())).toBe("https://localhost:10000");
  });

  it.each([
    ["X-Forwarded-Host", { "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" }],
    ["Host", { host: "evil.example" }],
  ])("ignores a spoofed %s header", (_name, headers) => {
    vi.stubEnv("SITE_URL", "https://yourway.onrender.com");
    expect(publicOrigin(internal(headers))).toBe("https://yourway.onrender.com");
    vi.stubEnv("SITE_URL", "");
    expect(publicOrigin(internal(headers))).toBe("https://localhost:10000");
  });
});
