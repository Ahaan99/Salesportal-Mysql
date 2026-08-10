// Recruweb Push Notification Service Worker
    // Located at /public/sw.js — served by Next.js at /sw.js

    self.addEventListener("install", () => {
    self.skipWaiting();
    });

    self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
    });

    self.addEventListener("push", (event) => {
    if (!event.data) return;

    let payload;
    try {
      payload = event.data.json();
    } catch {
      payload = { title: "Recruweb", message: event.data.text() };
    }

    const title   = payload.title   || "Recruweb";
    const options = {
      body:   payload.message || payload.body || "",
      icon:   "/favicon.ico",
      badge:  "/favicon.ico",
      tag:    payload.type    || "recruweb",
      data:   { url: payload.url || "/", metadata: payload.metadata || {} },
      requireInteraction: false,
      silent: false,
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
    });

    self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = event.notification.data?.url || "/";
    event.waitUntil(
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clientList) => {
          for (const client of clientList) {
            if (client.url === url && "focus" in client) {
              return client.focus();
            }
          }
          if (self.clients.openWindow) {
            return self.clients.openWindow(url);
          }
        })
    );
    });
    