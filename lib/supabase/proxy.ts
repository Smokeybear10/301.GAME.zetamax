import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip proxy check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // Public routes that don't require auth.
  // - `/` is the landing menu
  // - `/about` is the about page
  // - `/practice` is the local-only drill — no auth needed
  // - `/login`, `/auth/*` are the auth flow itself
  // - `/api/*` route handlers do their own auth check and return JSON 401s.
  //   Redirecting them to /auth/login would break client fetches.
  // - any `*/opengraph-image` or `*/twitter-image` route — these are fetched
  //   by Discord/iMessage/Slack bots without auth.
  // /competitive (and /me, /r) is INTENTIONALLY NOT in this list — they require sign-in.
  const path = request.nextUrl.pathname;
  const isOgRoute =
    path.endsWith("/opengraph-image") ||
    path.endsWith("/twitter-image") ||
    /\/(opengraph-image|twitter-image)\.[a-z0-9]+$/.test(path);
  const isPublicRoute =
    path === "/" ||
    path === "/about" ||
    path.startsWith("/practice") ||
    path.startsWith("/design") ||
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/api") ||
    isOgRoute;

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
