// Minimal service worker — exists only to satisfy the "Add to Home Screen"
// installability heuristic on Chrome/Edge/Android. No offline caching in v1.
// The product needs the network for leaderboards anyway; offline-shell would
// be premature.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass-through fetch handler. Required for installability on some browsers
// even when we don't intercept anything.
self.addEventListener("fetch", () => {});
