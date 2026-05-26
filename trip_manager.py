"""
trip_manager.py
Maverick Telemetry Hub

Watches the MQTT telemetry stream and manages trip lifecycle.
Opens a trip when RPM rises above zero, closes it when RPM stays
at zero for 5 minutes OR the OBD poller reports disconnected.

Publishes trip open/close events to MQTT.
db_writer.py handles all SQLite writes — this process never
touches the database directly.

Trip detection logic accounts for the Maverick Hybrid's tendency
to shut the combustion engine off at idle (EV mode), which causes
RPM to read zero at red lights without ending the trip.

Managed by systemd — see deploy/trip_manager.service
"""

import paho.mqtt.client as mqtt
import json
import time
import logging
import sys
from datetime import datetime, timezone
from enum import Enum, auto

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MQTT_HOST       = "localhost"
MQTT_PORT       = 1883
MQTT_TOPIC_BASE = "maverick/telemetry"

# How long RPM must stay at zero before closing the trip.
# 5 minutes handles hybrid EV stops at red lights.
ZERO_RPM_TIMEOUT = 5 * 60  # seconds

# RPM threshold — anything above this is considered engine running.
# Small buffer above zero to avoid noise in the reading.
RPM_RUNNING_THRESHOLD = 10

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("trip_manager")

# ---------------------------------------------------------------------------
# Trip state machine
# ---------------------------------------------------------------------------

class TripState(Enum):
    IDLE      = auto()  # no active trip, waiting for ignition
    ACTIVE    = auto()  # trip open, engine running or hybrid EV idle
    SUSPECTING = auto() # RPM has been zero — watching the timeout


class TripManager:
    """
    State machine that tracks trip lifecycle based on RPM and
    poller connection status messages from MQTT.
    """

    def __init__(self, mqtt_client: mqtt.Client):
        self.client        = mqtt_client
        self.state         = TripState.IDLE
        self.trip_start_ts = None       # ISO 8601 when trip opened
        self.zero_rpm_since = None      # monotonic time when RPM first hit zero

    # -----------------------------------------------------------------------
    # State transitions
    # -----------------------------------------------------------------------

    def _open_trip(self, ts: str) -> None:
        self.state         = TripState.ACTIVE
        self.trip_start_ts = ts
        self.zero_rpm_since = None
        log.info(f"Trip opened at {ts}")
        self._publish_trip_event("trip_open", {"started_at": ts})

    def _close_trip(self, ts: str, reason: str) -> None:
        log.info(f"Trip closed at {ts} — reason: {reason}")
        self._publish_trip_event("trip_close", {
            "started_at": self.trip_start_ts,
            "ended_at":   ts,
            "reason":     reason,
        })
        self.state          = TripState.IDLE
        self.trip_start_ts  = None
        self.zero_rpm_since = None

    # -----------------------------------------------------------------------
    # Event handlers
    # -----------------------------------------------------------------------

    def on_reading(self, payload: dict) -> None:
        """
        Called for every telemetry reading from obd_poller.
        Core of the trip detection logic.
        """
        ts  = payload.get("ts", datetime.now(timezone.utc).isoformat())
        rpm = payload.get("rpm")

        # Can't make decisions without RPM data
        if rpm is None:
            return

        engine_running = rpm > RPM_RUNNING_THRESHOLD
        now = time.monotonic()

        if self.state == TripState.IDLE:
            if engine_running:
                self._open_trip(ts)

        elif self.state == TripState.ACTIVE:
            if not engine_running:
                # Engine off — start watching the timeout
                self.state          = TripState.SUSPECTING
                self.zero_rpm_since = now
                log.debug(f"RPM at zero — watching {ZERO_RPM_TIMEOUT}s timeout")

        elif self.state == TripState.SUSPECTING:
            if engine_running:
                # Engine came back — hybrid EV stop, not end of trip
                self.state          = TripState.ACTIVE
                self.zero_rpm_since = None
                log.debug("RPM recovered — remaining in active trip")
            else:
                elapsed = now - self.zero_rpm_since
                if elapsed >= ZERO_RPM_TIMEOUT:
                    self._close_trip(ts, reason="zero_rpm_timeout")

    def on_poller_status(self, payload: dict) -> None:
        """
        Called when obd_poller reports its connection status.
        A disconnected poller mid-trip closes the trip immediately.
        """
        status = payload.get("status")
        if status == "disconnected" and self.state in (
            TripState.ACTIVE, TripState.SUSPECTING
        ):
            ts = payload.get("ts", datetime.now(timezone.utc).isoformat())
            self._close_trip(ts, reason="poller_disconnected")

    # -----------------------------------------------------------------------
    # MQTT publishing
    # -----------------------------------------------------------------------

    def _publish_trip_event(self, event: str, data: dict) -> None:
        topic   = f"{MQTT_TOPIC_BASE}/{event}"
        payload = json.dumps(data)
        self.client.publish(topic, payload, qos=1)
        log.debug(f"Published {event}: {payload}")

# ---------------------------------------------------------------------------
# MQTT setup
# ---------------------------------------------------------------------------

def build_mqtt_client(manager_ref: list) -> mqtt.Client:
    """
    manager_ref is a one-element list so the callbacks can reference
    the TripManager after it's constructed (avoids circular init).
    """
    client = mqtt.Client(client_id="trip_manager")

    def on_connect(client, userdata, flags, rc):
        if rc == 0:
            log.info("MQTT connected — subscribing to topics")
            client.subscribe(f"{MQTT_TOPIC_BASE}/reading",       qos=1)
            client.subscribe(f"{MQTT_TOPIC_BASE}/poller_status", qos=1)
        else:
            log.error(f"MQTT connection failed — rc={rc}")

    def on_message(client, userdata, msg):
        manager = manager_ref[0]
        if manager is None:
            return
        try:
            payload = json.loads(msg.payload.decode())
        except json.JSONDecodeError as e:
            log.warning(f"Bad JSON on {msg.topic}: {e}")
            return

        if msg.topic.endswith("/reading"):
            manager.on_reading(payload)
        elif msg.topic.endswith("/poller_status"):
            manager.on_poller_status(payload)

    def on_disconnect(client, userdata, rc):
        if rc != 0:
            log.warning(f"MQTT unexpected disconnect — rc={rc}")

    client.on_connect    = on_connect
    client.on_message    = on_message
    client.on_disconnect = on_disconnect
    return client

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run() -> None:
    manager_ref = [None]  # populated after both objects exist

    mqtt_client = build_mqtt_client(manager_ref)

    try:
        mqtt_client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    except Exception as e:
        log.critical(f"Cannot connect to MQTT broker: {e}")
        sys.exit(1)

    manager        = TripManager(mqtt_client)
    manager_ref[0] = manager  # wire up the reference

    log.info("trip_manager running — waiting for ignition")
    mqtt_client.loop_start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Stopped by user")
    finally:
        mqtt_client.loop_stop()
        mqtt_client.disconnect()


if __name__ == "__main__":
    log.info("trip_manager starting")
    run()
