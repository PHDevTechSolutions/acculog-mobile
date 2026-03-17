/**
 * service-worker.js
 *
 * Strategy:
 *  - Static assets  → Cache First  (serve from cache, update in background)
 *  - API calls      → Network First (try network, fall back to cache for GETs)
 *  - POST /AddLog   → Queue in Background Sync when offline
 *
 * Background Sync tag: "sync-activity-logs"
 * The actual sync logic lives in useOfflineSync.ts on the client.
 * The service worker just signals the app to run its sync when online.
 */

const CACHE_NAME    = "acculog-cache-v3";
const SYNC_TAG      = "sync-activity-logs";

// Static shell to cache on install
const STATIC_ASSETS = [
  "/",
  "/activity-planner",
  "/Login",
  "/manifest.json",
  "/fluxx.png",
  "/fluxx-512.png",
];

// API routes that support GET caching (only GETs are cached)
const CACHEABLE_API_PATTERNS = [
  /\/api\/ModuleSales\/Activity\/FetchLog/,
  /\/api\/ModuleSales\/Activity\/LastStatus/,
  /\/api\/ModuleSales\/Activity\/LoginSummary/,
  /\/api\/ModuleSales\/Activity\/SiteVisitCountToday/,
  /\/api\/users/,
  /\/api\/user/,
];

// ── Install ──────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET for API — let them pass through or fail (queuing is done client-side)
  if (request.method !== "GET") {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: "You are offline. This action will sync when connection is restored." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    return;
  }

  // API GET routes — Network First with cache fallback
  const isApiRoute = CACHEABLE_API_PATTERNS.some((p) => p.test(url.pathname));
  if (isApiRoute) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // Static assets — Cache First
  event.respondWith(cacheFirstWithNetwork(request));
});

// ── Background Sync ───────────────────────────────────────────────────────────

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    // Notify all open clients to run their sync queue
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((client) =>
    client.postMessage({ type: "SW_SYNC_TRIGGER" })
  );
}

// ── Strategies ────────────────────────────────────────────────────────────────

/**
 * Network First: try network, save to cache, fall back to cache on failure.
 * Used for API GET responses so offline users see their last fetched data.
 */
async function networkFirstWithCache(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Only cache successful responses
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: "Offline — cached data unavailable for this request." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Cache First: serve from cache immediately, fall back to network.
 * Used for static assets — fast load times.
 */
async function cacheFirstWithNetwork(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // For navigation requests, serve the app shell
    if (request.mode === "navigate") {
      const shell = await cache.match("/");
      if (shell) return shell;
    }
    return new Response("Offline", { status: 503 });
  }
}