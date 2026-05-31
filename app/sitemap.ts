import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

// Genuinely public, indexable pages. Competitive routes redirect to auth for
// signed-out visitors, so they stay out of the sitemap.
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/about", "/practice/classic", "/practice/learn"];
  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.7,
  }));
}
