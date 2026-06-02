# Sterling Halberg CRM

A production-ready, SPACIOUS, drag-and-drop sales pipeline and meeting scheduler CRM with integrated **Web Browser Push Notifications** and **WhatsApp Reminders**.

---

## Key Features

1. **Sales Kanban Board**: Drag-and-drop leads across outreach, interest, scheduling, proposing, and closing stages.
2. **Dynamic Search**: Global search with typeahead suggestions dropdown. Filter metrics and cards in real time.
3. **PWA Capability**: Standalone mobile display support (Progressive Web App). Accessible on iOS/Android home screens.
4. **Push Reminders**: Native background push notifications sent exactly **30 minutes prior to scheduled meetings** (works when browser/tab is closed).
5. **WhatsApp Integration**: Dispatches automated alerts 30 minutes before meetings directly to your WhatsApp via the open-source **OpenWA Gateway**.
6. **Integration Control Panel**: Visually subscribe to notifications and test web push and WhatsApp configurations directly in the app.

---

## Local Setup

### 1. Run the CRM Application
```bash
npm install
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Run the WhatsApp Gateway (OpenWA)
```bash
git clone https://github.com/rmyndharis/OpenWA.git
cd OpenWA
docker compose -f docker-compose.dev.yml up -d
```
Access the dashboard at [http://localhost:2886](http://localhost:2886) and scan the QR code with your WhatsApp app.

---

## Production Deployment Notes

### 1. Persistent Storage
All data is stored inside the `data/` directory:
- `data/clients.json` — Client profiles and schedules.
- `data/settings.json` — WhatsApp configuration parameters.
- `data/subscriptions.json` — Web push subscriptions coordinates.
- `data/vapid.json` — Security keys for Web Push.
- `data/notified.json` — Log of sent notifications.

> [!IMPORTANT]
> When deploying to platforms with ephemeral filesystems (e.g. Heroku, Vercel, render.com free tier), you **must mount a persistent volume** to `/data` or database files will reset on server restart.

### 2. Environment Variables
- `PORT`: The port the HTTP server binds to (defaults to `3000`).

### 3. VAPID Keys Persistence
VAPID keys are auto-generated on first start if `data/vapid.json` is missing. Ensure the `/data` folder is writable so they persist, otherwise existing browser subscriptions will fail to authenticate after a restart.
