import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Auth flow, API, private dashboard, and per-run replay/race routes
      // carry no search value (and many redirect or are ephemeral).
      disallow: ["/api/", "/auth/", "/me", "/r/", "/competitive/race/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
