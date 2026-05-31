// Canonical site origin, shared by metadataBase, robots, and sitemap.
// VERCEL_URL is the ephemeral per-deployment hostname and must not be the
// canonical; VERCEL_PROJECT_PRODUCTION_URL is the stable production domain.
// NEXT_PUBLIC_SITE_URL overrides everything when set explicitly.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:2301");
