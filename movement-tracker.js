/**
 * CaseTrack KE — Movement Tracker
 * File movement logging and tracking operations
 */

const MovementTracker = {

    /**
     * Transfer file to new custodian
     */
    transferFile(fileId, toCustodianId, purpose, notes = '') {
        try {
            CaseTrackAuth.requirePermission('logMovements', 'log file movements');

            const file = CaseTrackDB.getFile(fileId);
            if (!file) {
                return { success: false, error: 'File not found' };
            }

            const toUser = CaseTrackDB.getUser(toCustodianId);
            if (!toUser) {
                return { success: false, error: 'Target custodian not found' };
            }

            const validPurposes = CaseTrackDB.MOVEMENT_PURPOSES;
            if (purpose && !validPurposes.includes(purpose)) {
                return { success: false, error: 'Invalid movement purpose' };
            }

            const movement = CaseTrackDB.logMovement({
                fileId,
                fromCustodian: file.currentCustodian,
                toCustodian: toCustodianId,
                purpose: purpose || 'Movement',
                notes,
                loggedBy: CaseTrackAuth.getCurrentUser()?.userId
            });

            return { success: true, movement };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    /**
     * Acknowledge receipt of file
     */
    acknowledgeReceipt(movementId) {
        try {
            const movement = CaseTrackDB.getMovement(movementId);
            if (!movement) {
                return { success: false, error: 'Movement record not found' };
            }

            const currentUser = CaseTrackAuth.getCurrentUser();

            // Only the recipient can acknowledge
            if (movement.toCustodian !== currentUser?.userId &&
                !CaseTrackAuth.hasPermission('viewAllFiles')) {
                return { success: false, error: 'Only the recipient can acknowledge this transfer' };
            }

            const updated = CaseTrackDB.acknowledgeMovement(movementId, currentUser?.userId);
            return { success: true, movement: updated };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    /**
     * Get pending acknowledgments for current user
     */
    getMyPendingAcknowledgments() {
        const user = CaseTrackAuth.getCurrentUser();
        if (!user) return [];

        return CaseTrackDB.getPendingAcknowledgments(user.userId).map(m => {
            const file = CaseTrackDB.getFile(m.fileId);
            const fromUser = CaseTrackDB.getUser(m.fromCustodian);
            return {
                ...m,
                file,
                fromUserInfo: fromUser
            };
        });
    },

    /**
     * Get file movement history
     */
    getFileHistory(fileId) {
        const file = CaseTrackDB.getFile(fileId);
        if (!file || !CaseTrackAuth.canViewFile(file)) {
            return [];
        }

        return CaseTrackDB.getFileMovements(fileId).map(m => {
            const fromUser = CaseTrackDB.getUser(m.fromCustodian);
            const toUser = CaseTrackDB.getUser(m.toCustodian);
            const loggedByUser = CaseTrackDB.getUser(m.loggedBy);

            return {
                ...m,
                fromUserInfo: fromUser,
                toUserInfo: toUser,
                loggedByInfo: loggedByUser,
                formattedDate: this.formatDate(m.timestamp),
                relativeTime: this.getRelativeTime(new Date(m.timestamp))
            };
        });
    },

    /**
     * Request file from current custodian
     */
    requestFile(fileId, reason = '') {
        try {
            CaseTrackAuth.requirePermission('requestFiles', 'request files');

            const file = CaseTrackDB.getFile(fileId);
            if (!file) {
                return { success: false, error: 'File not found' };
            }

            const requester = CaseTrackAuth.getCurrentUser();
            const custodian = CaseTrackDB.getUser(file.currentCustodian);

            // Create alert for current custodian
            CaseTrackDB.createAlert({
                type: 'file_request',
                severity: 'info',
                fileId,
                targetUserId: file.currentCustodian,
                message: `${requester?.name || 'A user'} has requested file "${file.caseName}". Reason: ${reason || 'Not specified'}`
            });

            return {
                success: true,
                message: `Request sent to ${custodian?.name || 'current custodian'}`
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    /**
     * Check in file (return to registry)
     */
    checkInFile(fileId, notes = '') {
        try {
            const file = CaseTrackDB.getFile(fileId);
            if (!file) {
                return { success: false, error: 'File not found' };
            }

            // Find a clerk to return to
            const clerks = CaseTrackDB.getUsersByRole('Clerk');
            if (clerks.length === 0) {
                return { success: false, error: 'No clerks available to receive file' };
            }

            return this.transferFile(fileId, clerks[0].userId, 'Return to Custodian', notes);
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    /**
     * Check out file to user
     */
    checkOutFile(fileId, toUserId, purpose, notes = '') {
        return this.transferFile(fileId, toUserId, purpose, notes);
    },

    /**
     * Process QR scan for file movement
     */
    processQRScan(qrData, action = 'view') {
        const file = FileManager.getFileByQR(qrData);
        if (!file) {
            return { success: false, error: 'File not found from QR code' };
        }

        if (action === 'acknowledge') {
            // Find pending movement for this file to current user
            const pending = this.getMyPendingAcknowledgments().find(m => m.fileId === file.fileId);
            if (pending) {
                return this.acknowledgeReceipt(pending.movementId);
            }
            return { success: false, error: 'No pending acknowledgment for this file' };
        }

        return {
            success: true,
            file: FileManager.getFileDetails(file.fileId)
        };
    },

    /**
     * Get movement purposes for dropdown
     */
    getMovementPurposes() {
        return CaseTrackDB.MOVEMENT_PURPOSES;
    },

    /**
     * Get all users as potential custodians
     */
    getPotentialCustodians() {
        return CaseTrackDB.getAllUsers().filter(u => u.active);
    },

    /**
     * Get audit trail for file
     */
    getAuditTrail(fileId) {
        if (!CaseTrackAuth.hasPermission('viewAuditLogs')) {
            // For non-partners, only show limited history
            return this.getFileHistory(fileId).slice(0, 10);
        }

        // Full audit trail for partners
        return CaseTrackDB.getFileMovements(fileId).map(m => ({
            ...m,
            fromUserInfo: CaseTrackDB.getUser(m.fromCustodian),
            toUserInfo: CaseTrackDB.getUser(m.toCustodian),
            loggedByInfo: CaseTrackDB.getUser(m.loggedBy),
            acknowledgedByInfo: m.acknowledgedBy ? CaseTrackDB.getUser(m.acknowledgedBy) : null,
            formattedTimestamp: this.formatDateTime(m.timestamp),
            formattedAckTime: m.acknowledgedAt ? this.formatDateTime(m.acknowledgedAt) : null
        }));
    },

    /**
     * Export audit trail to printable format
     */
    exportAuditTrail(fileId) {
        const file = CaseTrackDB.getFile(fileId);
        const trail = this.getAuditTrail(fileId);

        if (!file || !trail) return null;

        return {
            file: {
                id: file.fileId,
                caseName: file.caseName,
                clientName: file.clientName,
                status: file.status,
                dateOpened: this.formatDate(file.dateOpened)
            },
            trail: trail.map(m => ({
                date: this.formatDateTime(m.timestamp),
                from: m.fromUserInfo?.name || 'N/A',
                to: m.toUserInfo?.name || 'N/A',
                purpose: m.purpose,
                acknowledged: m.acknowledged ? 'Yes' : 'Pending',
                loggedBy: m.loggedByInfo?.name || 'System'
            })),
            exportDate: new Date().toISOString(),
            exportedBy: CaseTrackAuth.getCurrentUser()?.name || 'Unknown'
        };
    },

    /**
     * Format date for display
     */
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-KE', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    /**
     * Format date and time for display
     */
    formatDateTime(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString('en-KE', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Get relative time string
     */
    getRelativeTime(date) {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
        if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) !== 1 ? 's' : ''} ago`;
        return this.formatDate(date.toISOString());
    }
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MovementTracker;
}
