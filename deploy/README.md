# Deployment — Raspberry Pi 5

## Prerequisites

### 1. Install Mosquitto
```bash
sudo apt update
sudo apt install -y mosquitto mosquitto-clients
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
```

### 2. Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Set up Python virtual environment
```bash
cd /home/pi/maverick-telemetry-hub
python3 -m venv venv
source venv/bin/activate
pip install obd paho-mqtt
```

### 4. Initialize the database
```bash
source venv/bin/activate
python db/migrate.py
```

### 5. Install Node dependencies and build the client
```bash
cd server && npm install && cd ..
cd client && npm install && npm run build && cd ..
```

### 6. Create the environment file
```bash
echo "ANTHROPIC_API_KEY=your_key_here" > server/.env
```

### 7. Grant USB access for OBDLink EX
The poller runs as the `pi` user, not root. Add pi to the dialout
group so it can access /dev/ttyUSB0 without sudo:
```bash
sudo usermod -a -G dialout pi
# Log out and back in for the group change to take effect
```

Confirm the OBDLink EX is visible after plugging in:
```bash
ls /dev/ttyUSB*
# Should show /dev/ttyUSB0
```

---

## Installing the services

Copy all service files to systemd and enable them:

```bash
sudo cp deploy/db_writer.service       /etc/systemd/system/
sudo cp deploy/trip_manager.service    /etc/systemd/system/
sudo cp deploy/obd_poller.service      /etc/systemd/system/
sudo cp deploy/express_bridge.service  /etc/systemd/system/
sudo cp deploy/kiosk.service           /etc/systemd/system/

sudo systemctl daemon-reload

sudo systemctl enable db_writer trip_manager obd_poller express_bridge kiosk
sudo systemctl start  db_writer trip_manager obd_poller express_bridge kiosk
```

---

## Checking service status

```bash
sudo systemctl status db_writer
sudo systemctl status trip_manager
sudo systemctl status obd_poller
sudo systemctl status express_bridge
sudo systemctl status kiosk
```

## Live logs

Each service logs to journald. Follow logs in real time:

```bash
journalctl -u db_writer      -f
journalctl -u trip_manager   -f
journalctl -u obd_poller     -f
journalctl -u express_bridge -f
journalctl -u kiosk          -f
```

Follow all at once:
```bash
journalctl -u db_writer -u trip_manager -u obd_poller -u express_bridge -f
```

---

## Boot order

Services start in this order automatically via systemd dependencies:

```
mosquitto → db_writer → trip_manager → obd_poller
                     → express_bridge → kiosk
```

If any service fails, systemd restarts it after 5 seconds.

---

## Updating

After pulling new code:

```bash
git pull

# Rebuild the client if frontend files changed
cd client && npm run build && cd ..

sudo systemctl restart express_bridge
```

If Python dependencies changed: `pip install -r requirements.txt`
If service files changed: re-copy and run `sudo systemctl daemon-reload`

---

## Stopping everything

```bash
sudo systemctl stop obd_poller trip_manager db_writer express_bridge kiosk
```

## Disabling on boot

```bash
sudo systemctl disable obd_poller trip_manager db_writer express_bridge kiosk
```

---

## Troubleshooting

**OBDLink EX not found at /dev/ttyUSB0**
- Unplug and replug the adapter
- Run `dmesg | tail -20` to see USB enumeration events
- Confirm pi is in the dialout group: `groups pi`

**MQTT connection refused**
- Check Mosquitto is running: `sudo systemctl status mosquitto`
- Test manually: `mosquitto_sub -t 'maverick/#' -v`

**Readings not appearing in database**
- Check db_writer logs: `journalctl -u db_writer -f`
- Confirm database exists: `ls -lh /home/pi/maverick_telemetry.db`
- Check WAL files aren't corrupted: `sqlite3 /home/pi/maverick_telemetry.db "PRAGMA integrity_check;"`

**Trip has no summary stats (all dashes)**
- If the Pi lost power mid-trip, db_writer will recover the trip automatically on next boot
- Check logs for "Recovered unclosed trip": `journalctl -u db_writer -b | grep Recovered`

**Dashboard not loading**
- Check express_bridge is running: `sudo systemctl status express_bridge`
- Confirm the client was built: `ls client/dist/index.html`
- Check server logs: `journalctl -u express_bridge -f`
