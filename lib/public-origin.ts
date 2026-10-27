import type { NextRequest } from "next/server";

// The site's address as the browser sees it. Behind a hosting proxy (e.g.
// Render) the request URL is the internal one — https://localhost:10000 —
// while the real host arrives in x-forwarded-host or, on Render, in Host.
export function publicOrigin(request: NextRequest) {
  const first = (name: string) => request.headers.get(name)?.split(",")[0].trim();
  const host = first("x-forwarded-host") || first("host");
  if (!host) return request.nextUrl.origin;
  const proto = first("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}
