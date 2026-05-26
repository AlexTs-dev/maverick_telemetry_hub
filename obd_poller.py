"""
obd_poller.py
Maverick Telemetry Hub

Connects to the OBDLink EX via USB, polls sensor PIDs at 1Hz,
and publishes readings to the local Mosquitto MQTT broker.

This process knows nothing about SQLite. It only reads from the
car and publishes to MQTT. db_writer.py handles persistence.

Managed by systemd — see deploy/obd_poller.service
"""

import obd
import paho.mqtt.client as mqtt
import json
import time
import logging
import sys
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MQTT_HOST       = "localhost"
MQTT_PORT       = 1883
MQTT_TOPIC_BASE = "maverick/telemetry"

# USB device path for OBDLink EX on Raspberry Pi.
# Run `ls /dev/ttyUSB*` to confirm — usually ttyUSB0.
OBD_PORT        = "/dev/ttyUSB0"
OBD_BAUDRATE    = 38400
POLL_INTERVAL   = 1.0  # seconds

# Reconnect backoff — doubles each attempt up to MAX_BACKOFF
INITIAL_BACKOFF = 2    # seconds
MAX_BACKOFF     = 60   # seconds

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger("obd_poller")

# ---------------------------------------------------------------------------
# PID definitions
# ---------------------------------------------------------------------------
# Each entry: (obd.commands key, output field name, unit conversion fn)
# Hybrid-specific PIDs (battery_soc, ev_mode, regen) may return None
# on non-hybrid vehicles or if Ford locks the PID. Handled gracefully.

def _to_rpm(v):    return round(v.magnitude, 1) if v else None
def _to_mph(v):    return round(v.to("mph").magnitude, 1) if v else None
def _to_f(v):      return round(v.to("degF").magnitude, 1) if v else None
def _to_pct(v):    return round(v.magnitude, 1) if v else None
def _to_gph(v):    return round(v.magnitude, 3) if v else None
def _passthrough(v): return v.magnitude if v else None

STANDARD_PIDS = [
    (obd.commands.RPM,              "rpm",            _to_rpm),
    (obd.commands.SPEED,            "speed_mph",      _to_mph),
    (obd.commands.COOLANT_TEMP,     "coolant_temp_f", _to_f),
    (obd.commands.THROTTLE_POS,     "throttle_pct",   _to_pct),
    (obd.commands.FUEL_RATE,        "fuel_rate_gph",  _to_gph),
]

# Hybrid PIDs — Ford proprietary, may not be available.
# These use raw mode 22 PIDs. Update hex addresses once confirmed
# on the Maverick Truck Club forums for the 2026 FHEV.
# Leaving as None placeholders until PIDs are confirmed.
HYBRID_PIDS = [
    # (obd.commands.xxx, "battery_soc_pct", _to_pct),
    # (obd.commands.xxx, "ev_mode",         _passthrough),
    # (obd.commands.xxx, "regen_kw",        _passthrough),
]

ALL_PIDS = STANDARD_PIDS + HYBRID_PIDS

# ---------------------------------------------------------------------------
# MQTT helpers
# ---------------------------------------------------------------------------

def build_mqtt_client() -> mqtt.Client:
    client = mqtt.Client(client_id="obd_poller")

    def on_connect(client, userdata, flags, rc):
        if rc == 0:
            log.info("MQTT connected")
        else:
            log.error(f"MQTT connection failed — rc={rc}")

    def on_disconnect(client, userdata, rc):
        if rc != 0:
            log.warning(f"MQTT unexpected disconnect — rc={rc}")

    client.on_connect    = on_connect
    client.on_disconnect = on_disconnect
    return client


def publish_reading(client: mqtt.Client, payload: dict) -> None:
    topic = f"{MQTT_TOPIC_BASE}/reading"
    client.publish(topic, json.dumps(payload), qos=1)


def publish_status(client: mqtt.Client, status: str, detail: str = "") -> None:
    topic = f"{MQTT_TOPIC_BASE}/poller_status"
    payload = {
        "status": status,
        "detail": detail,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    client.publish(topic, json.dumps(payload), qos=1)

# ---------------------------------------------------------------------------
# OBD connection with retry/backoff
# ---------------------------------------------------------------------------

def connect_obd(backoff: float) -> obd.OBD:
    """
    Attempt to connect to the OBDLink EX. On failure, waits `backoff`
    seconds and raises so the caller can double the backoff and retry.
    """
    log.info(f"Connecting to OBD on {OBD_PORT}...")
    connection = obd.OBD(
        portstr=OBD_PORT,
        baudrate=OBD_BAUDRATE,
        fast=False,       # required for Ford vehicles
        timeout=30,
    )
    if not connection.is_connected():
        raise ConnectionError(f"OBD connection failed — is OBDLink EX plugged in?")
    log.info("OBD connected")
    return connection


def poll_once(connection: obd.OBD) -> dict:
    """
    Poll all configured PIDs. Returns a dict of field: value pairs.
    Missing or errored PIDs produce None values — never raises.
    """
    reading = {"ts": datetime.now(timezone.utc).isoformat()}
    for command, field, converter in ALL_PIDS:
        try:
            response = connection.query(command)
            reading[field] = converter(response.value) if not response.is_null() else None
        except Exception as e:
            log.debug(f"PID error ({field}): {e}")
            reading[field] = None
    return reading

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def run() -> None:
    # Connect to MQTT first — if this fails we can't do anything useful
    mqtt_client = build_mqtt_client()
    try:
        mqtt_client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    except Exception as e:
        log.critical(f"Cannot connect to MQTT broker: {e}")
        sys.exit(1)

    mqtt_client.loop_start()

    backoff = INITIAL_BACKOFF
    connection = None

    while True:
        # --- Ensure OBD connection ---
        if connection is None or not connection.is_connected():
            publish_status(mqtt_client, "connecting")
            try:
                connection = connect_obd(backoff)
                backoff = INITIAL_BACKOFF  # reset on success
                publish_status(mqtt_client, "connected")
            except Exception as e:
                log.warning(f"OBD connect failed: {e} — retrying in {backoff}s")
                publish_status(mqtt_client, "disconnected", str(e))
                time.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF)
                continue

        # --- Poll and publish ---
        try:
            reading = poll_once(connection)
            publish_reading(mqtt_client, reading)
            log.debug(f"Published: {reading}")
        except Exception as e:
            log.warning(f"Poll error: {e} — marking disconnected")
            connection = None  # triggers reconnect on next iteration

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    log.info("obd_poller starting")
    try:
        run()
    except KeyboardInterrupt:
        log.info("Stopped by user")
