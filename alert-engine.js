/**
 * CaseTrack KE — Alert Engine
 * Proactive notification and escalation system
 */

const AlertEngine = {

    // Alert configuration
    CONFIG: {
        deadlineWarningDays: [7, 3, 1],  // Days before deadline to alert
        overdueThresholdDays: 7,         // Days file held before flagging
        escalationThresholdDays: 14      // Days before escalating to Partner
    },

    /**
     * Run full alert check - call on page load
     */
    async runAlertCheck() {
        console.log('CaseTrack Alert Engine: Running checks...');

        await this.checkDeadlineAlerts();
        await this.checkOverdueFiles();
        await this.checkUnacknowledgedMovements();
        await this.checkMissingDigitalLinks();

        console.log('CaseTrack Alert Engine: Checks complete');
    },

    /**
     * Check for upcoming and overdue deadlines
     */
    async checkDeadlineAlerts() {
        const now = new Date();
        const deadlines = CaseTrackDB.getAllDeadlines().filter(d => d.status === 'Pending');

        for (const deadline of deadlines) {
            const dueDate = new Date(deadline.dueDate);
            const daysUntil = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
            const file = CaseTrackDB.getFile(deadline.fileId);

            if (!file) continue;

            // Check for overdue
            if (daysUntil < 0) {
                await this.createAlertIfNew({
                    type: 'deadline_overdue',
                    severity: 'critical',
                    fileId: deadline.fileId,
                    deadlineId: deadline.deadlineId,
                    targetUserId: file.assignedAdvocates?.[0] || null,
                    message: `OVERDUE: ${deadline.type} for "${file.caseName}" was due ${Math.abs(daysUntil)} day(s) ago. ${deadline.description}`
                });

                // Escalate to partners
                const partners = CaseTrackDB.getUsersByRole('Partner');
                for (const partner of partners) {
                    await this.createAlertIfNew({
                        type: 'escalation',
                        severity: 'critical',
                        fileId: deadline.fileId,
                        deadlineId: deadline.deadlineId,
                        targetUserId: partner.userId,
                        message: `ESCALATION: Deadline overdue for "${file.caseName}" - ${deadline.type}. Current custodian: ${this.getCustodianName(file.currentCustodian)}`
                    });
                }
            }
            // Check for upcoming warnings
            else if (this.CONFIG.deadlineWarningDays.includes(daysUntil)) {
                const urgency = daysUntil === 1 ? 'critical' : daysUntil <= 3 ? 'warning' : 'info';

                await this.createAlertIfNew({
                    type: 'deadline_upcoming',
                    severity: urgency,
                    fileId: deadline.fileId,
                    deadlineId: deadline.deadlineId,
                    targetUserId: file.assignedAdvocates?.[0] || null,
                    message: `DEADLINE: ${deadline.type} for "${file.caseName}" in ${daysUntil} day(s). ${deadline.description}`
                });

                // Check if file is with correct custodian
                if (file.assignedAdvocates && !file.assignedAdvocates.includes(file.currentCustodian)) {
                    await this.createAlertIfNew({
                        type: 'file_location_warning',
                        severity: 'warning',
                        fileId: deadline.fileId,
                        targetUserId: file.currentCustodian,
                        message: `File "${file.caseName}" has upcoming deadline but is not with assigned advocate. Current location: ${this.getCustodianName(file.currentCustodian)}`
                    });
                }
            }
        }
    },

    /**
     * Check for files held too long by a custodian
     */
    async checkOverdueFiles() {
        const bottlenecks = CaseTrackDB.getBottleneckReport(this.CONFIG.overdueThresholdDays);

        for (const item of bottlenecks) {
            const severity = item.daysHeld >= this.CONFIG.escalationThresholdDays ? 'critical' : 'warning';

            await this.createAlertIfNew({
                type: 'file_overdue_at_custodian',
                severity: severity,
                fileId: item.file.fileId,
                targetUserId: item.currentCustodian,
                message: `File "${item.file.caseName}" has been with ${this.getCustodianName(item.currentCustodian)} for ${item.daysHeld} days without movement.`
            });

            // Escalate if beyond threshold
            if (item.daysHeld >= this.CONFIG.escalationThresholdDays) {
                const partners = CaseTrackDB.getUsersByRole('Partner');
                for (const partner of partners) {
                    await this.createAlertIfNew({
                        type: 'escalation',
                        severity: 'critical',
                        fileId: item.file.fileId,
                        targetUserId: partner.userId,
                        message: `BOTTLENECK: "${item.file.caseName}" held by ${this.getCustodianName(item.currentCustodian)} for ${item.daysHeld} days. Intervention may be required.`
                    });
                }
            }
        }
    },

    /**
     * Check for unacknowledged file movements
     */
    async checkUnacknowledgedMovements() {
        const unacknowledged = CaseTrackDB.getUnacknowledgedMovements();
        const now = new Date();

        for (const movement of unacknowledged) {
            const hoursSince = (now - new Date(movement.timestamp)) / (1000 * 60 * 60);

            // Alert if not acknowledged within 24 hours
            if (hoursSince >= 24) {
                const file = CaseTrackDB.getFile(movement.fileId);
                if (!file) continue;

                await this.createAlertIfNew({
                    type: 'movement_unacknowledged',
                    severity: 'warning',
                    fileId: movement.fileId,
                    targetUserId: movement.toCustodian,
                    message: `Pending acknowledgement: "${file.caseName}" transferred to ${this.getCustodianName(movement.toCustodian)} ${Math.round(hoursSince)} hours ago.`
                });
            }
        }
    },

    /**
     * Check for physical files without digital links
     */
    async checkMissingDigitalLinks() {
        const files = CaseTrackDB.getAllFiles().filter(f => f.status === 'Active');

        for (const file of files) {
            if (!file.linkedDigitalFiles || file.linkedDigitalFiles.length === 0) {
                await this.createAlertIfNew({
                    type: 'missing_digital_link',
                    severity: 'info',
                    fileId: file.fileId,
                    targetUserId: file.assignedAdvocates?.[0] || null,
                    message: `File "${file.caseName}" has no linked digital documents. Consider uploading scans for backup.`
                });
            }
        }
    },

    /**
     * Create alert only if similar doesn't exist
     */
    async createAlertIfNew(alertData) {
        const existing = CaseTrackDB.getActiveAlerts().find(a =>
            a.type === alertData.type &&
            a.fileId === alertData.fileId &&
            a.targetUserId === alertData.targetUserId &&
            !a.dismissed
        );

        if (!existing) {
            await CaseTrackDB.createAlert(alertData);
        }
    },

    /**
     * Get human-readable custodian name
     */
    getCustodianName(userId) {
        if (!userId) return 'Unknown';
        const user = CaseTrackDB.getUser(userId);
        return user ? user.name : 'Unknown User';
    },

    /**
     * Get alerts for current user
     */
    getMyAlerts() {
        const user = CaseTrackAuth.getCurrentUser();
        if (!user) return [];

        // Partners see all alerts
        if (user.role === 'Partner') {
            return CaseTrackDB.getActiveAlerts();
        }

        // Others see only their alerts
        return CaseTrackDB.getActiveAlerts(user.userId);
    },

    /**
     * Get unread count for current user
     */
    getUnreadCount() {
        const alerts = this.getMyAlerts();
        return alerts.filter(a => !a.read).length;
    },

    /**
     * Mark alert as read
     */
    markRead(alertId) {
        return CaseTrackDB.markAlertRead(alertId);
    },

    /**
     * Dismiss alert
     */
    dismiss(alertId) {
        return CaseTrackDB.dismissAlert(alertId);
    },

    /**
     * Get alert icon by type
     */
    getAlertIcon(type) {
        const icons = {
            'deadline_overdue': '🚨',
            'deadline_upcoming': '⏰',
            'file_overdue_at_custodian': '📁',
            'file_location_warning': '📍',
            'movement_unacknowledged': '✋',
            'missing_digital_link': '📎',
            'escalation': '⚠️'
        };
        return icons[type] || '🔔';
    },

    /**
     * Get alert color class by severity
     */
    getSeverityClass(severity) {
        const classes = {
            'critical': 'alert-critical',
            'warning': 'alert-warning',
            'info': 'alert-info'
        };
        return classes[severity] || 'alert-info';
    },

    /**
     * Format alert for display
     */
    formatAlert(alert) {
        const file = alert.fileId ? CaseTrackDB.getFile(alert.fileId) : null;
        const relativeTime = this.getRelativeTime(new Date(alert.createdAt));

        return {
            ...alert,
            icon: this.getAlertIcon(alert.type),
            severityClass: this.getSeverityClass(alert.severity),
            relativeTime,
            fileInfo: file ? { id: file.fileId, name: file.caseName } : null
        };
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
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    },

    /**
     * Get dashboard summary
     */
    getDashboardSummary() {
        const alerts = this.getMyAlerts();

        return {
            total: alerts.length,
            unread: alerts.filter(a => !a.read).length,
            critical: alerts.filter(a => a.severity === 'critical').length,
            warning: alerts.filter(a => a.severity === 'warning').length,
            info: alerts.filter(a => a.severity === 'info').length,
            byType: {
                deadlines: alerts.filter(a => a.type.includes('deadline')).length,
                movements: alerts.filter(a => a.type.includes('movement')).length,
                escalations: alerts.filter(a => a.type === 'escalation').length
            }
        };
    }
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AlertEngine;
}
