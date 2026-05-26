# Maverick Telemetry Hub

> An offline-first, AI-enhanced vehicle telemetry system built for a Ford Maverick — running on a Raspberry Pi 5, mounted in the factory FITS system.

![Status](https://img.shields.io/badge/status-in%20progress-amber)
![Stack](https://img.shields.io/badge/stack-Python%20%7C%20MQTT%20%7C%20React-blue)
![Hardware](https://img.shields.io/badge/hardware-Raspberry%20Pi%205%20%7C%20ELM327-teal)

---

## What this is

A full-stack edge telemetry system that reads live OBD-II data from a Ford Maverick, processes it locally on a Raspberry Pi 5, and serves a real-time React dashboard — with no cloud dependency.

An AI layer interprets OBD-II fault codes (DTCs) in plain English using the Claude API, and all trip data is logged locally to SQLite for historical analysis.

The entire system is housed in a custom Fusion 360-designed enclosure, 3D printed and mounted in the Maverick's factory FITS panel.

---

## Architecture

```
Ford Maverick OBD-II port
        |
   ELM327
        |
   Raspberry Pi 5
   ├── python-obd  (sensor polling)
   ├── Mosquitto   (MQTT broker)
   ├── SQLite      (local trip logging)
   └── Express     (WebSocket bridge)
        |
   React Dashboard (served locally)
   └── Claude API  (DTC interpretation)
```

---

## Features

- **Live telemetry dashboard** — RPM, speed, coolant temp, throttle position, and more via WebSocket stream
- **MQTT data pipeline** — sensor data published as discrete topics for modularity and extensibility
- **AI fault code interpreter** — DTCs piped through Claude API for plain-English diagnosis and likely causes
- **Local trip logging** — all sessions written to SQLite; dashboard includes historical trip view
- **Offline-first** — zero network dependency for core telemetry; AI features degrade gracefully without connectivity
- **Custom FITS enclosure** — Fusion 360-designed, 3D printed, heat-tolerant mount for the Maverick factory panel

---

## Hardware

| Component | Details |
|---|---|
| Edge computer | Raspberry Pi 5 (8GB) |
| OBD-II adapter | ELM327 Bluetooth |
| Enclosure | Custom PLA+, designed in Fusion 360 |
| Mount | Ford Maverick FITS panel |
| Display | Optional: 7" touchscreen |

---

## Tech stack

| Layer | Technology |
|---|---|
| Sensor polling | Python, python-obd |
| Message broker | MQTT (Mosquitto) |
| Backend / bridge | Node.js, Express, WebSockets |
| Frontend | React, TypeScript |
| Local storage | SQLite |
| AI integration | Claude API (claude-sonnet-4-20250514) |

---

## Project status

- [ ] ELM327 pairing and python-obd polling
- [ ] MQTT broker setup and topic schema
- [ ] WebSocket bridge (MQTT → browser)
- [ ] React dashboard — live gauges
- [ ] SQLite trip logging
- [ ] Claude API DTC interpreter
- [ ] Historical trip view
- [ ] Fusion 360 enclosure design
- [ ] Print iterations and fitment
- [ ] Final FITS panel install

---

## Why I built this

This project directly extends work I did professionally — building real-time telemetry pipelines and offline-first edge systems for Ford Motor Company field environments. I wanted to apply that same architecture to a personal vehicle project using hardware I own, producing something genuinely useful rather than a contrived demo.

---

## Photos

*(Coming as the build progresses)*

---

## License

MIT
