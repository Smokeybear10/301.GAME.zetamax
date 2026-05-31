import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents: opt-in. Disabled for v0 — without explicit "use cache"
  // annotations everywhere, dev mode HMR loops constantly on Fast Refresh.
  // Re-enable when we have time to annotate cache boundaries properly.
  cacheComponents: false,

  // Hoist the Supabase SDK into a single shared chunk instead of letting
  // Turbopack copy ~69KB gzip of auth-js/realtime-js into each competitive
  // route family's bundle.
  experimental: {
    optimizePackageImports: ["@supabase/supabase-js", "@supabase/ssr"],
  },

  // Security response headers on every route. No script-src CSP yet — Next's
  // inline runtime needs per-request nonces for that, which is a bigger change;
  // frame-ancestors 'none' still gives clickjacking protection here.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },

  // Static design mockups under public/design/ — let bare /design hit the index.
  async rewrites() {
    return [
      { source: "/design", destination: "/design/index.html" },
      { source: "/design/", destination: "/design/index.html" },
    ];
  },

  // /practice/stats moved into /me as a tab. Permanent redirect for any
  // bookmarks or shared links lingering from the old route.
  async redirects() {
    return [
      { source: "/practice/stats", destination: "/me", permanent: true },
    ];
  },
};

export default nextConfig;
