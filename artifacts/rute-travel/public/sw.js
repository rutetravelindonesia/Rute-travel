const ICON_URL = self.registration.scope + "logo.png";
const BADGE_URL = self.registration.scope + "badge.png";

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "RUTE", body: event.data.text() };
  }

  const title = payload.title ?? "RUTE";
  const options = {
    body: payload.body ?? "",
    icon: ICON_URL,
    badge: BADGE_URL,
    tag: payload.tag ?? "rute-notif",
    data: { url: payload.url ?? self.registration.scope },
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? self.registration.scope;
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.registration.scope) && "focus" in client) {
            client.focus();
            if ("navigate" in client) client.navigate(url);
            return;
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      }),
  );
});
