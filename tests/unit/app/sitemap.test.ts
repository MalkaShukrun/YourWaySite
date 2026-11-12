import { afterEach, describe, expect, it, vi } from "vitest";

// /sitemap.xml and /robots.txt (app/sitemap.ts, app/robots.ts): absolute
// links on SITE_URL's domain, listing only the pages open to visitors.

async function load(siteUrl: string) {
  vi.resetModules();
  vi.stubEnv("SITE_URL", siteUrl);
  const { default: sitemap } = await import("@/app/sitemap");
  const { default: robots } = await import("@/app/robots");
  return { sitemap: sitemap(), robots: robots() };
}

afterEach(() => vi.unstubAllEnvs());

describe("sitemap", () => {
  it("lists the public pages as full URLs on the canonical domain", async () => {
    const { sitemap } = await load("https://yourway.example.co.il/");
    expect(sitemap.map((entry) => entry.url)).toEqual([
      "https://yourway.example.co.il/login",
      "https://yourway.example.co.il/privacy",
      "https://yourway.example.co.il/terms",
    ]);
  });

  it("falls back to localhost when SITE_URL is unset", async () => {
    const { sitemap } = await load("");
    expect(sitemap[0].url).toBe("http://localhost:3000/login");
  });
});

describe("robots", () => {
  it("allows crawling and points to the sitemap", async () => {
    const { robots } = await load("https://yourway.example.co.il");
    expect(robots).toEqual({
      rules: { userAgent: "*", allow: "/" },
      sitemap: "https://yourway.example.co.il/sitemap.xml",
    });
  });
});
