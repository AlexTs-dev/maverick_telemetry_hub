# Maverick Telemetry Hub

> An offline-first, AI-enhanced vehicle telemetry system built for a 2026 Ford Maverick Hybrid — running on a Raspberry Pi 5, mounted in the cab.

![Status](https://img.shields.io/badge/status-in%20progress-yellow)
![Stack](https://img.shields.io/badge/stack-Python%20%7C%20MQTT%20%7C%20Node.js%20%7C%20React-blue)
![Hardware](https://img.shields.io/badge/hardware-Raspberry%20Pi%205%20%7C%20OBDLink%20EX-teal)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What this is

A full-stack edge telemetry system that reads live OBD-II data from a 2026 Ford Maverick Hybrid, processes it locally on a Raspberry Pi 5, and persists every trip to a local SQLite database — with no cloud dependency.

After each drive, a React dashboard served over local WiFi provides post-trip analysis: speed and RPM traces, hybrid efficiency metrics (EV ratio, regen energy recovered, battery SOC), and fuel economy. An AI layer interprets any OBD-II fault codes (DTCs) in plain English using the Claude API.

The system powers on automatically with the ignition via a hardwired 12V buck converter and requires no interaction to begin logging.

---

## Architecture

```
2026 Maverick Hybrid (OBD-II)
        |
   OBDLink EX (USB)
        |
   Raspberry Pi 5
   ├── obd_poller.py     polls sensors at 1Hz, publishes to MQTT
   ├── trip_manager.py   detects ignition on/off, manages trip lifecycle
   ├── db_writer.py      subscribes to MQTT, writes all data to SQLite
   └── server/
       └── index.js      Express + WebSocket bridge, serves React dashboard
              |
        React Dashboard (client/)
        └── Claude API   DTC fault code interpretation
```

### Process isolation

Each Python process has a single responsibility and communicates only via MQTT. The Express bridge is the only process that reads SQLite. `db_writer.py` is the only process that writes to it. If any process crashes, systemd restarts it independently without affecting the others.

---

## Features

- **Automatic trip detection** — opens a trip on ignition on, closes after 5 minutes of zero RPM or OBD disconnect. Accounts for Maverick Hybrid EV stops at red lights.
- **1Hz sensor logging** — RPM, speed, coolant temp, throttle position, fuel rate, and hybrid-specific PIDs (battery SOC, EV mode, regen power) written to SQLite every second.
- **Post-trip dashboard** — React UI served over local WiFi. Trip history, sensor traces, hybrid efficiency stats. Designed for parked review, not driving distraction.
- **AI fault code interpreter** — DTCs piped through Claude API for plain-English diagnosis. Results cached in SQLite — API called once per code, never twice.
- **Offline-first** — core telemetry runs with zero network dependency. AI features degrade gracefully without connectivity.
- **Live WebSocket stream** — real-time MQTT data forwarded to any connected browser client.

---

## Hardware

| Component | Details |
|---|---|
| Edge computer | Raspberry Pi 5 (4GB) |
| Storage (v1) | Samsung Pro Endurance 64GB SD card |
| OBD-II adapter | OBDLink EX (USB) |
| Display | Hosyond 5" IPS Capacitive Touchscreen, 800×480, MIPI DSI |
| Power | 12V buck converter → USB-C, switched with ignition |
| Enclosure (v1) | TBD — PETG, designed in Fusion 360 |

### Planned v2 hardware
- Raspberry Pi M.2 HAT+
- WD SN740 M.2 2230 NVMe 256GB
- Argon NEO 5 M.2 aluminum enclosure (passive cooling)
- Mounted in Ford Maverick FITS panel

---

## Tech stack

| Layer | Technology |
|---|---|
| Sensor polling | Python, python-obd |
| Message broker | MQTT (Mosquitto) |
| Trip management | Python state machine |
| Database | SQLite (WAL mode) |
| Backend / bridge | Node.js, Express, WebSockets, better-sqlite3 |
| Frontend | React, TypeScript |
| AI integration | Claude API (claude-sonnet-4-20250514) |

---

## Repository structure

```
maverick-telemetry/
├── db/
│   └── migrate.py              SQLite schema + versioned migrations
├── obd_poller.py               OBD-II sensor polling process
├── trip_manager.py             Trip lifecycle state machine
├── db_writer.py                MQTT subscriber → SQLite writer
├── server/
│   ├── index.js                Express entry point
│   ├── mqtt.js                 MQTT client and subscription
│   ├── websocket.js            WebSocket server and broadcast
│   ├── db.js                   SQLite connection (read-only)
│   └── routes/
│       ├── trips.js            Trip list, detail, readings endpoints
│       └── dtcs.js             Fault code endpoints + Claude diagnosis
├── client/                     React dashboard (Vite)
├── deploy/
│   ├── obd_poller.service      systemd service
│   ├── trip_manager.service    systemd service
│   ├── db_writer.service       systemd service
│   ├── express_bridge.service  systemd service
│   └── README.md               Deployment instructions
└── README.md
```

---

## API reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/trips` | All trips, most recent first, with summary stats |
| GET | `/api/trips/:id` | Single trip with summary |
| GET | `/api/trips/:id/readings` | All sensor readings for a trip |
| GET | `/api/trips/:id/dtcs` | Fault codes for a trip |
| GET | `/api/dtcs` | All fault codes across all trips |
| POST | `/api/dtcs/:id/diagnose` | Fetch Claude API diagnosis for a DTC |
| GET | `/api/health` | Server health + MQTT connection status |

---

## Database schema

Four tables. `trip_summaries` is computed once on trip close and stored — never recalculated at query time.

```
trips           one row per ignition cycle
readings        raw 1Hz sensor stream, foreign key → trips
dtcs            fault code events, foreign key → trips
trip_summaries  aggregated stats, 1:1 with trips
```

---

## MQTT topic map

| Topic | Publisher | Description |
|---|---|---|
| `maverick/telemetry/reading` | obd_poller | Raw sensor reading, 1Hz |
| `maverick/telemetry/poller_status` | obd_poller | OBD connection state |
| `maverick/telemetry/trip_open` | trip_manager | Trip started |
| `maverick/telemetry/trip_close` | trip_manager | Trip ended |
| `maverick/telemetry/dtc` | obd_poller | Fault code detected |

---

## Boot order

Services start in this order via systemd dependencies:

```
mosquitto → db_writer → trip_manager → obd_poller
                     → express_bridge
```

Each service restarts automatically after 5 seconds on failure.

---

## Project status

- [x] SQLite schema and migration script
- [x] `obd_poller.py` — sensor polling with reconnect backoff
- [x] `trip_manager.py` — ignition detection state machine
- [x] `db_writer.py` — MQTT → SQLite with retry logic
- [x] systemd service files for all four processes
- [x] Express bridge — REST API + WebSocket server
- [ ] React dashboard — trip list, sensor charts, hybrid stats
- [ ] Claude API DTC interpreter — wired, needs API key
- [ ] Hybrid PID discovery — research Ford FHEV PIDs on Maverick Truck Club
- [ ] Fusion 360 enclosure design (v2)
- [ ] M.2 HAT+ storage migration (v2)
- [ ] FITS panel install (v2)

---

## Setup

See [deploy/README.md](deploy/README.md) for full installation instructions.

**Quick start:**
```bash
# 1. Install system dependencies
sudo apt update && sudo apt install -y mosquitto mosquitto-clients
sudo usermod -a -G dialout pi  # USB access for OBDLink EX

# 2. Python environment
python3 -m venv venv && source venv/bin/activate
pip install obd paho-mqtt

# 3. Initialize database
python db/migrate.py

# 4. Node environment
cd server && npm install

# 5. Create environment file
echo "ANTHROPIC_API_KEY=your_key_here" > server/.env

# 6. Install and start services
sudo cp deploy/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now db_writer trip_manager obd_poller express_bridge
```

---

## Why I built this

This project directly extends work I did professionally — building real-time telemetry pipelines and offline-first edge systems for Ford Motor Company field environments. I wanted to apply that same architecture to a personal vehicle, using hardware I own, producing something genuinely useful rather than a contrived demo.

The 2026 Maverick Hybrid presented an interesting challenge: standard OBD-II PIDs cover engine vitals, but hybrid-specific data (battery SOC, EV mode, regen) lives behind Ford proprietary PIDs that required independent research to surface. That gap between the standard spec and what's actually accessible on the CAN bus is the same problem I worked on professionally.

---

## Photos

*(Coming as the build progresses)*

---

## License

MIT
