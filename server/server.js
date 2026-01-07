const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./db');
const { v4: uuidv4 } = require('uuid'); // Add if needed, or use custom ID gen

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3500;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Serve frontend files from the parent directory (project root)
const path = require('path');
app.use(express.static(path.join(__dirname, '..')));

// WebSocket connection handling
const clients = new Map(); // userId -> socket

wss.on('connection', (ws, req) => {
    let userId = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'auth') {
            userId = data.userId;
            clients.set(userId, ws);
            console.log(`User ${userId} connected via WebSocket`);
        }
    });

    ws.on('close', () => {
        if (userId) {
            clients.delete(userId);
            console.log(`User ${userId} disconnected`);
        }
    });
});

// Helper to broadcast to specific user
function notifyUser(userId, data) {
    const ws = clients.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

// Helper to broadcast to all
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// --- API Routes ---

// Users
app.get('/api/users', (req, res) => {
    db.all("SELECT * FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Files
app.get('/api/files', (req, res) => {
    db.all("SELECT * FROM files", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/files', (req, res) => {
    const { fileId, caseName, clientName, practiceArea, currentCustodian, courtJurisdiction, assignedAdvocates, notes } = req.body;
    const id = fileId || `CT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    db.run(
        `INSERT INTO files (fileId, caseName, clientName, practiceArea, currentCustodian, courtJurisdiction, assignedAdvocates, notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ? )`,
        [id, caseName, clientName, practiceArea, currentCustodian, courtJurisdiction, assignedAdvocates, notes],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ success: true, fileId: id });
            broadcast({ type: 'file_created', fileId: id, caseName });
        }
    );
});

// Movements
app.get('/api/movements', (req, res) => {
    db.all("SELECT * FROM movements ORDER BY timestamp DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/movements', (req, res) => {
    const { movementId, fileId, fromCustodian, toCustodian, purpose, notes } = req.body;
    const id = movementId || `MOV-${Date.now()}`;

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        db.run(
            `INSERT INTO movements (movementId, fileId, fromCustodian, toCustodian, purpose, notes) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, fileId, fromCustodian, toCustodian, purpose, notes]
        );

        db.run(
            "UPDATE files SET currentCustodian = ?, updatedAt = CURRENT_TIMESTAMP WHERE fileId = ?",
            [toCustodian, fileId]
        );

        db.run("COMMIT", (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ success: true, movementId: id });

            // Notify target custodian
            notifyUser(toCustodian, {
                type: 'movement_received',
                fileId,
                movementId: id,
                message: `File ${fileId} has been transferred to you.`
            });

            broadcast({ type: 'movement_logged', fileId, toCustodian });
        });
    });
});

app.post('/api/movements/:id/acknowledge', (req, res) => {
    const { id } = req.params;
    db.run(
        "UPDATE movements SET acknowledged = 1, acknowledgedAt = CURRENT_TIMESTAMP WHERE movementId = ?",
        [id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
            broadcast({ type: 'movement_acknowledged', movementId: id });
        }
    );
});

// Deadlines
app.get('/api/deadlines', (req, res) => {
    db.all("SELECT * FROM deadlines", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/deadlines', (req, res) => {
    const { fileId, type, dueDate, description } = req.body;
    const id = `DL-${Date.now()}`;
    db.run(
        "INSERT INTO deadlines (deadlineId, fileId, type, dueDate, description) VALUES (?, ?, ?, ?, ?)",
        [id, fileId, type, dueDate, description],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ success: true, deadlineId: id });
            broadcast({ type: 'deadline_added', fileId, type, dueDate });
        }
    );
});

// Alerts
app.get('/api/alerts', (req, res) => {
    db.all("SELECT * FROM alerts ORDER BY timestamp DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/alerts', (req, res) => {
    const { type, fileId, deadlineId, targetUserId, message, severity } = req.body;
    const id = `AL-${Date.now()}`;
    db.run(
        "INSERT INTO alerts (alertId, type, fileId, deadlineId, targetUserId, message, severity) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [id, type, fileId, deadlineId, targetUserId, message, severity],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ success: true, alertId: id });
        }
    );
});

app.post('/api/alerts/read', (req, res) => {
    db.run("UPDATE alerts SET read = 1", [], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Attachments
app.get('/api/attachments/:fileId', (req, res) => {
    const { fileId } = req.params;
    db.all("SELECT * FROM attachments WHERE fileId = ?", [fileId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/attachments', (req, res) => {
    const { fileId, name, size, type, data, uploadedBy } = req.body;
    const id = `ATT-${Date.now()}`;
    db.run(
        "INSERT INTO attachments (attachmentId, fileId, name, size, type, data, uploadedBy) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [id, fileId, name, size, type, data, uploadedBy],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ success: true, attachmentId: id });
        }
    );
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
