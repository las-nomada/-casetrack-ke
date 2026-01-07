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
            passwordHash TEXT,
            twoFactorSecret TEXT,
            twoFactorEnabled INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1
        )`, (err) => {
            if (!err) {
                // Try to add column if it doesn't exist (for migration)
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
    // Check if users exist
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (row.count === 0) {
            console.log('Seeding initial data...');
            const defaultHash = '$2b$10$paGJDHcdd6n9Lz6QnMnlmeCTFxhz0nKQL/yjr/hfi/HryruKBxe3W'; // Hash for 'VibeTrackerke254'

            const users = [
                ['USR-001', 'James Odhiambo', 'Partner', 'james@casetrack.ke', 'Corporate', defaultHash, 1],
                ['USR-002', 'Sarah Otieno', 'Advocate', 'sarah@casetrack.ke', 'Litigation', defaultHash, 1],
                ['USR-003', 'Peter Mwangi', 'Advocate', 'peter@casetrack.ke', 'Criminal', defaultHash, 1],
                ['USR-004', 'Mary Wanjiru', 'Clerk', 'mary@casetrack.ke', 'Registry', defaultHash, 1]
            ];

            const stmt = db.prepare("INSERT INTO users (userId, name, role, email, department, passwordHash, active) VALUES (?, ?, ?, ?, ?, ?, ?)");
            users.forEach(u => stmt.run(u));
            stmt.finalize();

            // Seed some files
            const files = [
                ['CT-2026-0001', 'Kenya Commercial Bank v. Sunrise Enterprises', 'Kenya Commercial Bank', 'Banking & Finance', 'Active', 'USR-002', 'High Court - Milimani', 'USR-001,USR-002', 'High stakes debt recovery'],
                ['CT-2026-0002', 'Republic v. James Muthomi', 'James Muthomi', 'Criminal', 'Active', 'USR-003', 'Magistrates Court - Kibera', 'USR-003', 'Drug trafficking allegations'],
                ['CT-2026-0003', 'In Re: Estate of the Late Mzee Kiptoo', 'Family of Mzee Kiptoo', 'Succession & Inheritance', 'Active', 'USR-004', 'High Court - Eldoret', 'USR-001', 'Contested family estate']
            ];

            const fileStmt = db.prepare("INSERT INTO files (fileId, caseName, clientName, practiceArea, status, currentCustodian, courtJurisdiction, assignedAdvocates, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            files.forEach(f => fileStmt.run(f));
            fileStmt.finalize();
        }

        // Security Update: Reset all passwords to 'VibeTrackerke254'
        const globalHash = '$2b$10$paGJDHcdd6n9Lz6QnMnlmeCTFxhz0nKQL/yjr/hfi/HryruKBxe3W';
        db.run("UPDATE users SET passwordHash = ?", [globalHash], (err) => {
            if (err) console.error('Migration error:', err.message);
            else console.log('All user passwords updated to VibeTrackerke254');
        });
    });
}

module.exports = db;
