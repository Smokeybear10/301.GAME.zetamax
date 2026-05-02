import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents: opt-in. Disabled for v0 — without explicit "use cache"
  // annotations everywhere, dev mode HMR loops constantly on Fast Refresh.
  // Re-enable when we have time to annotate cache boundaries properly.
  cacheComponents: false,
};

export default nextConfig;
