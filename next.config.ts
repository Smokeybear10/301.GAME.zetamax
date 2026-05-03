import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents: opt-in. Disabled for v0 — without explicit "use cache"
  // annotations everywhere, dev mode HMR loops constantly on Fast Refresh.
  // Re-enable when we have time to annotate cache boundaries properly.
  cacheComponents: false,

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
