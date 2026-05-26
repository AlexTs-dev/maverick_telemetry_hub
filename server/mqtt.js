/**
 * mqtt.js
 * Maverick Telemetry Hub
 *
 * Handles MQTT broker connection and subscription only.
 * Does not create an HTTP server — that lives in index.js.
 *
 * Exports:
 *   mqttClient  — the connected paho mqtt client instance
 *   onMessage   — register a callback for incoming messages
 */

const mqtt = require('mqtt');

const MQTT_URL   = process.env.MQTT_URL  || 'mqtt://localhost:1883';
const MQTT_TOPIC = 'maverick/telemetry/#';

// ---------------------------------------------------------------------------
// In-memory store of recent messages
// Lets new WebSocket clients catch up on the last known state
// without querying SQLite.
// ---------------------------------------------------------------------------
const MAX_MESSAGES   = 500;
const recentMessages = [];

// Registered message callbacks — populated by index.js
const messageHandlers = [];

// ---------------------------------------------------------------------------
// MQTT client
// ---------------------------------------------------------------------------
const mqttClient = mqtt.connect(MQTT_URL, {
    clientId:     'express_bridge',
    reconnectPeriod: 2000,   // retry every 2s on disconnect
});

mqttClient.on('connect', () => {
    console.log(`[mqtt] Connected to broker at ${MQTT_URL}`);
    mqttClient.subscribe(MQTT_TOPIC, (err) => {
        if (err) console.error('[mqtt] Subscribe error:', err);
        else     console.log(`[mqtt] Subscribed to ${MQTT_TOPIC}`);
    });
});

mqttClient.on('message', (topic, payload) => {
    let parsed;
    try {
        parsed = JSON.parse(payload.toString());
    } catch {
        parsed = payload.toString();
    }

    const entry = {
        topic,
        message:    parsed,
        receivedAt: new Date().toISOString(),
    };

    // Store in ring buffer
    recentMessages.push(entry);
    if (recentMessages.length > MAX_MESSAGES) recentMessages.shift();

    // Notify all registered handlers
    messageHandlers.forEach(fn => fn(entry));
});

mqttClient.on('error', (err) => {
    console.error('[mqtt] Client error:', err);
});

mqttClient.on('disconnect', () => {
    console.warn('[mqtt] Disconnected from broker — reconnecting...');
});

// ---------------------------------------------------------------------------
// Register a callback for incoming MQTT messages
// Called by index.js to wire MQTT → WebSocket broadcast
// ---------------------------------------------------------------------------
function onMessage(fn) {
    messageHandlers.push(fn);
}

// ---------------------------------------------------------------------------
// Get recent messages for new WebSocket clients on connect
// ---------------------------------------------------------------------------
function getRecentMessages(limit = 50) {
    return recentMessages.slice(-limit);
}

module.exports = { mqttClient, onMessage, getRecentMessages };