// sw.js
// -----------------------------------------------------------------------------
// Caches the app shell (HTML/CSS/JS/icons) so FitTrack can still open with no
// signal. Network-first: online users always get the freshest deployed code;
// the cache is only a fallback when a fetch actually fails (offline).
//
// Cross-origin requests (Firestore, Google Fonts) are deliberately left
// untouched — intercepting Firestore's own networking here would fight with
// its SDK-managed connections instead of helping.
// -----------------------------------------------------------------------------

const CACHE_NAME = "fittrack-shell-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/dashboard.js",
  "./js/clients.js",
  "./js/workouts.js",
  "./js/firebase.js",
  "./js/auth.js",
  "./js/login.js",
  "./js/toast.js",
  "./manifest.webmanifest",
  "./assets/favicon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
