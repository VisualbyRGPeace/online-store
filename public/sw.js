/* Service worker chỉ để hiện thông báo hệ điều hành và đưa bạn quay lại đúng tab công việc khi bấm vào. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || "/";
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const target = list.find((client) => client.url.includes(path)) || list[0];
      if (target) {
        await target.focus();
        return;
      }
      await self.clients.openWindow(path);
    })(),
  );
});
