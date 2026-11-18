const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory store: { sessionUuid: [ { id, timestamp, method, headers, query, body } ] }
const sessions = {};
// Store SSE clients per session: { sessionUuid: [res, res, ...] }
const clients = {};

// 1. Create a new inspection session
app.post('/api/sessions', (req, res) => {
    const sessionId = uuidv4().slice(0, 8);
    sessions[sessionId] = [];
    clients[sessionId] = [];
    res.json({ sessionId });
});

// 2. Catch-all webhook receiver endpoint
app.all('/api/hook/:sessionId', (req, res) => {
    const { sessionId } = req.params;

    if (!sessions[sessionId]) {
        sessions[sessionId] = [];
    }

    const requestData = {
        id: uuidv4().slice(0, 6),
        timestamp: new Date().toISOString(),
        method: req.method,
        headers: req.headers,
        query: req.query,
        body: req.body
    };

    sessions[sessionId].unshift(requestData);

    // Broadcast to connected SSE dashboard clients
    if (clients[sessionId]) {
        clients[sessionId].forEach(client => {
            client.write(`data: ${JSON.stringify(requestData)}\n\n`);
        });
    }

    res.status(200).json({ status: 'received', hookId: requestData.id });
});

// 3. Get captured requests
app.get('/api/sessions/:sessionId/requests', (req, res) => {
    const { sessionId } = req.params;
    res.json(sessions[sessionId] || []);
});

// 4. Server-Sent Events (SSE) stream for real-time dashboard updates
app.get('/api/sessions/:sessionId/stream', (req, res) => {
    const { sessionId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!clients[sessionId]) {
        clients[sessionId] = [];
    }
    clients[sessionId].push(res);

    req.on('close', () => {
        clients[sessionId] = clients[sessionId].filter(client => client !== res);
    });
});

app.listen(PORT, () => {
    console.log(`Webhook Echo Spy running on http://localhost:${PORT}`);
});