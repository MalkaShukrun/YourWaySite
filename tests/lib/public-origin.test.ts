import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { publicOrigin } from "@/lib/public-origin";

const internal = (headers: Record<string, string> = {}) => new NextRequest("https://localhost:10000/auth/callback", { headers });

describe("publicOrigin", () => {
  it("uses the request URL without a proxy", () => {
    expect(publicOrigin(internal())).toBe("https://localhost:10000");
  });

  it("uses the forwarded host and protocol behind a proxy", () => {
    expect(publicOrigin(internal({ "x-forwarded-host": "yourway.co.il", "x-forwarded-proto": "https" }))).toBe("https://yourway.co.il");
  });

  it("falls back to the Host header (Render)", () => {
    expect(publicOrigin(internal({ host: "yourway.onrender.com", "x-forwarded-proto": "https" }))).toBe("https://yourway.onrender.com");
  });

  it("takes the first value of a forwarded list and keeps the request's protocol", () => {
    expect(publicOrigin(internal({ "x-forwarded-host": "yourway.co.il, proxy.internal" }))).toBe("https://yourway.co.il");
  });
});
