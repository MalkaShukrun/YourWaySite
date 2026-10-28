import type { NextRequest } from "next/server";

// The site's address as the browser sees it, for redirects. Behind a hosting
// proxy (e.g. Render) the request URL is the internal one —
// https://localhost:10000 — so production sets SITE_URL to the real address.
// Host and X-Forwarded-Host are never used: any client can send any value.
export function publicOrigin(request: NextRequest) {
  const site = process.env.SITE_URL;
  if (site) return new URL(site).origin;
  if (process.env.NODE_ENV === "production") {
    console.error("publicOrigin: SITE_URL is not set; redirecting to the request's own address");
  }
  return request.nextUrl.origin;
}
