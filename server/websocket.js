/**
 * websocket.js
 * Maverick Telemetry Hub
 *
 * Creates and manages the WebSocket server.
 * Attaches to the existing HTTP server created in index.js.
 *
 * On new client connection, immediately sends the last 50 MQTT
 * messages so the dashboard isn't blank while waiting for the
 * next poll cycle.
 */

const WebSocket = require('ws');

/**
 * @param {import('http').Server} server — the Express HTTP server
 * @param {Function} getRecentMessages   — from mqtt.js, for catch-up on connect
 */
function createWebSocketServer(server, getRecentMessages) {
    const wss = new WebSocket.Server({ server });

    // -----------------------------------------------------------------------
    // Connection lifecycle
    // -----------------------------------------------------------------------
    wss.on('connection', (socket) => {
        console.log('[ws] Client connected');

        // Send last known messages immediately so dashboard
        // has data before the next MQTT poll cycle fires
        const recent = getRecentMessages(50);
        if (recent.length > 0) {
            socket.send(JSON.stringify({
                type:     'catchup',
                messages: recent,
            }));
        }

        // Heartbeat tracking
        socket.isAlive = true;
        socket.on('pong', () => { socket.isAlive = true; });

        socket.on('message', (message) => {
            // Dashboard doesn't send commands currently —
            // log for debugging, ignore otherwise
            console.log('[ws] Received from client:', message.toString());
        });

        socket.on('close', () => {
            console.log('[ws] Client disconnected');
        });

        socket.on('error', (err) => {
            console.error('[ws] Socket error:', err.message);
        });
    });

    // -----------------------------------------------------------------------
    // Heartbeat — terminate dead connections every 30s
    // Without this, stale connections accumulate if the client
    // disappears without sending a close frame (e.g. phone screen off)
    // -----------------------------------------------------------------------
    const heartbeat = setInterval(() => {
        wss.clients.forEach((client) => {
            if (client.isAlive === false) {
                console.log('[ws] Terminating stale connection');
                return client.terminate();
            }
            client.isAlive = false;
            client.ping();
        });
    }, 30000);

    wss.on('close', () => clearInterval(heartbeat));

    // -----------------------------------------------------------------------
    // Broadcast to all connected clients
    // Called by index.js whenever an MQTT message arrives
    // -----------------------------------------------------------------------
    function broadcast(data) {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    }

    return { wss, broadcast };
}

module.exports = { createWebSocketServer };