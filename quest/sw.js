// Service worker: makes the game installable and playable offline.
//
// Strategy: NETWORK FIRST for the game's own files. Online, every file comes from the server
// (normal HTTP caching applies), and the copy in the cache is refreshed. Offline, the cached
// copy is used. This way a new version is never hidden behind an old cache.
//
// The browser re-checks this file on every visit and installs it again whenever its bytes
// change; bump SW_BUILD with each release to be sure.
const SW_BUILD = "1.3.4";
const CACHE = "latent-archipelago-v2";
const FILES = [
  "./", "./index.html", "./main.js", "./content.js", "./puzzles.js", "./world.js", "./speech.js",
  "./vendor/three.webgpu.min.js", "./vendor/BloomNode.js",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png", "./icons/favicon-32.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Revalidate with the server so the offline copy matches what is live now.
    await cache.addAll(FILES.map((f) => new Request(f, { cache: "no-cache" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // Remove caches from older service workers (including the version-named ones).
    for (const key of await caches.keys()) if (key.startsWith("latent-archipelago") && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => { if (e.data === "build") e.source?.postMessage({ build: SW_BUILD }); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== self.location.origin && !isFont) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, isFont ? undefined : { cache: "no-cache" });
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") return (await cache.match("./index.html")) || Response.error();
      throw err;
    }
  })());
});
