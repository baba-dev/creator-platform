/* Creators PWA: deliberately never persist authenticated HTML, private media, or API replies. */
const VERSION = "creators-pwa-v2-5";
const CORE = VERSION + "-shell";
const PUBLIC = VERSION + "-public";
const STATIC = VERSION + "-static";
const OFFLINE = "/offline.html";
const CORE_URLS = [
  OFFLINE,
  "/manifest.webmanifest",
  "/offline-drafts.js",
  "/offline-guide.html",
  "/brand/icons/pwa/creators-pwa-192x192-transparent.webp",
  "/brand/icons/pwa/creators-pwa-512x512-transparent.webp",
  "/brand/icons/pwa/creators-pwa-maskable-192x192-dark.webp",
  "/brand/icons/pwa/creators-pwa-maskable-512x512-dark.webp",
];
const PUBLIC_PATH = /^\/learn(?:\/(?!preview(?:\/|$)|start(?:\/|$))|$)/;
const MAX_PUBLIC = 18;
const MAX_STATIC = 64;
const publicRequest = (request) => {
  const url = new URL(request.url);
  return (
    request.method === "GET" &&
    url.origin === self.location.origin &&
    PUBLIC_PATH.test(url.pathname) &&
    request.mode === "navigate" &&
    !url.search &&
    !request.headers.has("authorization")
  );
};
const cacheable = (response) =>
  response.ok &&
  response.type === "basic" &&
  (response.headers.get("content-type") || "").includes("text/html") &&
  !response.headers.has("set-cookie") &&
  !(response.headers.get("cache-control") || "").includes("private") &&
  !(response.headers.get("cache-control") || "").includes("no-store");
async function trim(cache, max) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max)))
    await cache.delete(key);
}
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CORE).then((cache) => cache.addAll(CORE_URLS)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("creators-pwa-") &&
              key !== CORE &&
              key !== PUBLIC &&
              key !== STATIC,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
const SHARE_DB = "creators-pwa-incoming";
const ALLOWED_MEDIA = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);
function openInbox() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("pending"))
        request.result.createObjectStore("pending", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function receiveShare(request) {
  try {
    const form = await request.formData();
    const file = form.get("files");
    if (
      file &&
      (!(file instanceof File) ||
        file.size > 25 * 1024 * 1024 ||
        !ALLOWED_MEDIA.has(file.type))
    )
      throw new Error("Unsupported media.");
    const title = String(form.get("title") || "").slice(0, 300);
    const body = String(form.get("text") || "").slice(0, 10_000);
    const sharedUrl = String(form.get("url") || "").slice(0, 2048);
    if (!file && !title && !body && !sharedUrl)
      throw new Error("Share is empty.");
    const db = await openInbox();
    const id = crypto.randomUUID();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("pending", "readwrite");
      const store = transaction.objectStore("pending");
      const all = store.getAll();
      all.onsuccess = () => {
        const records = all.result || [];
        for (const record of records) {
          if (record.createdAt < Date.now() - 15 * 60_000)
            store.delete(record.id);
        }
        if (
          records.filter(
            (record) => record.createdAt >= Date.now() - 15 * 60_000,
          ).length >= 3
        ) {
          transaction.abort();
          return;
        }
        store.put({
          id,
          file: file || null,
          title,
          body,
          sharedUrl,
          createdAt: Date.now(),
        });
      };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(new Error("Inbox storage limit reached."));
    });
    db.close();
    return Response.redirect(
      "/pwa/inbox?import=" + encodeURIComponent(id),
      303,
    );
  } catch {
    return Response.redirect("/pwa/inbox?error=share", 303);
  }
}

