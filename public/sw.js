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
    icon: data.icon || "https://lh3.googleusercontent.com/aida-public/AB6AXuBtcK341GBxE3BwuS6tG8G3WQFf2xPNalr8BIgN6xBSdHwGiwk3CmBHtxdJJAHp_HGsJzPCH85TkWtC1CQL1j6-4MCgkGZIzskcYiP8tsAd7ByAL5mLSbQkZDRCKCP0HTiNFFK9MTeteqK-4BY_Gj3Cr26yRoYcBXl9iVaKFwYBDJKcEJjG4e8aI3VrS11xJan13zOCd4Q4J2Ml9Jle1Az5AjKt8iNgVs1hfhdeR9DqQGXJqk0L5qDX_-hzA_PGIKBjG4lt0PDLTelh",
    badge: data.badge || "https://lh3.googleusercontent.com/aida-public/AB6AXuBtcK341GBxE3BwuS6tG8G3WQFf2xPNalr8BIgN6xBSdHwGiwk3CmBHtxdJJAHp_HGsJzPCH85TkWtC1CQL1j6-4MCgkGZIzskcYiP8tsAd7ByAL5mLSbQkZDRCKCP0HTiNFFK9MTeteqK-4BY_Gj3Cr26yRoYcBXl9iVaKFwYBDJKcEJjG4e8aI3VrS11xJan13zOCd4Q4J2Ml9Jle1Az5AjKt8iNgVs1hfhdeR9DqQGXJqk0L5qDX_-hzA_PGIKBjG4lt0PDLTelh",
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
