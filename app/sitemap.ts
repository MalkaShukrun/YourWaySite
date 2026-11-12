import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_ORIGIN } from "@/lib/site/url";

// Served at /sitemap.xml. No lastmod: nothing records when a page last
// changed, and a guessed date is worse than none.
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({ url: `${SITE_ORIGIN}${path}` }));
}
