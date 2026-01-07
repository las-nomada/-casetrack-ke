const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');

const JWT_SECRET = process.env.JWT_SECRET || 'casetrack-ke-secure-secret-2026';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3500;

app.use(cors());
app.use(cookieParser());
app.use(bodyParser.json({ limit: '50mb' }));

// --- Lockdown & Page Routing ---
const path = require('path');

// Allow login page and its background to be public
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'login.html')));
app.get('/login-bg.png', (req, res) => res.sendFile(path.join(__dirname, '..', 'login-bg.png')));

// Protect the main app route
app.get('/', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.redirect('/login');

    jwt.verify(token, JWT_SECRET, (err) => {
        if (err) return res.redirect('/login');
        res.sendFile(path.join(__dirname, '..', 'index.html'));
    });
});

// Serve other static files
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

// --- Authentication Middleware ---
const authenticateToken = (req, res, next) => {
    // Skip auth for login route
    if (req.path === '/api/auth/login') return next();

    // Only protect /api routes
    if (!req.path.startsWith('/api/')) return next();

    // Skip auth for 2FA verify during login (uses temp token)
    if (req.path === '/api/auth/2fa/login') return next();

    const authHeader = req.headers['authorization'];
    const tokenFromHeader = authHeader && authHeader.split(' ')[1];
    const tokenFromCookie = req.cookies ? req.cookies.token : null;

    const token = tokenFromHeader || tokenFromCookie;

    if (!token) return res.status(401).json({ error: 'Access denied. Please log in.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Session expired or invalid. Please log in again.' });
        req.user = user;
        next();
    });
};

app.use(authenticateToken);

// --- API Routes ---

// Auth Login
app.post('/api/auth/login', (req, res) => {
    const { userId, password } = req.body;

    if (!userId || !password) {
        return res.status(400).json({ error: 'User ID and password are required' });
    }

    db.get("SELECT * FROM users WHERE userId = ? AND active = 1", [userId], (err, user) => {
        if (err) return res.status(500).json({ error: 'Internal server error' });
        if (!user) return res.status(401).json({ error: 'User not found or inactive' });

        // Check password
        const passwordMatch = bcrypt.compareSync(password, user.passwordHash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        // If 2FA is enabled, return a pending state
        if (user.twoFactorEnabled) {
            const tempToken = jwt.sign(
                { userId: user.userId, pending2FA: true },
                JWT_SECRET,
                { expiresIn: '5m' }
            );
            return res.json({
                success: true,
                requires2FA: true,
                tempToken
            });
        }

        // Generate final token
        const token = jwt.sign(
            { userId: user.userId, role: user.role, name: user.name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Set cookie for browser-side lockdown
        res.cookie('token', token, {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000,
            sameSite: 'Strict'
        });

        res.json({
            success: true,
            token,
            user: {
                userId: user.userId,
                name: user.name,
                role: user.role,
                email: user.email,
                department: user.department
            }
        });
    });
});

// 2FA Login Verification
app.post('/api/auth/2fa/login', (req, res) => {
    const { tempToken, code } = req.body;

    if (!tempToken || !code) {
        return res.status(400).json({ error: 'Token and code are required' });
    }

    try {
        const decoded = jwt.verify(tempToken, JWT_SECRET);
        if (!decoded.pending2FA) throw new Error('Invalid token type');

        db.get("SELECT * FROM users WHERE userId = ?", [decoded.userId], (err, user) => {
            if (err || !user) return res.status(401).json({ error: 'User not found' });

            const isValid = authenticator.check(code, user.twoFactorSecret);
            if (!isValid) {
                return res.status(401).json({ error: 'Invalid 2FA code' });
            }

            // Generate final token
            const token = jwt.sign(
                { userId: user.userId, role: user.role, name: user.name },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.cookie('token', token, {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000,
                sameSite: 'Strict'
            });

            res.json({
                success: true,
                token,
                user: {
                    userId: user.userId,
                    name: user.name,
                    role: user.role,
                    email: user.email,
                    department: user.department
                }
            });
        });
    } catch (err) {
        return res.status(401).json({ error: 'Session expired or invalid' });
    }
});

// 2FA Setup
app.post('/api/auth/2fa/setup', (req, res) => {
    // This route is protected by authenticateToken - req.user exists
    const userId = req.user.userId;

    db.get("SELECT * FROM users WHERE userId = ?", [userId], async (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });

        const secret = authenticator.generateSecret();
        const otpauth = authenticator.keyuri(user.email || user.userId, 'CaseTrack KE', secret);

        try {
            const qrCodeUrl = await qrcode.toDataURL(otpauth);

            // Store secret temporarily but don't enable yet
            db.run("UPDATE users SET twoFactorSecret = ? WHERE userId = ?", [secret, userId], (updErr) => {
                if (updErr) return res.status(500).json({ error: 'Failed to update user' });
                res.json({ success: true, secret, qrCodeUrl });
            });
        } catch (qrErr) {
            res.status(500).json({ error: 'Failed to generate QR code' });
        }
    });
});

// 2FA Verify & Enable
app.post('/api/auth/2fa/verify', (req, res) => {
    const userId = req.user.userId;
    const { code } = req.body;

    db.get("SELECT * FROM users WHERE userId = ?", [userId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });

        const isValid = authenticator.check(code, user.twoFactorSecret);
        if (isValid) {
            db.run("UPDATE users SET twoFactorEnabled = 1 WHERE userId = ?", [userId], (updErr) => {
                if (updErr) return res.status(500).json({ error: 'Failed to enable 2FA' });
                res.json({ success: true, message: '2FA enabled successfully' });
            });
        } else {
            res.status(400).json({ error: 'Invalid verification code' });
        }
    });
});

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
