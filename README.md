# PAMR — Pakistan Airport Management Record
## Full Stack: Node.js + Express + MongoDB Backend + HTML Frontend

---

## PROJECT STRUCTURE

```
PAMR/
├── server.js            ← Express API (exports the app for Vercel; listens when run directly)
├── config/db.js         ← MongoDB connection (MONGO_URI)
├── models/              ← Airport, Departure, Arrival schemas
├── utils/status.js      ← live status (replaces the old MySQL EVENT)
├── seed/seed.js         ← loads seed/data/*.json into MongoDB
├── seed/data/           ← airports / departures / arrivals (from PROJECT PAMR.sql)
├── public/              ← frontend: index.html, style.css, script.js
└── PROJECT PAMR.sql     ← original MySQL schema (kept for reference only)
```

---

## SETUP INSTRUCTIONS

### STEP 1 — Install dependencies

```bash
npm install
```

### STEP 2 — Start MongoDB

Make sure the MongoDB service is running (Windows, from an **Administrator** terminal):

```bash
net start MongoDB
```

The default connection string is `mongodb://127.0.0.1:27017/PAMR`. To use another
server (e.g. MongoDB Atlas) set the `MONGO_URI` environment variable.

### STEP 3 — Load the data

```bash
npm run seed          # upsert all airports & flights (safe to re-run)
npm run seed:reset    # wipe the collections and load fresh
```

Collections created in the `PAMR` database: `airports` (14), `departures` (202), `arrivals` (168).

### STEP 4 — Run the backend

```bash
npm start             # or: npm run dev  (auto-restart with nodemon)
```

You should see:
```
MongoDB connected - PAMR @ 127.0.0.1
╔══════════════════════════════════════╗
║   PAMR API Server - Running          ║
║   http://localhost:3000              ║
╚══════════════════════════════════════╝
```

### STEP 5 — Open the frontend

Go to http://localhost:3000 — the backend serves the frontend.

---

## DEPLOYING TO VERCEL

Vercel runs `server.js` as a serverless function and serves `public/` from its CDN.
It **cannot** reach a MongoDB running on your PC, so use a cloud database:

1. Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas).
2. In Atlas → **Database Access**, add a database user.
3. In Atlas → **Network Access**, allow `0.0.0.0/0` (Vercel has no fixed IPs).
4. Copy the connection string and add the database name, e.g.
   `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/PAMR`
5. Load the data into Atlas from your PC:
   ```powershell
   $env:MONGO_URI = "mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/PAMR"; npm run seed
   ```
6. In Vercel → Project → **Settings → Environment Variables**, add `MONGO_URI` with the
   same value (Production + Preview), then **redeploy**.

Check it with `https://<your-app>.vercel.app/api/health` — it should say `"db": "connected"`.

---

## DATA MODEL

| Collection | Key  | Fields |
|------------|------|--------|
| airports   | a_code (ICAO), cc (IATA) | airport_name, city_name, airport_type |
| departures | cs   | airl, **dc** = airport it departs from, cc = destination code, d_name = destination, times (HH:MM:SS), stat |
| arrivals   | cs   | airl, **cc** = airport it lands at, ac = origin code, a_name = origin, times (HH:MM:SS), stat |

A callsign (`cs`) is unique across both boards. `live_status` is computed on every read
from `stat` + `times` (PKT), so manual statuses are never overwritten.

---

## API ENDPOINTS

| Method | Endpoint                    | Description                        |
|--------|-----------------------------|------------------------------------|
| GET    | /api/health                 | Server + DB health check           |
| GET    | /api/airports               | All airports                       |
| GET    | /api/departures?airport=LHE | Departures for an airport          |
| GET    | /api/arrivals?airport=LHE   | Arrivals for an airport            |
| GET    | /api/stats?airport=LHE      | Flight count statistics            |
| GET    | /api/flights/:cs            | Single flight by callsign          |
| GET    | /api/airlines               | All distinct airlines              |
| POST   | /api/departures             | Add new departure                  |
| POST   | /api/arrivals               | Add new arrival                    |
| PUT    | /api/departures/:cs         | Update departure                   |
| PUT    | /api/arrivals/:cs           | Update arrival                     |
| PUT    | /api/departures/:cs/status  | Update departure status only       |
| PUT    | /api/arrivals/:cs/status    | Update arrival status only         |
| DELETE | /api/departures/:cs         | Delete departure                   |
| DELETE | /api/arrivals/:cs           | Delete arrival                     |

---

## QUERY PARAMETERS

### GET /api/departures or /api/arrivals

| Param    | Example          | Description                    |
|----------|------------------|--------------------------------|
| airport  | ?airport=LHE     | Filter by origin/dest airport  |
| status   | ?status=Delayed  | Filter by flight status        |
| airline  | ?airline=Emirates| Filter by airline name         |
| search   | ?search=EK623    | Search by callsign/dest/airline|

---

## FRONTEND FEATURES

- Airport Selector popup (all 14 PAMR airports)
- Live FIDS board — departures & arrivals with auto-refresh every 30s
- Live clock (PKT)
- DB connection status indicator (LIVE / DEMO / OFFLINE)
- Flight Search portal — filter by callsign, airline, destination, status, type
- Admin Panel:
  - Statistics bar (total dep, arr, delayed, cancelled, on-time)
  - Add new flight form (departure or arrival)
  - Inline editable departure/arrival lists with save + delete
  - Filter chips by status

---

## STATUS CODES

| Status    | Trigger                              |
|-----------|--------------------------------------|
| Scheduled | > 30 min before flight time          |
| Boarding  | Within 30 min of departure time      |
| Departed  | Past departure time                  |
| Arriving  | Within 30 min of arrival time        |
| Landed    | Past arrival time                    |
| Delayed   | Manual override — never auto-updated |
| Cancelled | Manual override — never auto-updated |
| Estimated | Manual override — never auto-updated |
