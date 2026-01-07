const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'casetrack.db');

// Initialize database
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the CaseTrack SQLite database.');
        createTables();
    }
});

function createTables() {
    db.serialize(() => {
        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            userId TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            email TEXT,
            department TEXT,
            firmName TEXT,
            isFirmOwner INTEGER DEFAULT 0,
            passwordHash TEXT,
            twoFactorSecret TEXT,
            twoFactorEnabled INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1
        )`, (err) => {
            if (!err) {
                // Migrations
                db.run(`ALTER TABLE users ADD COLUMN firmName TEXT`, (e) => { });
                db.run(`ALTER TABLE users ADD COLUMN isFirmOwner INTEGER DEFAULT 0`, (e) => { });
                db.run(`ALTER TABLE users ADD COLUMN passwordHash TEXT`, (e) => { });
                db.run(`ALTER TABLE users ADD COLUMN twoFactorSecret TEXT`, (e) => { });
                db.run(`ALTER TABLE users ADD COLUMN twoFactorEnabled INTEGER DEFAULT 0`, (e) => { });
            }
        });

        // Files Table
        db.run(`CREATE TABLE IF NOT EXISTS files (
            fileId TEXT PRIMARY KEY,
            caseName TEXT NOT NULL,
            clientName TEXT NOT NULL,
            practiceArea TEXT NOT NULL,
            status TEXT DEFAULT 'Active',
            currentCustodian TEXT NOT NULL,
            courtJurisdiction TEXT,
            assignedAdvocates TEXT,
            notes TEXT,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (currentCustodian) REFERENCES users (userId)
        )`);

        // Movements Table
        db.run(`CREATE TABLE IF NOT EXISTS movements (
            movementId TEXT PRIMARY KEY,
            fileId TEXT NOT NULL,
            fromCustodian TEXT,
            toCustodian TEXT NOT NULL,
            purpose TEXT NOT NULL,
            notes TEXT,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
            acknowledged INTEGER DEFAULT 0,
            acknowledgedAt TEXT,
            FOREIGN KEY (fileId) REFERENCES files (fileId),
            FOREIGN KEY (fromCustodian) REFERENCES users (userId),
            FOREIGN KEY (toCustodian) REFERENCES users (userId)
        )`);

        // Deadlines Table
        db.run(`CREATE TABLE IF NOT EXISTS deadlines (
            deadlineId TEXT PRIMARY KEY,
            fileId TEXT NOT NULL,
            type TEXT NOT NULL,
            dueDate TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'Pending',
            completedAt TEXT,
            FOREIGN KEY (fileId) REFERENCES files (fileId)
        )`);

        // Alerts Table
        db.run(`CREATE TABLE IF NOT EXISTS alerts (
            alertId TEXT PRIMARY KEY,
            fileId TEXT,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            severity TEXT NOT NULL,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
            read INTEGER DEFAULT 0,
            FOREIGN KEY (fileId) REFERENCES files (fileId)
        )`);

        // Attachments Table
        db.run(`CREATE TABLE IF NOT EXISTS attachments (
            attachmentId TEXT PRIMARY KEY,
            fileId TEXT NOT NULL,
            name TEXT NOT NULL,
            size INTEGER NOT NULL,
            type TEXT NOT NULL,
            data TEXT, -- Base64 for demo or path to file
            uploadedBy TEXT NOT NULL,
            uploadedAt TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (fileId) REFERENCES files (fileId),
            FOREIGN KEY (uploadedBy) REFERENCES users (userId)
        )`);

        console.log('Database tables initialized.');
        seedInitialData();
    });
}

function seedInitialData() {
    // One-time cleanup: Wipe existing sample data for production transition
    db.serialize(() => {
        db.run("DELETE FROM users");
        db.run("DELETE FROM files");
        db.run("DELETE FROM movements");
        db.run("DELETE FROM deadlines");
        db.run("DELETE FROM alerts");
        db.run("DELETE FROM attachments");
        console.log('Database wiped for production transition.');
    });
    console.log('Database initialized. Waiting for first signup...');
}

module.exports = db;
