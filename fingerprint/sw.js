// Fingerprint app: a service worker only so the app can be installed; it caches nothing (updates never stick).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
