/**
 * CaseTrack KE — Reports Module
 * Dashboard data and report generation
 */

const Reports = {

    /**
     * Get main dashboard statistics
     */
    getDashboardStats() {
        const stats = CaseTrackDB.getStatistics();
        const alertSummary = AlertEngine.getDashboardSummary();

        return {
            ...stats,
            alerts: alertSummary,
            lastUpdated: new Date().toISOString()
        };
    },

    /**
     * Get file status breakdown
     */
    getFileStatusReport() {
        const files = CaseTrackAuth.getVisibleFiles();

        return {
            active: files.filter(f => f.status === 'Active'),
            dormant: files.filter(f => f.status === 'Dormant'),
            closed: files.filter(f => f.status === 'Closed'),
            summary: {
                total: files.length,
                activeCount: files.filter(f => f.status === 'Active').length,
                dormantCount: files.filter(f => f.status === 'Dormant').length,
                closedCount: files.filter(f => f.status === 'Closed').length
            }
        };
    },

    /**
     * Get files by practice area breakdown
     */
    getByPracticeAreaReport() {
        const files = CaseTrackAuth.getVisibleFiles();
        const areas = {};

        CaseTrackDB.PRACTICE_AREAS.forEach(area => {
            areas[area] = files.filter(f => f.practiceArea === area);
        });

        return {
            byArea: areas,
            summary: Object.keys(areas).map(area => ({
                area,
                count: areas[area].length,
                activeCount: areas[area].filter(f => f.status === 'Active').length
            })).filter(s => s.count > 0).sort((a, b) => b.count - a.count)
        };
    },

    /**
     * Get custodian report (who has which files)
     */
    getCustodianReport() {
        if (!CaseTrackAuth.hasPermission('generateReports')) {
            // Limited view for non-partners
            const user = CaseTrackAuth.getCurrentUser();
            if (!user) return { report: [], summary: {} };

            const myFiles = CaseTrackDB.getFilesByCustodian(user.userId);
            return {
                report: [{
                    user,
                    fileCount: myFiles.length,
                    files: myFiles,
                    unacknowledged: CaseTrackDB.getPendingAcknowledgments(user.userId).length,
                    avgDaysInPossession: 0
                }],
                summary: { totalFiles: myFiles.length }
            };
        }

        // Full report for partners
        const report = CaseTrackDB.getCustodianReport();

        return {
            report,
            summary: {
                totalCustodians: report.length,
                totalFiles: report.reduce((sum, r) => sum + r.fileCount, 0),
                totalUnacknowledged: report.reduce((sum, r) => sum + r.unacknowledged, 0)
            }
        };
    },

    /**
     * Get deadline report
     */
    getDeadlineReport(days = 30) {
        const upcomingAll = CaseTrackDB.getUpcomingDeadlines(days);
        const overdue = CaseTrackDB.getOverdueDeadlines();

        // Filter by visibility
        const visibleFiles = CaseTrackAuth.getVisibleFiles();
        const visibleFileIds = new Set(visibleFiles.map(f => f.fileId));

        const upcoming = upcomingAll.filter(d => visibleFileIds.has(d.fileId));
        const overdueVisible = overdue.filter(d => visibleFileIds.has(d.fileId));

        // Enrich with file data
        const enrichDeadline = (d) => {
            const file = CaseTrackDB.getFile(d.fileId);
            const dueDate = new Date(d.dueDate);
            const now = new Date();
            const daysUntil = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

            return {
                ...d,
                file,
                daysUntil,
                urgency: daysUntil < 0 ? 'overdue' : daysUntil <= 3 ? 'urgent' : daysUntil <= 7 ? 'soon' : 'normal',
                formattedDate: MovementTracker.formatDate(d.dueDate)
            };
        };

        return {
            overdue: overdueVisible.map(enrichDeadline),
            upcoming: upcoming.map(enrichDeadline),
            byWeek: this.groupDeadlinesByWeek(upcoming.map(enrichDeadline)),
            summary: {
                overdueCount: overdueVisible.length,
                upcomingCount: upcoming.length,
                thisWeek: upcoming.filter(d => {
                    const daysUntil = Math.ceil((new Date(d.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
                    return daysUntil <= 7;
                }).length
            }
        };
    },

    groupDeadlinesByWeek(deadlines) {
        const weeks = {};
        const now = new Date();

        deadlines.forEach(d => {
            const dueDate = new Date(d.dueDate);
            const weekNum = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24 * 7));
            const weekKey = weekNum <= 1 ? 'This Week' : weekNum <= 2 ? 'Next Week' : `Week ${weekNum}`;

            if (!weeks[weekKey]) weeks[weekKey] = [];
            weeks[weekKey].push(d);
        });

        return weeks;
    },

    /**
     * Get bottleneck report (files held too long)
     */
    getBottleneckReport(thresholdDays = 7) {
        if (!CaseTrackAuth.hasPermission('generateReports')) {
            return { bottlenecks: [], summary: {} };
        }

        const bottlenecks = CaseTrackDB.getBottleneckReport(thresholdDays);

        // Enrich with user data
        const enriched = bottlenecks.map(b => ({
            ...b,
            custodianInfo: CaseTrackDB.getUser(b.currentCustodian),
            lastMovementDate: MovementTracker.formatDate(b.lastMovement?.timestamp)
        }));

        return {
            bottlenecks: enriched,
            summary: {
                total: enriched.length,
                highRisk: enriched.filter(b => b.riskLevel === 'high').length,
                mediumRisk: enriched.filter(b => b.riskLevel === 'medium').length
            }
        };
    },

    /**
     * Get risk assessment report
     */
    getRiskReport() {
        if (!CaseTrackAuth.hasPermission('generateReports')) {
            return { risks: [], summary: {} };
        }

        const risks = [];

        // Check for overdue deadlines
        const overdueDeadlines = CaseTrackDB.getOverdueDeadlines();
        overdueDeadlines.forEach(d => {
            const file = CaseTrackDB.getFile(d.fileId);
            risks.push({
                type: 'Overdue Deadline',
                severity: 'high',
                fileId: d.fileId,
                file,
                description: `${d.type}: ${d.description}`,
                dueDate: d.dueDate,
                recommendation: 'Immediately address this deadline. Notify assigned advocate and partner.'
            });
        });

        // Check for bottlenecks
        const bottlenecks = CaseTrackDB.getBottleneckReport(14);
        bottlenecks.forEach(b => {
            risks.push({
                type: 'File Bottleneck',
                severity: b.riskLevel,
                fileId: b.file.fileId,
                file: b.file,
                description: `File held by ${CaseTrackDB.getUser(b.currentCustodian)?.name || 'Unknown'} for ${b.daysHeld} days`,
                recommendation: 'Review whether file movement is required. Consider reassignment if custodian is unavailable.'
            });
        });

        // Check for unacknowledged movements
        const unacknowledged = CaseTrackDB.getUnacknowledgedMovements();
        const oldUnacknowledged = unacknowledged.filter(m => {
            const hoursSince = (new Date() - new Date(m.timestamp)) / (1000 * 60 * 60);
            return hoursSince >= 48;
        });

        oldUnacknowledged.forEach(m => {
            const file = CaseTrackDB.getFile(m.fileId);
            risks.push({
                type: 'Unacknowledged Transfer',
                severity: 'medium',
                fileId: m.fileId,
                file,
                description: `Transfer to ${CaseTrackDB.getUser(m.toCustodian)?.name || 'Unknown'} not acknowledged`,
                recommendation: 'Confirm file location with recipient. Update movement log if location is verified.'
            });
        });

        // Check for files without digital links
        const filesWithoutDigital = CaseTrackDB.getAllFiles()
            .filter(f => f.status === 'Active' && (!f.linkedDigitalFiles || f.linkedDigitalFiles.length === 0));

        filesWithoutDigital.slice(0, 5).forEach(f => {
            risks.push({
                type: 'Missing Digital Backup',
                severity: 'low',
                fileId: f.fileId,
                file: f,
                description: 'No digital documents linked to this file',
                recommendation: 'Upload scanned copies of key documents for backup and easy reference.'
            });
        });

        // Sort by severity
        const severityOrder = { high: 0, medium: 1, low: 2 };
        risks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        return {
            risks,
            summary: {
                total: risks.length,
                high: risks.filter(r => r.severity === 'high').length,
                medium: risks.filter(r => r.severity === 'medium').length,
                low: risks.filter(r => r.severity === 'low').length
            }
        };
    },

    /**
     * Get audit log report
     */
    getAuditLogReport(options = {}) {
        if (!CaseTrackAuth.hasPermission('viewAuditLogs')) {
            return { logs: [], summary: {} };
        }

        let movements = CaseTrackDB.getAllMovements();

        // Filter by date range
        if (options.startDate) {
            movements = movements.filter(m => new Date(m.timestamp) >= new Date(options.startDate));
        }
        if (options.endDate) {
            movements = movements.filter(m => new Date(m.timestamp) <= new Date(options.endDate));
        }

        // Filter by file
        if (options.fileId) {
            movements = movements.filter(m => m.fileId === options.fileId);
        }

        // Filter by user
        if (options.userId) {
            movements = movements.filter(m =>
                m.fromCustodian === options.userId ||
                m.toCustodian === options.userId ||
                m.loggedBy === options.userId
            );
        }

        // Enrich and format
        const logs = movements.map(m => ({
            ...m,
            file: CaseTrackDB.getFile(m.fileId),
            fromUserInfo: CaseTrackDB.getUser(m.fromCustodian),
            toUserInfo: CaseTrackDB.getUser(m.toCustodian),
            loggedByInfo: CaseTrackDB.getUser(m.loggedBy),
            formattedTimestamp: MovementTracker.formatDateTime(m.timestamp)
        })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return {
            logs,
            summary: {
                totalMovements: logs.length,
                acknowledged: logs.filter(l => l.acknowledged).length,
                pending: logs.filter(l => !l.acknowledged).length
            }
        };
    },

    /**
     * Export report as printable HTML
     */
    exportToPrintable(reportType, data) {
        const now = new Date();
        const user = CaseTrackAuth.getCurrentUser();

        let content = `
            <div class="report-header">
                <h1>CaseTrack KE - ${reportType}</h1>
                <p>Generated: ${now.toLocaleString('en-KE')}</p>
                <p>Generated by: ${user?.name || 'System'}</p>
            </div>
        `;

        // Add report-specific content based on type
        switch (reportType) {
            case 'Custodian Report':
                content += this.formatCustodianReportHTML(data);
                break;
            case 'Deadline Report':
                content += this.formatDeadlineReportHTML(data);
                break;
            case 'Risk Report':
                content += this.formatRiskReportHTML(data);
                break;
            case 'Audit Log':
                content += this.formatAuditLogHTML(data);
                break;
        }

        return content;
    },

    formatCustodianReportHTML(data) {
        let html = '<table class="report-table"><thead><tr><th>Custodian</th><th>Role</th><th>Files</th><th>Pending Ack</th><th>Avg Days</th></tr></thead><tbody>';

        data.report.forEach(r => {
            html += `<tr>
                <td>${r.user?.name || 'Unknown'}</td>
                <td>${r.user?.role || 'N/A'}</td>
                <td>${r.fileCount}</td>
                <td>${r.unacknowledged}</td>
                <td>${r.avgDaysInPossession} days</td>
            </tr>`;
        });

        html += '</tbody></table>';
        return html;
    },

    formatDeadlineReportHTML(data) {
        let html = '<h2>Overdue</h2>';
        if (data.overdue.length === 0) {
            html += '<p>No overdue deadlines</p>';
        } else {
            html += '<table class="report-table"><thead><tr><th>File</th><th>Type</th><th>Due Date</th><th>Days Overdue</th></tr></thead><tbody>';
            data.overdue.forEach(d => {
                html += `<tr class="overdue">
                    <td>${d.file?.caseName || 'Unknown'}</td>
                    <td>${d.type}</td>
                    <td>${d.formattedDate}</td>
                    <td>${Math.abs(d.daysUntil)} days</td>
                </tr>`;
            });
            html += '</tbody></table>';
        }

        html += '<h2>Upcoming</h2>';
        html += '<table class="report-table"><thead><tr><th>File</th><th>Type</th><th>Due Date</th><th>Days Until</th></tr></thead><tbody>';
        data.upcoming.forEach(d => {
            html += `<tr class="${d.urgency}">
                <td>${d.file?.caseName || 'Unknown'}</td>
                <td>${d.type}</td>
                <td>${d.formattedDate}</td>
                <td>${d.daysUntil} days</td>
            </tr>`;
        });
        html += '</tbody></table>';

        return html;
    },

    formatRiskReportHTML(data) {
        let html = '<table class="report-table"><thead><tr><th>Severity</th><th>Type</th><th>File</th><th>Description</th><th>Recommendation</th></tr></thead><tbody>';

        data.risks.forEach(r => {
            html += `<tr class="risk-${r.severity}">
                <td><span class="severity-badge ${r.severity}">${r.severity.toUpperCase()}</span></td>
                <td>${r.type}</td>
                <td>${r.file?.caseName || 'N/A'}</td>
                <td>${r.description}</td>
                <td>${r.recommendation}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        return html;
    },

    formatAuditLogHTML(data) {
        let html = '<table class="report-table"><thead><tr><th>Timestamp</th><th>File</th><th>From</th><th>To</th><th>Purpose</th><th>Ack</th></tr></thead><tbody>';

        data.logs.forEach(l => {
            html += `<tr>
                <td>${l.formattedTimestamp}</td>
                <td>${l.file?.fileId || 'Unknown'}</td>
                <td>${l.fromUserInfo?.name || 'N/A'}</td>
                <td>${l.toUserInfo?.name || 'N/A'}</td>
                <td>${l.purpose}</td>
                <td>${l.acknowledged ? '✓' : '—'}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        return html;
    }
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Reports;
}
