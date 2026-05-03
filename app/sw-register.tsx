"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js so the app meets the install-prompt criteria on
 * Chrome/Edge/Android and shows up as a PWA. The SW does no caching — it
 * just exists. Errors are swallowed: registration failure shouldn't break
 * the page (e.g. iOS private mode disables service workers).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // skip in dev to avoid HMR weirdness
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // private mode, blocked by policy, etc — silent failure is fine
    });
  }, []);
  return null;
}
