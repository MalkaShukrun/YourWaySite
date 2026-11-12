// The site's public address, for absolute links: the sitemap, robots.txt and
// canonical URLs. Production sets SITE_URL (see .env.example) to the one
// canonical domain; local dev falls back to localhost.
export const SITE_ORIGIN = new URL(process.env.SITE_URL || "http://localhost:3000").origin;

// The pages search engines should index: the ones open to signed-out visitors
// (lib/supabase/proxy.ts). /login is the landing page — "/" redirects there.
export const PUBLIC_PAGES = ["/login", "/privacy", "/terms"];
