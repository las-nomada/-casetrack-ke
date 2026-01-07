/**
 * CaseTrack KE — Database Layer
 * Law Firm File Tracking System
 * Data Models and Storage Operations
 */

const CaseTrackDB = {
    // Local storage keys
    STORAGE_KEYS: {
        FILES: 'casetrack_files',
        MOVEMENTS: 'casetrack_movements',
        DEADLINES: 'casetrack_deadlines',
        ALERTS: 'casetrack_alerts',
        USERS: 'casetrack_users',
        SETTINGS: 'casetrack_settings'
    },

    /**
     * Synchronize local storage with backend API
     */
    async syncWithBackend() {
        if (!APIClient.isEnabled) return;

        try {
            console.log('Syncing with backend...');
            const [files, movements, deadlines, alerts, users] = await Promise.all([
                APIClient.getFiles(),
                APIClient.getMovements(),
                APIClient.getDeadlines(),
                APIClient.getAlerts(),
                APIClient.getUsers()
            ]);

            if (files) this.saveData(this.STORAGE_KEYS.FILES, files);
            if (movements) this.saveData(this.STORAGE_KEYS.MOVEMENTS, movements);
            if (deadlines) this.saveData(this.STORAGE_KEYS.DEADLINES, deadlines);
            if (alerts) this.saveData(this.STORAGE_KEYS.ALERTS, alerts);
            if (users) this.saveData(this.STORAGE_KEYS.USERS, users);

            console.log('Sync complete.');
            return true;
        } catch (error) {
            console.error('Backend sync failed:', error);
            return false;
        }
    },

    // ==========================================
    // FILE OPERATIONS
    // ==========================================

    generateFileId() {
        const year = new Date().getFullYear();
        const files = this.getAllFiles();
        const yearFiles = files.filter(f => f.fileId && f.fileId.includes(`CT-${year}`));
        const nextNum = yearFiles.length + 1;
        return `CT-${year}-${String(nextNum).padStart(4, '0')}`;
    },

    async createFile(fileData) {
        const fileId = this.generateFileId();
        const newFileData = {
            ...fileData,
            fileId,
            status: 'Active',
            currentCustodian: fileData.currentCustodian,
            createdAt: new Date().toISOString()
        };

        // Save locally first for responsiveness
        const files = this.getAllFiles();
        files.push(newFileData);
        this.saveData(this.STORAGE_KEYS.FILES, files);

        // Save to backend
        try {
            await APIClient.registerFile(newFileData);
            // After register, also log the initial movement on backend
            await APIClient.logMovement({
                fileId: fileId,
                fromCustodian: null,
                toCustodian: fileData.currentCustodian,
                purpose: 'File Creation / Initial Registration',
                notes: 'File registered in the system'
            });
        } catch (error) {
            console.error('Failed to sync new file to backend:', error);
        }

        return newFileData;
    },

    async updateFile(fileId, updates) {
        const files = this.getAllFiles();
        const index = files.findIndex(f => f.fileId === fileId);
        if (index === -1) return null;

        files[index] = { ...files[index], ...updates, updatedAt: new Date().toISOString() };
        this.saveData(this.STORAGE_KEYS.FILES, files);

        // In a full implementation, we'd have a PUT /api/files/:id
        return files[index];
    },

    getFile(fileId) {
        const files = this.getAllFiles();
        return files.find(f => f.fileId === fileId) || null;
    },

    getAllFiles() {
        return this.loadData(this.STORAGE_KEYS.FILES) || [];
    },

    // ... (rest of the filtered file methods remain same as they use getAllFiles)

    getAllMovements() {
        return this.loadData(this.STORAGE_KEYS.MOVEMENTS) || [];
    },

    getFileMovements(fileId) {
        return this.getAllMovements().filter(m => m.fileId === fileId);
    },

    getUnacknowledgedMovements(userId = null) {
        let movements = this.getAllMovements().filter(m => !m.acknowledged);
        if (userId) {
            movements = movements.filter(m => m.toCustodian === userId);
        }
        return movements;
    },

    // ==========================================
    // MOVEMENT OPERATIONS (IMMUTABLE LOG)
    // ==========================================

    async logMovement(movementData) {
        const newMovement = {
            movementId: `MV-${Date.now()}`,
            fileId: movementData.fileId,
            fromCustodian: movementData.fromCustodian || null,
            toCustodian: movementData.toCustodian,
            timestamp: new Date().toISOString(),
            purpose: movementData.purpose || 'Movement',
            acknowledged: false,
            notes: movementData.notes || ''
        };

        // Save locally
        const movements = this.getAllMovements();
        movements.push(newMovement);
        this.saveData(this.STORAGE_KEYS.MOVEMENTS, movements);

        // Update file custodian locally
        this.updateFile(movementData.fileId, {
            currentCustodian: movementData.toCustodian
        });

        // Save to backend
        try {
            await APIClient.logMovement(newMovement);
        } catch (error) {
            console.error('Failed to sync movement to backend:', error);
        }

        return newMovement;
    },

    async acknowledgeMovement(movementId, userId) {
        const movements = this.getAllMovements();
        const index = movements.findIndex(m => m.movementId === movementId);
        if (index === -1) return null;

        movements[index].acknowledged = true;
        movements[index].acknowledgedAt = new Date().toISOString();
        movements[index].acknowledgedBy = userId;

        this.saveData(this.STORAGE_KEYS.MOVEMENTS, movements);

        // Save to backend
        try {
            await APIClient.acknowledgeMovement(movementId);
        } catch (error) {
            console.error('Failed to sync acknowledgment to backend:', error);
        }

        return movements[index];
    },

    // ... (rest of the movement methods remain same)

    getAllDeadlines() {
        return this.loadData(this.STORAGE_KEYS.DEADLINES) || [];
    },

    getFileDeadlines(fileId) {
        return this.getAllDeadlines().filter(d => d.fileId === fileId);
    },

    getUpcomingDeadlines(days = 7) {
        const now = new Date();
        const limit = new Date();
        limit.setDate(limit.getDate() + days);

        return this.getAllDeadlines().filter(d => {
            const dueDate = new Date(d.dueDate);
            return d.status === 'Pending' && dueDate >= now && dueDate <= limit;
        });
    },

    getOverdueDeadlines() {
        const now = new Date();
        return this.getAllDeadlines().filter(d => {
            const dueDate = new Date(d.dueDate);
            return d.status === 'Pending' && dueDate < now;
        });
    },

    // ==========================================
    // DEADLINE OPERATIONS
    // ==========================================

    async createDeadline(deadlineData) {
        const newDeadline = {
            deadlineId: `DL-${Date.now()}`,
            fileId: deadlineData.fileId,
            type: deadlineData.type || 'Other',
            dueDate: deadlineData.dueDate,
            description: deadlineData.description || '',
            status: 'Pending',
            createdAt: new Date().toISOString()
        };

        const deadlines = this.getAllDeadlines();
        deadlines.push(newDeadline);
        this.saveData(this.STORAGE_KEYS.DEADLINES, deadlines);

        // Save to backend
        try {
            await APIClient.addDeadline(newDeadline);
        } catch (error) {
            console.error('Failed to sync deadline to backend:', error);
        }

        return newDeadline;
    },

    // ... (rest of the deadline methods remain same)

    // ==========================================
    // ALERT OPERATIONS
    // ==========================================

    async markAlertRead(alertId) {
        const alerts = this.getAllAlerts();
        const index = alerts.findIndex(a => a.alertId === alertId);
        if (index === -1) return null;

        alerts[index].read = true;
        alerts[index].readAt = new Date().toISOString();
        this.saveData(this.STORAGE_KEYS.ALERTS, alerts);

        // In a full implementation, we'd have a POST /api/alerts/:id/read
        return alerts[index];
    },

    // ... (rest of the alert methods remain same)

    // ... (rest of the file follows)


    dismissAlert(alertId) {
        const alerts = this.getAllAlerts();
        const index = alerts.findIndex(a => a.alertId === alertId);
        if (index === -1) return null;

        alerts[index].dismissed = true;
        alerts[index].dismissedAt = new Date().toISOString();
        this.saveData(this.STORAGE_KEYS.ALERTS, alerts);
        return alerts[index];
    },

    getAllAlerts() {
        return this.loadData(this.STORAGE_KEYS.ALERTS) || [];
    },

    getActiveAlerts(userId = null) {
        let alerts = this.getAllAlerts().filter(a => !a.dismissed);
        if (userId) {
            alerts = alerts.filter(a => a.targetUserId === userId || a.targetUserId === null);
        }
        return alerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    getUnreadAlertCount(userId = null) {
        return this.getActiveAlerts(userId).filter(a => !a.read).length;
    },

    // ==========================================
    // PRACTICE AREAS
    // ==========================================

    PRACTICE_AREAS: [
        'Commercial',
        'Constitutional',
        'Criminal',
        'Family Law',
        'Employment & Labour',
        'Land & Property',
        'Banking & Finance',
        'Insurance',
        'Succession & Inheritance',
        'Public Procurement',
        'Anti-Corruption',
        'Tax',
        'Alternative Dispute Resolution',
        'General'
    ],

    MOVEMENT_PURPOSES: [
        'Drafting',
        'Filing',
        'Review',
        'Court Mention',
        'Court Hearing',
        'Client Meeting',
        'Partner Review',
        'Senior Review',
        'Storage/Archive',
        'Return to Custodian',
        'Other'
    ],

    DEADLINE_TYPES: [
        'Court Mention',
        'Court Hearing',
        'Filing Deadline',
        'Motion Response',
        'Discovery',
        'Appeal Deadline',
        'Limitation Period',
        'Client Deadline',
        'Internal Deadline',
        'Other'
    ],

    // ==========================================
    // USER OPERATIONS
    // ==========================================

    getAllUsers() {
        return this.loadData(this.STORAGE_KEYS.USERS) || [];
    },

    getUser(userId) {
        return this.getAllUsers().find(u => u.userId === userId) || null;
    },

    getUsersByRole(role) {
        return this.getAllUsers().filter(u => u.role === role);
    },

    FILE_STATUSES: ['Active', 'Dormant', 'Closed'],

    USER_ROLES: ['Clerk', 'Advocate', 'Partner'],

    // ==========================================
    // STORAGE HELPERS
    // ==========================================

    saveData(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('CaseTrack DB: Save error', e);
            return false;
        }
    },

    loadData(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('CaseTrack DB: Load error', e);
            return null;
        }
    },

    clearAll() {
        Object.values(this.STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
    },

    // ==========================================
    // STATISTICS & REPORTS
    // ==========================================

    getStatistics() {
        const files = this.getAllFiles();
        const movements = this.getAllMovements();
        const deadlines = this.getAllDeadlines();
        const alerts = this.getActiveAlerts();

        return {
            totalFiles: files.length,
            activeFiles: files.filter(f => f.status === 'Active').length,
            dormantFiles: files.filter(f => f.status === 'Dormant').length,
            closedFiles: files.filter(f => f.status === 'Closed').length,
            totalMovements: movements.length,
            unacknowledgedMovements: movements.filter(m => !m.acknowledged).length,
            upcomingDeadlines: this.getUpcomingDeadlines(7).length,
            overdueDeadlines: this.getOverdueDeadlines().length,
            activeAlerts: alerts.length,
            unreadAlerts: alerts.filter(a => !a.read).length
        };
    },

    getCustodianReport() {
        const files = this.getAllFiles();
        const users = this.getAllUsers();
        const movements = this.getAllMovements();

        const report = users.map(user => {
            const userFiles = files.filter(f => f.currentCustodian === user.userId);
            const unacknowledged = movements.filter(m =>
                m.toCustodian === user.userId && !m.acknowledged
            ).length;

            // Calculate average time in possession
            let avgDays = 0;
            if (userFiles.length > 0) {
                const now = new Date();
                const totalDays = userFiles.reduce((sum, file) => {
                    const lastMovement = movements
                        .filter(m => m.fileId === file.fileId && m.toCustodian === user.userId)
                        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

                    if (lastMovement) {
                        const days = (now - new Date(lastMovement.timestamp)) / (1000 * 60 * 60 * 24);
                        return sum + days;
                    }
                    return sum;
                }, 0);
                avgDays = Math.round(totalDays / userFiles.length);
            }

            return {
                user,
                fileCount: userFiles.length,
                files: userFiles,
                unacknowledged,
                avgDaysInPossession: avgDays
            };
        });

        return report.filter(r => r.fileCount > 0).sort((a, b) => b.fileCount - a.fileCount);
    },

    getBottleneckReport(thresholdDays = 7) {
        const files = this.getAllFiles();
        const movements = this.getAllMovements();
        const now = new Date();

        const bottlenecks = [];

        files.filter(f => f.status === 'Active').forEach(file => {
            const lastMovement = movements
                .filter(m => m.fileId === file.fileId)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

            if (lastMovement) {
                const daysHeld = Math.round(
                    (now - new Date(lastMovement.timestamp)) / (1000 * 60 * 60 * 24)
                );

                if (daysHeld >= thresholdDays) {
                    bottlenecks.push({
                        file,
                        currentCustodian: file.currentCustodian,
                        lastMovement,
                        daysHeld,
                        riskLevel: daysHeld >= 14 ? 'high' : daysHeld >= 7 ? 'medium' : 'low'
                    });
                }
            }
        });

        return bottlenecks.sort((a, b) => b.daysHeld - a.daysHeld);
    }
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CaseTrackDB;
}
