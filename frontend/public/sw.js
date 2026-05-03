const CACHE_NAME = "qulte-shell-v2";
const OFFLINE_URL = "/offline";
const SHELL_ASSETS = [OFFLINE_URL, "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(event.request);
          return cachedPage || caches.match(OFFLINE_URL);
        }),
    );
    return;
  }

  const isStaticAsset =
    requestUrl.pathname.startsWith("/_next/") ||
    /\.(?:css|js|png|jpg|jpeg|gif|webp|svg|ico|woff2?)$/i.test(requestUrl.pathname);

  if (!isStaticAsset) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    }),
  );
});

self.addEventListener("push", (event) => {
  const payload = (() => {
    if (!event.data) {
      return {};
    }

    try {
      return event.data.json();
    } catch {
      return {};
    }
  })();

  const title = payload.title || "Qulte";
  const route = payload.route || "/messages";
  const options = {
    body: payload.body || "Tu as recu un nouveau message",
    icon: payload.icon || "/icon.svg",
    badge: payload.badge || "/icon.svg",
    tag: payload.tag || route,
    data: {
      route,
      conversationId: payload.conversationId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const route = event.notification.data?.route || "/";
  const targetUrl = new URL(route, self.location.origin).toString();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          return client.focus().then(() => {
            if ("navigate" in client) {
              return client.navigate(targetUrl);
            }
            return undefined;
          });
        }
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});