self.addEventListener("fetch", (event) => {
  const incoming = new URL(event.request.url);
  if (
    incoming.origin === self.location.origin &&
    incoming.pathname === "/pwa/inbox" &&
    event.request.method === "POST"
  ) {
    event.respondWith(receiveShare(event.request));
    return;
  }
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  )
    return;
  // Only immutable Next.js build assets may enter the bounded static cache.
  if (
    url.pathname.startsWith("/_next/static/") &&
    ["script", "style", "font", "image"].includes(request.destination)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const prior = await cache.match(request);
        if (prior) return prior;
        const response = await fetch(request);
        if (
          response.ok &&
          response.type === "basic" &&
          !(response.headers.get("cache-control") || "").includes("no-store") &&
          !(response.headers.get("cache-control") || "").includes("private")
        ) {
          await cache.put(request, response.clone());
          await trim(cache, MAX_STATIC);
        }
        return response;
      })(),
    );
    return;
  }
  // Never cache or alter API calls, OAuth, workspace data, RSC, or downloads.
  if (
    url.pathname.startsWith("/api/") ||
    request.headers.has("rsc") ||
    request.headers.has("next-router-prefetch") ||
    request.destination === "video" ||
    request.destination === "audio"
  )
    return;
  // Authenticated navigations are always network-only; offline gets generic fallback.
  if (
    request.mode === "navigate" &&
    (url.pathname.startsWith("/app") ||
      url.pathname.startsWith("/admin") ||
      url.pathname.startsWith("/settings") ||
      url.pathname.startsWith("/pwa/") ||
      url.pathname.startsWith("/sign-") ||
      url.pathname.startsWith("/onboarding"))
  ) {
    event.respondWith(
      fetch(request).catch(
        async () =>
          (await caches.match(OFFLINE)) ||
          new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          }),
      ),
    );
    return;
  }
  if (url.pathname === OFFLINE || CORE_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request)),
    );
    return;
  }
  if (publicRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(
            new Request(request, { credentials: "omit" }),
          );
          if (
            cacheable(response) &&
            !response.redirected &&
            new URL(response.url).origin === self.location.origin
          ) {
            const cache = await caches.open(PUBLIC);
            await cache.put(request, response.clone());
            await trim(cache, MAX_PUBLIC);
          }
          return response;
        } catch {
          return (
            (await caches.match(request)) ||
            (await caches.match(OFFLINE)) ||
            new Response("Offline", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })(),
    );
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        async () =>
          (await caches.match(OFFLINE)) ||
          new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          }),
      ),
    );
  }
});
self.addEventListener("message", (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "GET_VERSION")
    event.source?.postMessage({ type: "PWA_VERSION", version: VERSION });
  if (event.data?.type === "CLEAR_PUBLIC_CACHE")
    event.waitUntil(caches.delete(PUBLIC));
});
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        data = event.data?.json() || {};
      } catch {
        return;
      }
      if (!["ready", "failed", "report"].includes(data.kind)) return;
      // Payloads never carry a prompt, private media URL, or any arbitrary outbound target.
      const title =
        data.kind === "ready"
          ? "Your creation is ready"
          : data.kind === "failed"
            ? "Creation needs attention"
            : "Creators update";
      const path = data.path;
      const destination =
        typeof path === "string" &&
        /^\/app\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/?$/.test(path)
          ? path
          : "/app";
      await self.registration.showNotification(title, {
        body:
          data.kind === "ready"
            ? "Open Creators to view your result."
            : data.kind === "failed"
              ? "Open Creators for details."
              : "Open Creators to see the update.",
        icon: "/brand/icons/pwa/creators-pwa-192x192-transparent.webp",
        badge: "/brand/icons/pwa/creators-pwa-192x192-transparent.webp",
        tag:
          "creators-" +
          (typeof data.id === "string" ? data.id.slice(0, 80) : data.kind),
        data: { destination },
      });
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const destination = event.notification.data?.destination || "/app";
      const url = new URL(destination, self.location.origin).href;
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = clients.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing) {
        await existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
self.addEventListener("sync", (event) => {
  if (event.tag !== "creators-draft-check") return;
  // A signal only; the app must obtain explicit consent before any billable submission.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) =>
        Promise.all(
          clients.map((client) =>
            client.postMessage({ type: "DRAFT_SYNC_AVAILABLE" }),
          ),
        ),
      ),
  );
});
self.addEventListener("periodicsync", (event) => {
  if (event.tag !== "creators-public-refresh") return;
  event.waitUntil(
    fetch("/learn", { credentials: "omit" })
      .then(async (response) => {
        if (!cacheable(response)) return;
        const cache = await caches.open(PUBLIC);
        await cache.put("/learn", response);
        await trim(cache, MAX_PUBLIC);
      })
      .catch(() => undefined),
  );
});
