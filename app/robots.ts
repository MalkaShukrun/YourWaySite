import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site/url";

// Served at /robots.txt.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
