// Service worker: makes the game installable and playable offline.
// main.js registers it as sw.js?v=<CONFIG.version>, so every version bump installs a fresh
// worker that re-downloads all files and deletes the old cache.
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `latent-archipelago-${VERSION}`;
const FILES = [
  "./", "./index.html", "./main.js", "./content.js", "./puzzles.js", "./world.js", "./speech.js",
  "./vendor/three.webgpu.min.js", "./vendor/BloomNode.js",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png", "./icons/favicon-32.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // "no-cache" revalidates with the server (cheap 304s for files the page just downloaded),
    // so a new version never stores stale files and the first visit doesn't download twice.
    await cache.addAll(FILES.map((f) => new Request(f, { cache: "no-cache" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("latent-archipelago-") && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Google Fonts: serve from cache, refresh in the background.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })());
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Game files: cache first (they are versioned by the cache name), network as fallback.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && url.pathname.includes("/quest/")) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === "navigate") return (await cache.match("./index.html")) || Response.error();
      throw err;
    }
  })());
});
