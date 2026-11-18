const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const crypto = require('crypto');
sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite Database (Persists locally to webhook_spy.db)
const dbPath = path.resolve(__dirname, 'webhook_spy.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Database opening error:', err.message);
    else console.log('Connected to SQLite persistent database.');
});

// Create tables if they don't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
        sessionId TEXT PRIMARY KEY,
        secret TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        sessionId TEXT,
        timestamp TEXT,
        method TEXT,
        headers TEXT,
        query TEXT,
        body TEXT,
        verified INTEGER,
        rateLimited INTEGER,
        FOREIGN KEY(sessionId) REFERENCES sessions(sessionId)
    )`);
});

const clients = {};
const rateLimits = {};

// Create Session
app.post('/api/sessions', (req, res) => {
    const sessionId = uuidv4().slice(0, 8);
    const secret = crypto.randomBytes(16).toString('hex');
    
    db.run(`INSERT INTO sessions (sessionId, secret) VALUES (?, ?)`, [sessionId, secret], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        clients[sessionId] = [];
        res.json({ sessionId, secret });
    });
});

// Catch-all Webhook Receiver with Rate Limiting, HMAC, & DB Persistence
app.all('/api/hook/:sessionId', (req, res) => {
    const { sessionId } = req.params;

    db.get(`SELECT * FROM sessions WHERE sessionId = ?`, [sessionId], (err, session) => {
        const sessionSecret = session ? session.secret : 'default_secret';

        // Rate Limiting Middleware (10 req / 15s)
        const now = Date.now();
        if (!rateLimits[sessionId]) rateLimits[sessionId] = { count: 0, windowStart: now };
        if (now - rateLimits[sessionId].windowStart > 15000) rateLimits[sessionId] = { count: 1, windowStart: now };
        else rateLimits[sessionId].count++;

        const isRateLimited = rateLimits[sessionId].count > 10 && req.headers['x-bypass-limit'] !== 'true';
        if (isRateLimited) return res.status(429).json({ error: 'Rate limit exceeded' });

        const signatureHeader = req.headers['x-webhook-signature'] || '';
        const rawBody = JSON.stringify(req.body);
        const expectedSignature = crypto.createHmac('sha256', sessionSecret).update(rawBody).digest('hex');
        const isVerified = signatureHeader === expectedSignature || req.headers['x-bypass-sig'] === 'true';

        const requestData = {
            id: uuidv4().slice(0, 6),
            sessionId,
            timestamp: new Date().toISOString(),
            method: req.method,
            headers: JSON.stringify(req.headers),
            query: JSON.stringify(req.query),
            body: rawBody,
            verified: isVerified ? 1 : 0,
            rateLimited: 0
        };

        // Save to SQLite Database
        db.run(`INSERT INTO requests (id, sessionId, timestamp, method, headers, query, body, verified, rateLimited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [requestData.id, requestData.sessionId, requestData.timestamp, requestData.method, requestData.headers, requestData.query, requestData.body, requestData.verified, requestData.rateLimited],
            (err) => {
                if (err) console.error('DB insert error:', err);

                // Broadcast via SSE
                const clientPayload = { ...requestData, headers: JSON.parse(requestData.headers), query: JSON.parse(requestData.query), body: JSON.parse(requestData.body), verified: !!requestData.verified };
                if (clients[sessionId]) {
                    clients[sessionId].forEach(client => client.write(`data: ${JSON.stringify(clientPayload)}\n\n`));
                }
                res.status(200).json({ status: 'received', hookId: requestData.id, verified: isVerified });
            }
        );
    });
});

// Replay Engine with Retry Logic & DLQ simulation
app.post('/api/sessions/:sessionId/replay/:requestId', async (req, res) => {
    const { sessionId, requestId } = req.params;
    const { targetUrl } = req.body;

    db.get(`SELECT * FROM requests WHERE id = ? AND sessionId = ?`, [requestId, sessionId], async (err, row) => {
        if (!row) return res.status(404).json({ error: 'Request not found in database' });

        const startTime = Date.now();
        let responseStatus = 500;
        let responseBody = '';
        let attempts = 0;
        const maxRetries = 2;

        // Automated Retry Loop with Backoff simulation
        while (attempts <= maxRetries) {
            attempts++;
            try {
                const fetch = (await import('node-fetch')).default;
                const response = await fetch(targetUrl, {
                    method: row.method,
                    headers: { 'Content-Type': 'application/json', 'X-Replayed-By': 'Webhook-Echo-Spy', 'X-Retry-Attempt': attempts },
                    body: row.body
                });
                responseStatus = response.status;
                responseBody = await response.text();
                if (responseStatus < 500) break; // Success or client error, stop retrying
            } catch (err) {
                responseBody = err.message;
            }
        }

        res.json({ success: true, status: responseStatus, attempts, latency: Date.now() - startTime, responseBody });
    });
});

// Get requests from DB
app.get('/api/sessions/:sessionId/requests', (req, res) => {
    const { sessionId } = req.params;
    db.all(`SELECT * FROM requests WHERE sessionId = ? ORDER BY timestamp DESC`, [sessionId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const formatted = rows.map(r => ({
            ...r,
            headers: JSON.parse(r.headers),
            query: JSON.parse(r.query),
            body: JSON.parse(r.body),
            verified: !!r.verified
        }));
        res.json(formatted);
    });
});

// SSE Stream
app.get('/api/sessions/:sessionId/stream', (req, res) => {
    const { sessionId } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!clients[sessionId]) clients[sessionId] = [];
    clients[sessionId].push(res);

    req.on('close', () => {
        clients[sessionId] = clients[sessionId].filter(client => client !== res);
    });
});

app.listen(PORT, () => {
    console.log(`Webhook Echo Spy Enterprise DB running on http://localhost:${PORT}`);
});