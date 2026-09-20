/* The service worker provides installability, never caches private application data. */
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", event => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => new Response("<!doctype html><html lang=\"it\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Synapse — Senza connessione</title><body style=\"margin:0;padding:12vh 8vw;background:#171918;color:#e8ebe7;font-family:system-ui\"><h1>La connessione è interrotta.</h1><p>Riconnettiti al server per accedere alle tue conoscenze.</p><p>Synapse non conserva le note su questo dispositivo per l’uso senza connessione.</p><a href=\"/\" style=\"color:#b9e6bf\">Riprova</a></body></html>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })));
  }
});
