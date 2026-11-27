// Service worker for Uka: viser varsler (Web Push) og åpner appen på riktig sted når man trykker på dem.
// Den mellomlagrer ingenting – appen hentes alltid fersk fra nettet.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(self.registration.showNotification(d.title || "Uka", {
    body: d.body || "",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    icon: "/icon-192.png?v=pion",
    badge: "/badge-96.png",
    lang: "nb",
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin);
  const vis = url.searchParams.get("vis");
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (win) {
      if (vis) win.postMessage({ t: "vis", vis });
      return win.focus();
    }
    return self.clients.openWindow(url.href);
  })());
});
