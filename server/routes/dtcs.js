const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ---------------------------------------------------------------------------
// GET /api/dtcs
// All fault codes across all trips, most recent first.
// Joins trip data so the dashboard can show when the code occurred.
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
    try {
        const dtcs = db.prepare(`
            SELECT
                d.id,
                d.trip_id,
                d.code,
                d.first_seen_at,
                d.claude_diagnosis,
                d.diagnosed_at,
                t.started_at AS trip_started_at
            FROM dtcs d
            JOIN trips t ON t.id = d.trip_id
            ORDER BY d.first_seen_at DESC
        `).all();

        res.json(dtcs);
    } catch (error) {
        console.error('GET /dtcs error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/dtcs/:id/diagnose
// Calls Claude API to interpret a fault code in plain English.
// Returns cached result if already diagnosed — never calls API twice
// for the same code.
// ---------------------------------------------------------------------------
router.post('/:id/diagnose', async (req, res) => {
    try {
        // Fetch the DTC record
        const dtc = db.prepare(`
            SELECT d.*, t.started_at AS trip_started_at
            FROM dtcs d
            JOIN trips t ON t.id = d.trip_id
            WHERE d.id = ?
        `).get(req.params.id);

        if (!dtc) {
            return res.status(404).json({ error: 'DTC not found' });
        }

        // Return cached diagnosis if already fetched
        if (dtc.claude_diagnosis) {
            return res.json({
                code:             dtc.code,
                diagnosis:        dtc.claude_diagnosis,
                diagnosed_at:     dtc.diagnosed_at,
                cached:           true,
            });
        }

        // ---------------------------------------------------------------------------
        // TODO: Wire up Claude API here
        //
        // const response = await fetch('https://api.anthropic.com/v1/messages', {
        //     method: 'POST',
        //     headers: {
        //         'Content-Type':         'application/json',
        //         'x-api-key':            process.env.ANTHROPIC_API_KEY,
        //         'anthropic-version':    '2023-06-01',
        //     },
        //     body: JSON.stringify({
        //         model:      'claude-sonnet-4-20250514',
        //         max_tokens: 1000,
        //         messages: [{
        //             role:    'user',
        //             content: `You are a vehicle diagnostic assistant.
        //                       Explain OBD-II fault code ${dtc.code} in plain English.
        //                       Include: what it means, likely causes, and urgency level.
        //                       Vehicle: 2026 Ford Maverick Hybrid.
        //                       Be concise — this will be read on a small touchscreen.`
        //         }]
        //     }),
        // });
        // const data     = await response.json();
        // const diagnosis = data.content[0].text;
        // ---------------------------------------------------------------------------

        // Placeholder until Claude API is wired up
        const diagnosis = `Diagnosis for ${dtc.code} not yet implemented.`;

        // Write result back to database
        const now = new Date().toISOString();
        db.prepare(`
            UPDATE dtcs
            SET claude_diagnosis = ?, diagnosed_at = ?
            WHERE id = ?
        `).run(diagnosis, now, dtc.id);

        res.json({
            code:         dtc.code,
            diagnosis,
            diagnosed_at: now,
            cached:       false,
        });

    } catch (error) {
        console.error(`POST /dtcs/${req.params.id}/diagnose error:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;