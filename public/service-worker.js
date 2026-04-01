// service-worker.js

const CACHE_NAME        = "acculog-cache-v4";
const OSM_CACHE_NAME    = "acculog-osm-tiles-v1";
const SYNC_TAG          = "sync-activity-logs";

const STATIC_ASSETS = [
  "/",
  "/activity-planner",
  "/Login",
  "/manifest.json",
  "/fluxx.png",
  "/fluxx-512.png",
  // face-api models
  "/models/tiny_face_detector/model.json",
  "/models/face_landmark68/model.json",
];

const CACHEABLE_API_PATTERNS = [
  /\/api\/ModuleSales\/Activity\/FetchLog/,
  /\/api\/ModuleSales\/Activity\/LastStatus/,
  /\/api\/ModuleSales\/Activity\/LoginSummary/,
  /\/api\/ModuleSales\/Activity\/SiteVisitCountToday/,
  /\/api\/users/,
  /\/api\/user/,
];

// OSM tile hosts
const OSM_HOSTS = [
  "tile.openstreetmap.org",
  "a.tile.openstreetmap.org",
  "b.tile.openstreetmap.org",
  "c.tile.openstreetmap.org",
];

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== OSM_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // OSM tiles — Cache First with long expiry
  if (OSM_HOSTS.includes(url.hostname)) {
    event.respondWith(osmTileStrategy(request));
    return;
  }

  // Non-GET API — pass through, return offline error if fails
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
  if (CACHEABLE_API_PATTERNS.some((p) => p.test(url.pathname))) {
    event.respondWith(networkFirstWithCache(request, CACHE_NAME));
    return;
  }

  // face-api model files — Cache First (large binary files)
  if (url.pathname.startsWith("/models/")) {
    event.respondWith(cacheFirstWithNetwork(request, CACHE_NAME));
    return;
  }

  // Static assets — Cache First
  event.respondWith(cacheFirstWithNetwork(request, CACHE_NAME));
});

// ── Background Sync ───────────────────────────────────────────────────────────

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
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
 * OSM Tile strategy:
 * - Serve from cache immediately if available (tiles rarely change)
 * - Fetch and cache in background
 * - Max 500 tiles cached, evict oldest when over limit
 */
async function osmTileStrategy(request) {
  const cache = await caches.open(OSM_CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      // Enforce cache size limit — evict if over 500 tiles
      const keys = await cache.keys();
      if (keys.length >= 500) {
        // Delete oldest 50 tiles
        for (let i = 0; i < 50; i++) {
          await cache.delete(keys[i]);
        }
      }
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return a transparent 1x1 PNG tile placeholder when offline
    return new Response(
      // Minimal valid PNG (1x1 transparent)
      new Uint8Array([
        0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00,0x00,0x0d,
        0x49,0x48,0x44,0x52,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,
        0x08,0x06,0x00,0x00,0x00,0x1f,0x15,0xc4,0x89,0x00,0x00,0x00,
        0x0a,0x49,0x44,0x41,0x54,0x78,0x9c,0x62,0x00,0x01,0x00,0x00,
        0x05,0x00,0x01,0x0d,0x0a,0x2d,0xb4,0x00,0x00,0x00,0x00,0x49,
        0x45,0x4e,0x44,0xae,0x42,0x60,0x82
      ]).buffer,
      { headers: { "Content-Type": "image/png" } }
    );
  }
}

async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: "Offline — cached data unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function cacheFirstWithNetwork(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    if (request.mode === "navigate") {
      const shell = await cache.match("/");
      if (shell) return shell;
    }
    return new Response("Offline", { status: 503 });
  }
}