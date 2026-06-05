self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: "Meeting Reminder", body: event.data.text() };
    }
  }

  const title = data.title || "Upcoming Meeting Reminder";
  const options = {
    body: data.body || "You have a meeting scheduled soon.",
    icon: data.icon || "/logo.jpg",
    badge: data.badge || "/favicon.jpg",
    data: data.data || {},
    vibrate: [200, 100, 200],
    tag: data.tag || "meeting-reminder",
    requireInteraction: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const clientId = event.notification.data ? event.notification.data.clientId : null;
  const targetUrl = clientId ? `/#profile?id=${clientId}` : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Find if there is an existing tab open
      for (const client of windowClients) {
        const url = new URL(client.url);
        // Match base URL
        if (url.origin === self.location.origin) {
          // Navigate to correct route and focus
          return client.navigate(targetUrl).then((c) => c.focus());
        }
      }
      // If no tab is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
