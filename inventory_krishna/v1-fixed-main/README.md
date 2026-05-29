# RFID Inventory Management System

ESP32 + RFID + Vercel Serverless + Vanilla JS Dashboard

---

## Project Structure

```
projectv1/
├── api/
│   ├── _store.js          ← shared state (NOT an endpoint — _ prefix)
│   ├── _cors.js           ← CORS helpers
│   ├── inventory.js       ← GET /api/inventory, POST (update capacity)
│   ├── rfid.js            ← POST /api/rfid (ESP32 calls this)
│   ├── add-product.js     ← POST /api/add-product
│   ├── remove-product.js  ← POST /api/remove-product
│   └── logs.js            ← GET /api/logs[?id=c1]
├── public/
│   ├── index1.html        ← main dashboard
│   ├── script.js          ← frontend logic
│   └── style.css          ← styling
├── vercel.json
├── .vercelignore
└── package.json
```

---

## Deploy to Vercel

```bash
# 1. Push to GitHub
git add .
git commit -m "fix: complete rewrite"
git push

# 2. In Vercel Dashboard:
#    Settings → Deployment Protection → disable for preview (or use Production)
#    Settings → General → verify Framework Preset = "Other"

# 3. Done — visit your-project.vercel.app
```

---

## API Reference

| Method | Endpoint             | Body                                             | Description                    |
|--------|----------------------|--------------------------------------------------|--------------------------------|
| GET    | /api/inventory       | —                                                | List all containers + status   |
| POST   | /api/inventory       | `{ containerId, capacity }`                      | Update container capacity      |
| POST   | /api/add-product     | `{ containerId, productName?, quantity? }`       | Add items to container         |
| POST   | /api/remove-product  | `{ containerId, productName?, quantity? }`       | Remove items from container    |
| POST   | /api/rfid            | `{ uid, containerId?, action? }`                 | ESP32 RFID scan handler        |
| GET    | /api/logs            | —                                                | All logs (last 100)            |
| GET    | /api/logs?id=c1      | —                                                | Logs for specific container    |

---

## ESP32 Arduino Firmware

```cpp
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>

// ── Config ─────────────────────────────────────────────────────────────
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASS     = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL    = "https://YOUR-PROJECT.vercel.app/api/rfid";
const char* API_SECRET    = "";          // Set if you added API_SECRET in Vercel env vars
const char* CONTAINER_ID  = "c1";       // Which container this ESP32 manages

// ── RFID pins (adjust for your wiring) ────────────────────────────────
#define SS_PIN  5
#define RST_PIN 22
MFRC522 mfrc522(SS_PIN, RST_PIN);

void setup() {
  Serial.begin(115200);
  SPI.begin();
  mfrc522.PCD_Init();

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi connected: " + WiFi.localIP().toString());
}

void loop() {
  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial()) return;

  // Build UID string
  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(mfrc522.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  Serial.println("Tag scanned: " + uid);

  sendToServer(uid);
  mfrc522.PICC_HaltA();
  delay(1500);  // debounce
}

void sendToServer(String uid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected — skipping");
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();  // Skip cert check (fine for dev; use setCACert in production)

  HTTPClient http;
  http.begin(client, SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  if (strlen(API_SECRET) > 0) http.addHeader("x-api-key", API_SECRET);
  http.setTimeout(8000);

  String body = "{\"uid\":\"" + uid + "\",\"containerId\":\"" + String(CONTAINER_ID) + "\",\"action\":\"toggle\"}";

  int attempts = 0;
  int code = -1;
  while (attempts < 3 && code != 200) {
    code = http.POST(body);
    if (code != 200) { delay(600); attempts++; }
  }

  if (code == 200) {
    Serial.println("OK: " + http.getString());
  } else {
    Serial.println("FAILED after 3 attempts. HTTP: " + String(code));
  }
  http.end();
}
```

---

## Upgrading to Persistent Storage (Vercel KV)

The current `api/_store.js` uses `global.__rfid_store` — state persists within a warm
container instance but resets on cold starts. For production persistence:

```bash
# 1. Create a KV store in Vercel Dashboard → Storage → KV
# 2. Install the SDK
npm i @vercel/kv

# 3. Replace functions in api/_store.js:
```

```js
const { kv } = require('@vercel/kv');

async function getAll() {
  const containers = await kv.get('containers') ?? DEFAULT_CONTAINERS;
  return containers.map(c => ({ ...c, status: getStatus(c.quantity, c.capacity) }));
}
async function updateContainer(id, patch) {
  const containers = await kv.get('containers') ?? DEFAULT_CONTAINERS;
  const idx = containers.findIndex(c => c.id === id);
  if (idx === -1) return null;
  containers[idx] = { ...containers[idx], ...patch };
  await kv.set('containers', containers);
  return { ...containers[idx], status: getStatus(containers[idx].quantity, containers[idx].capacity) };
}
```

---

## Security Checklist

- [ ] Set `API_SECRET` environment variable in Vercel Dashboard
- [ ] Add the same secret to ESP32 firmware (`API_SECRET` constant)
- [ ] Use `WiFiClientSecure` with proper CA cert for production ESP32
- [ ] Set `X-Frame-Options: DENY` (already in vercel.json)
- [ ] Upgrade to Vercel KV before going to production

---

## Testing Checklist

- [ ] `GET /api/inventory` returns 200 with containers array
- [ ] `POST /api/add-product` { containerId:"c1", quantity:5 } increases qty
- [ ] `POST /api/remove-product` { containerId:"c1", quantity:2 } decreases qty
- [ ] `POST /api/remove-product` on empty container returns 400
- [ ] `GET /api/logs` returns log entries after actions
- [ ] `POST /api/rfid` { uid:"AABBCCDD", containerId:"c1" } toggles qty
- [ ] Container status shows EMPTY → LOW STOCK → OK → FULL correctly
- [ ] Capacity edit persists across actions within same warm instance
- [ ] Panel opens on card click, closes on overlay click and Escape key
- [ ] Mobile: cards stack to 1 column, panel is full-width
