import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sw.js / manifest.webmanifest — PWA assets. The service worker spec
     *   rejects a registration whose script 3xx-redirects, so the auth
     *   middleware must NOT redirect /sw.js to /auth/login for signed-out
     *   visitors ("The script resource is behind a redirect" console error).
     * - robots.txt / sitemap.xml — crawler files; must resolve, not redirect.
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp, .ico
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
