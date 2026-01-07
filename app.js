/**
 * CaseTrack KE — Main Application
 * Law Firm File Tracking System
 * UI Controllers and Event Handlers
 */

class CaseTrackKE {
    constructor() {
        this.currentView = 'dashboard';
        this.theme = localStorage.getItem('casetrack-theme') || 'dark';
        this.notificationsPanelOpen = false;
    }

    async init() {
        // Initialize sample data if needed (only locally)
        SampleData.init();

        // Apply theme
        this.applyTheme();

        this.bindElements();

        // Initial background sync
        await CaseTrackDB.syncWithBackend();

        // Check for existing session
        if (CaseTrackAuth.init()) {
            this.setupUI();
        } else {
            // Server should have redirected to /login, but this is a fallback for client-side routing
            window.location.href = '/login';
        }
    }

    async setupUI() {
        this.bindEvents();

        // Connect WebSockets for real-time notifications
        const currentUser = CaseTrackAuth.getCurrentUser();
        if (currentUser) {
            WSClient.connect(currentUser.userId);
        }

        this.updateUserInfo();
        this.updateQuickStats();
        this.loadDashboard();

        // Run alert checks
        AlertEngine.runAlertCheck();
        this.updateNotificationBadge();
    }

    /**
     * Synchronize with backend and refresh UI
     */
    async syncWithBackend() {
        const success = await CaseTrackDB.syncWithBackend();
        if (success) {
            this.updateQuickStats();
            this.loadDashboard();
            this.updateNotificationBadge();
        }
    }

    /**
     * Bind DOM elements
     */
    bindElements() {
        // Header
        this.mobileMenuBtn = document.getElementById('mobileMenuBtn');
        this.sidebar = document.getElementById('sidebar');
        this.notificationBtn = document.getElementById('notificationBtn');
        this.notificationBadge = document.getElementById('notificationBadge');
        this.themeToggle = document.getElementById('themeToggle');
        this.logoutBtn = document.getElementById('logoutBtn');
        this.userRole = document.getElementById('userRole');
        this.userName = document.getElementById('userName');

        // Navigation
        this.navBtns = document.querySelectorAll('.nav-btn');
        this.views = document.querySelectorAll('.view');

        // Modals
        this.fileDetailsModal = document.getElementById('fileDetailsModal');
        this.newFileModal = document.getElementById('newFileModal');
        this.movementModal = document.getElementById('movementModal');
        this.deadlineModal = document.getElementById('deadlineModal');
        this.notificationsPanel = document.getElementById('notificationsPanel');

        // Action buttons
        this.newFileBtn = document.getElementById('newFileBtn');
        this.newMovementBtn = document.getElementById('newMovementBtn');
        this.newDeadlineBtn = document.getElementById('newDeadlineBtn');

        // Quick stats
        this.statActiveFiles = document.getElementById('statActiveFiles');
        this.statOverdue = document.getElementById('statOverdue');
        this.statPending = document.getElementById('statPending');
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Mobile menu
        this.mobileMenuBtn?.addEventListener('click', () => this.toggleMobileMenu());

        // Theme toggle
        this.themeToggle?.addEventListener('click', () => this.toggleTheme());

        // Logout
        this.logoutBtn?.addEventListener('click', () => this.logout());

        // Notifications
        this.notificationBtn?.addEventListener('click', () => this.toggleNotificationsPanel());
        document.getElementById('markAllRead')?.addEventListener('click', () => this.markAllAlertsRead());

        // Navigation
        this.navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.switchView(view);
            });
        });

        // New file
        this.newFileBtn?.addEventListener('click', () => this.openNewFileModal());
        document.getElementById('closeNewFile')?.addEventListener('click', () => this.closeModal('newFileModal'));
        document.getElementById('cancelNewFile')?.addEventListener('click', () => this.closeModal('newFileModal'));
        document.getElementById('newFileForm')?.addEventListener('submit', (e) => this.handleNewFileSubmit(e));

        // Movement
        this.newMovementBtn?.addEventListener('click', () => this.openMovementModal());
        document.getElementById('closeMovement')?.addEventListener('click', () => this.closeModal('movementModal'));
        document.getElementById('cancelMovement')?.addEventListener('click', () => this.closeModal('movementModal'));
        document.getElementById('movementForm')?.addEventListener('submit', (e) => this.handleMovementSubmit(e));

        // Deadline
        this.newDeadlineBtn?.addEventListener('click', () => this.openDeadlineModal());
        document.getElementById('closeDeadline')?.addEventListener('click', () => this.closeModal('deadlineModal'));
        document.getElementById('cancelDeadline')?.addEventListener('click', () => this.closeModal('deadlineModal'));
        document.getElementById('deadlineForm')?.addEventListener('submit', (e) => this.handleDeadlineSubmit(e));

        // 2FA Setup
        document.getElementById('start2FASetup')?.addEventListener('click', () => this.handle2FASetupStart());
        document.getElementById('complete2FASetup')?.addEventListener('click', () => this.handle2FASetupVerify());
        document.getElementById('close2FA')?.addEventListener('click', () => this.closeModal('twoFactorModal'));
        document.getElementById('finish2FASetup')?.addEventListener('click', () => this.closeModal('twoFactorModal'));

        // File details
        document.getElementById('closeFileDetails')?.addEventListener('click', () => this.closeModal('fileDetailsModal'));

        // File search
        document.getElementById('fileSearch')?.addEventListener('input', (e) => this.handleFileSearch(e.target.value));

        // Filters
        document.getElementById('statusFilter')?.addEventListener('change', () => this.loadFilesTable());
        document.getElementById('practiceAreaFilter')?.addEventListener('change', () => this.loadFilesTable());

        // Reports
        document.querySelectorAll('.report-card').forEach(card => {
            card.addEventListener('click', () => this.loadReport(card.dataset.report));
        });

        // View all alerts
        document.getElementById('viewAllAlerts')?.addEventListener('click', () => {
            this.toggleNotificationsPanel();
        });

        // Close modals on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay && overlay.id !== 'loginModal') {
                    this.closeModal(overlay.id);
                }
            });
        });

        // Close notifications panel on outside click
        document.addEventListener('click', (e) => {
            if (this.notificationsPanelOpen &&
                !this.notificationsPanel.contains(e.target) &&
                !this.notificationBtn.contains(e.target)) {
                this.toggleNotificationsPanel();
            }
        });
    }

    // ==========================================
    // NOTIFICATIONS & ALERTS
    // ==========================================

    showNotification(message, type = 'info') {
        if (typeof CaseTrackUI !== 'undefined' && CaseTrackUI.showToast) {
            CaseTrackUI.showToast(message, type);
        } else {
            // Fallback for app.js internal call
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.textContent = message;
            document.getElementById('toastContainer')?.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }
    }

    logout() {
        CaseTrackAuth.logout();
        location.reload();
    }

    updateUserInfo() {
        const user = CaseTrackAuth.getCurrentUser();
        if (!user) return;

        this.userRole.textContent = user.role;
        this.userName.textContent = user.name;

        // Update role info in sidebar
        const roleInfo = CaseTrackAuth.getRoleInfo(user.role);
        const roleInfoEl = document.getElementById('roleInfo');
        if (roleInfo && roleInfoEl) {
            roleInfoEl.innerHTML = `
                <div class="role-badge">
                    <span class="role-icon">${roleInfo.icon}</span>
                    <span class="role-name">${user.role}</span>
                </div>
                <ul class="role-capabilities">
                    ${roleInfo.capabilities.map(c => `<li>${c}</li>`).join('')}
                </ul>
            `;
        }

        // Show/hide reports button based on permission
        const reportsBtn = document.getElementById('reportsBtn');
        if (reportsBtn && !CaseTrackAuth.hasPermission('generateReports')) {
            reportsBtn.style.display = 'none';
        }

        // Show/hide new file button based on permission
        if (this.newFileBtn && !CaseTrackAuth.hasPermission('registerFiles')) {
            this.newFileBtn.style.display = 'none';
        }

        // Show/hide movement button based on permission
        if (this.newMovementBtn && !CaseTrackAuth.hasPermission('logMovements')) {
            this.newMovementBtn.style.display = 'none';
        }
    }

    // ==========================================
    // NAVIGATION
    // ==========================================

    switchView(viewName) {
        this.currentView = viewName;

        // Update navigation
        this.navBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewName);
        });

        // Update views
        this.views.forEach(view => {
            view.classList.toggle('active', view.id === `${viewName}View`);
        });

        // Load view content
        switch (viewName) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'files':
                this.loadFilesView();
                break;
            case 'movements':
                this.loadMovementsView();
                break;
            case 'deadlines':
                this.loadDeadlinesView();
                break;
            case 'reports':
                this.loadReportsView();
                break;
            case 'security':
                this.openModal('twoFactorModal');
                // Revert to previous view after choice or just keep it
                break;
        }

        // Close mobile menu
        this.sidebar.classList.remove('active');
    }

    toggleMobileMenu() {
        this.sidebar.classList.toggle('active');
    }

    // ==========================================
    // THEME
    // ==========================================

    toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('casetrack-theme', this.theme);
        this.applyTheme();
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
    }

    // ==========================================
    // NOTIFICATIONS
    // ==========================================

    toggleNotificationsPanel() {
        this.notificationsPanelOpen = !this.notificationsPanelOpen;
        this.notificationsPanel.classList.toggle('active', this.notificationsPanelOpen);

        if (this.notificationsPanelOpen) {
            this.loadNotifications();
        }
    }

    loadNotifications() {
        const list = document.getElementById('notificationsList');
        const alerts = AlertEngine.getMyAlerts();

        if (alerts.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔔</div>
                    <p>No notifications</p>
                </div>
            `;
            return;
        }

        list.innerHTML = alerts.slice(0, 20).map(alert => {
            const formatted = AlertEngine.formatAlert(alert);
            return `
                <div class="alert-item ${formatted.severityClass} ${alert.read ? '' : 'unread'}" data-alert-id="${alert.alertId}">
                    <span class="alert-icon">${formatted.icon}</span>
                    <div class="alert-content">
                        <div class="alert-message">${alert.message}</div>
                        <div class="alert-meta">
                            <span>${formatted.relativeTime}</span>
                            ${formatted.fileInfo ? `<span>File: ${formatted.fileInfo.id}</span>` : ''}
                        </div>
                    </div>
                    <div class="alert-actions">
                        <button onclick="caseTrack.dismissAlert('${alert.alertId}')" title="Dismiss">✕</button>
                    </div>
                </div>
            `;
        }).join('');

        // Mark as read on view
        alerts.filter(a => !a.read).forEach(a => AlertEngine.markRead(a.alertId));
        this.updateNotificationBadge();
    }

    markAllAlertsRead() {
        const alerts = AlertEngine.getMyAlerts();
        alerts.forEach(a => AlertEngine.markRead(a.alertId));
        this.updateNotificationBadge();
        this.loadNotifications();
    }

    dismissAlert(alertId) {
        AlertEngine.dismiss(alertId);
        this.loadNotifications();
        this.updateNotificationBadge();
    }

    updateNotificationBadge() {
        const count = AlertEngine.getUnreadCount();
        this.notificationBadge.textContent = count;
        this.notificationBadge.setAttribute('data-count', count);
    }

    // ==========================================
    // QUICK STATS
    // ==========================================

    updateQuickStats() {
        const stats = CaseTrackDB.getStatistics();
        this.statActiveFiles.textContent = stats.activeFiles;
        this.statOverdue.textContent = stats.overdueDeadlines;
        this.statPending.textContent = stats.unacknowledgedMovements;
    }

    // ==========================================
    // DASHBOARD VIEW
    // ==========================================

    loadDashboard() {
        this.updateDashboardStats();
        this.loadDashboardAlerts();
        this.loadUpcomingDeadlines();
        this.loadMyCustodyFiles();
    }

    updateDashboardStats() {
        const stats = Reports.getDashboardStats();

        document.getElementById('totalFiles').textContent = stats.totalFiles;
        document.getElementById('activeFilesCount').textContent = stats.activeFiles;
        document.getElementById('upcomingDeadlinesCount').textContent = stats.upcomingDeadlines;
        document.getElementById('overdueCount').textContent = stats.overdueDeadlines + stats.alerts.critical;
    }

    loadDashboardAlerts() {
        const alertsList = document.getElementById('alertsList');
        const alerts = AlertEngine.getMyAlerts().slice(0, 5);

        if (alerts.length === 0) {
            alertsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <p>No active alerts</p>
                </div>
            `;
            return;
        }

        alertsList.innerHTML = alerts.map(alert => {
            const formatted = AlertEngine.formatAlert(alert);
            return `
                <div class="alert-item ${formatted.severityClass}">
                    <span class="alert-icon">${formatted.icon}</span>
                    <div class="alert-content">
                        <div class="alert-message">${alert.message}</div>
                        <div class="alert-meta">
                            <span>${formatted.relativeTime}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    loadUpcomingDeadlines() {
        const list = document.getElementById('upcomingDeadlinesList');
        const report = Reports.getDeadlineReport(7);
        const deadlines = [...report.overdue, ...report.upcoming].slice(0, 5);

        if (deadlines.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <p>No upcoming deadlines</p>
                </div>
            `;
            return;
        }

        list.innerHTML = deadlines.map(d => `
            <div class="deadline-item" onclick="caseTrack.openFileDetails('${d.fileId}')">
                <div class="deadline-info">
                    <div class="deadline-type">${d.type}</div>
                    <div class="deadline-meta">${d.file?.caseName || 'Unknown file'}</div>
                </div>
                <span class="deadline-date deadline-${d.urgency}">${d.formattedDate}</span>
            </div>
        `).join('');
    }

    loadMyCustodyFiles() {
        const list = document.getElementById('myCustodyList');
        const dashboardFiles = FileManager.getDashboardFiles();
        const files = dashboardFiles.inMyCustody.slice(0, 5);

        if (files.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <p>No files in your custody</p>
                </div>
            `;
            return;
        }

        list.innerHTML = files.map(f => `
            <div class="file-item" onclick="caseTrack.openFileDetails('${f.fileId}')">
                <div class="file-info">
                    <div class="file-name">${f.caseName}</div>
                    <div class="file-meta">${f.fileId} • ${f.practiceArea}</div>
                </div>
                <span class="file-status status-${f.status.toLowerCase()}">${f.status}</span>
            </div>
        `).join('');
    }

    // ==========================================
    // FILES VIEW
    // ==========================================

    loadFilesView() {
        this.loadPracticeAreaFilter();
        this.loadFilesTable();
    }

    loadPracticeAreaFilter() {
        const select = document.getElementById('practiceAreaFilter');
        const options = FileManager.getFormOptions();

        select.innerHTML = '<option value="">All Practice Areas</option>' +
            options.practiceAreas.map(area =>
                `<option value="${area}">${area}</option>`
            ).join('');
    }

    loadFilesTable() {
        const tbody = document.getElementById('filesTableBody');
        const statusFilter = document.getElementById('statusFilter').value;
        const areaFilter = document.getElementById('practiceAreaFilter').value;

        let files = CaseTrackAuth.getVisibleFiles();

        // Apply filters
        if (statusFilter) {
            files = files.filter(f => f.status === statusFilter);
        }
        if (areaFilter) {
            files = files.filter(f => f.practiceArea === areaFilter);
        }

        if (files.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">No files found</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = files.map(f => {
            const custodian = CaseTrackDB.getUser(f.currentCustodian);
            return `
                <tr>
                    <td><strong>${f.fileId}</strong></td>
                    <td>${this.truncate(f.caseName, 40)}</td>
                    <td>${f.clientName}</td>
                    <td>${f.practiceArea}</td>
                    <td><span class="file-status status-${f.status.toLowerCase()}">${f.status}</span></td>
                    <td>${custodian?.name || 'Unknown'}</td>
                    <td class="table-actions">
                        <button onclick="caseTrack.openFileDetails('${f.fileId}')">View</button>
                        ${CaseTrackAuth.hasPermission('logMovements') ?
                    `<button onclick="caseTrack.openMovementModal('${f.fileId}')">Transfer</button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }

    handleFileSearch(query) {
        if (!query) {
            this.loadFilesTable();
            return;
        }

        const tbody = document.getElementById('filesTableBody');
        const files = FileManager.searchFiles(query);

        if (files.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">No files matching "${query}"</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = files.map(f => {
            const custodian = CaseTrackDB.getUser(f.currentCustodian);
            return `
                <tr>
                    <td><strong>${f.fileId}</strong></td>
                    <td>${this.truncate(f.caseName, 40)}</td>
                    <td>${f.clientName}</td>
                    <td>${f.practiceArea}</td>
                    <td><span class="file-status status-${f.status.toLowerCase()}">${f.status}</span></td>
                    <td>${custodian?.name || 'Unknown'}</td>
                    <td class="table-actions">
                        <button onclick="caseTrack.openFileDetails('${f.fileId}')">View</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ==========================================
    // FILE DETAILS
    // ==========================================

    openFileDetails(fileId) {
        const details = FileManager.getFileDetails(fileId);
        if (!details) {
            alert('File not found or access denied');
            return;
        }

        const title = document.getElementById('fileDetailsTitle');
        const body = document.getElementById('fileDetailsBody');

        title.textContent = details.fileId;

        const qrData = FileManager.generateQRCode(fileId);

        body.innerHTML = `
            <div class="file-details-grid">
                <div class="detail-item">
                    <span class="detail-label">Case Name</span>
                    <span class="detail-value">${details.caseName}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Client</span>
                    <span class="detail-value">${details.clientName}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Practice Area</span>
                    <span class="detail-value">${details.practiceArea}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Status</span>
                    <span class="detail-value"><span class="file-status status-${details.status.toLowerCase()}">${details.status}</span></span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Current Custodian</span>
                    <span class="detail-value">${details.custodianInfo?.name || 'Unknown'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Court/Jurisdiction</span>
                    <span class="detail-value">${details.courtJurisdiction || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Date Opened</span>
                    <span class="detail-value">${MovementTracker.formatDate(details.dateOpened)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Assigned Advocate(s)</span>
                    <span class="detail-value">${details.advocateInfo.map(a => a.name).join(', ') || 'None'}</span>
                </div>
            </div>
            
            ${details.notes ? `
                <div class="file-details-section">
                    <h4>Notes</h4>
                    <p>${details.notes}</p>
                </div>
            ` : ''}
            
            <div class="file-details-section">
                <h4>Upcoming Deadlines (${details.upcomingDeadlines.length})</h4>
                ${details.upcomingDeadlines.length > 0 ? `
                    <div class="deadlines-cards">
                        ${details.upcomingDeadlines.slice(0, 3).map(d => `
                            <div class="deadline-card ${new Date(d.dueDate) < new Date() ? 'overdue' : ''}">
                                <div class="deadline-card-header">
                                    <span class="deadline-card-type">${d.type}</span>
                                    <span class="deadline-card-date">${MovementTracker.formatDate(d.dueDate)}</span>
                                </div>
                                <div class="deadline-card-description">${d.description}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : '<p class="empty-state">No upcoming deadlines</p>'}
            </div>
            
            <div class="file-details-section">
                <h4>Movement History</h4>
                <div class="movements-timeline">
                    ${details.movements.slice(0, 5).map(m => `
                        <div class="movement-item ${m.acknowledged ? '' : 'pending'}">
                            <div class="movement-content">
                                <div class="movement-header">
                                    <span class="movement-details">
                                        ${m.fromUserInfo?.name || 'Registry'} → ${m.toUserInfo?.name || 'Unknown'}
                                    </span>
                                    <span class="movement-time">${m.relativeTime}</span>
                                </div>
                                <span class="movement-purpose">${m.purpose}</span>
                            </div>
                        </div>
                    `).join('') || '<p class="empty-state">No movement history</p>'}
                </div>
            </div>
            
            <div class="file-details-section attachments-section">
                <div class="attachments-header">
                    <h4>📎 Attachments</h4>
                    <button class="btn-text" onclick="FileUpload.openModal('${fileId}')">+ Add Files</button>
                </div>
                <div class="attachments-list" id="fileAttachments-${fileId}">
                    ${this.renderAttachments(fileId)}
                </div>
            </div>
            
            <div class="file-details-section">
                <h4>QR Code for Physical Tracking</h4>
                <div class="qr-code-container">
                    <div class="qr-code-generated" id="qrCodeContainer-${fileId}">
                        <!-- QR code will be generated here -->
                    </div>
                    <div>
                        <p><strong>Scan to track</strong></p>
                        <p style="font-size: 0.8rem; color: var(--text-muted);">Use QR scanner to log movements or verify file location</p>
                        <button class="btn-text" onclick="QRScanner.openScanner()" style="margin-top: 8px;">
                            📷 Open Scanner
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="form-actions">
                ${CaseTrackAuth.hasPermission('logMovements') ? `
                    <button class="btn-primary" onclick="caseTrack.openMovementModal('${fileId}')">
                        Transfer File
                    </button>
                ` : ''}
                <button class="btn-secondary" onclick="FileUpload.openModal('${fileId}')">
                    📎 Upload Documents
                </button>
                <button class="btn-secondary" onclick="caseTrack.closeModal('fileDetailsModal')">Close</button>
            </div>
        `;

        this.openModal('fileDetailsModal');

        // Generate real QR code after modal is shown
        setTimeout(() => {
            const qrContainer = document.getElementById(`qrCodeContainer-${fileId}`);
            if (qrContainer && typeof QRScanner !== 'undefined') {
                QRScanner.generateQRCode(fileId, qrContainer);
            }
        }, 100);
    }

    /**
     * Render attachments for a file
     */
    renderAttachments(fileId) {
        if (typeof FileUpload === 'undefined') {
            return '<p class="no-attachments">Loading...</p>';
        }

        const attachments = FileUpload.getAttachments(fileId);

        if (attachments.length === 0) {
            return '<p class="no-attachments">No documents attached</p>';
        }

        return attachments.map(att => `
            <div class="attachment-item">
                <div class="attachment-info">
                    <span class="attachment-icon">${FileUpload.getFileIcon(att.type)}</span>
                    <div class="attachment-details">
                        <span class="attachment-name">${att.name}</span>
                        <span class="attachment-meta">
                            ${FileUpload.formatFileSize(att.size)} • 
                            ${new Date(att.uploadedAt).toLocaleDateString()}
                        </span>
                    </div>
                </div>
                <div class="attachment-actions">
                    <button class="btn-text" onclick="FileUpload.downloadAttachment('${fileId}', '${att.id}')" title="Download">
                        ⬇️
                    </button>
                </div>
            </div>
        `).join('');
    }

    // ==========================================
    // MOVEMENTS VIEW
    // ==========================================

    loadMovementsView() {
        this.loadPendingAcknowledgments();
        this.loadRecentMovements();
    }

    loadPendingAcknowledgments() {
        const section = document.getElementById('pendingAckSection');
        const list = document.getElementById('pendingAckList');
        const pending = MovementTracker.getMyPendingAcknowledgments();

        if (pending.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        list.innerHTML = pending.map(m => `
            <div class="pending-item">
                <div class="pending-info">
                    <div class="pending-file">${m.file?.caseName || 'Unknown'}</div>
                    <div class="pending-meta">
                        From: ${m.fromUserInfo?.name || 'Registry'} • 
                        ${MovementTracker.getRelativeTime(new Date(m.timestamp))}
                    </div>
                </div>
                <div class="pending-actions">
                    <button class="btn-primary" onclick="caseTrack.acknowledgeMovement('${m.movementId}')">
                        Acknowledge
                    </button>
                </div>
            </div>
        `).join('');
    }

    loadRecentMovements() {
        const timeline = document.getElementById('movementsTimeline');
        const movements = CaseTrackDB.getAllMovements()
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 20);

        if (movements.length === 0) {
            timeline.innerHTML = '<div class="empty-state"><p>No movement records</p></div>';
            return;
        }

        timeline.innerHTML = movements.map(m => {
            const file = CaseTrackDB.getFile(m.fileId);
            const fromUser = CaseTrackDB.getUser(m.fromCustodian);
            const toUser = CaseTrackDB.getUser(m.toCustodian);

            return `
                <div class="movement-item ${m.acknowledged ? '' : 'pending'}">
                    <div class="movement-content">
                        <div class="movement-header">
                            <span class="movement-file">${file?.caseName || 'Unknown File'}</span>
                            <span class="movement-time">${MovementTracker.getRelativeTime(new Date(m.timestamp))}</span>
                        </div>
                        <div class="movement-details">
                            ${fromUser?.name || 'Registry'} → ${toUser?.name || 'Unknown'}
                            ${!m.acknowledged ? ' <em>(Pending acknowledgment)</em>' : ''}
                        </div>
                        <span class="movement-purpose">${m.purpose}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    acknowledgeMovement(movementId) {
        const result = MovementTracker.acknowledgeReceipt(movementId);
        if (result.success) {
            this.loadMovementsView();
            this.updateQuickStats();
            this.showNotification('File received and acknowledged');
        } else {
            alert('Error: ' + result.error);
        }
    }

    // ==========================================
    // DEADLINES VIEW
    // ==========================================

    loadDeadlinesView() {
        const report = Reports.getDeadlineReport(30);

        // Overdue
        const overdueSection = document.getElementById('overdueSection');
        const overdueList = document.getElementById('overdueList');

        if (report.overdue.length === 0) {
            overdueSection.style.display = 'none';
        } else {
            overdueSection.style.display = 'block';
            overdueList.innerHTML = report.overdue.map(d => this.renderDeadlineCard(d, true)).join('');
        }

        // This week
        const thisWeekList = document.getElementById('thisWeekList');
        const thisWeek = report.upcoming.filter(d => d.daysUntil <= 7);

        if (thisWeek.length === 0) {
            thisWeekList.innerHTML = '<div class="empty-state"><p>No deadlines this week</p></div>';
        } else {
            thisWeekList.innerHTML = thisWeek.map(d => this.renderDeadlineCard(d)).join('');
        }

        // Upcoming
        const upcomingList = document.getElementById('upcomingList');
        const upcoming = report.upcoming.filter(d => d.daysUntil > 7);

        if (upcoming.length === 0) {
            upcomingList.innerHTML = '<div class="empty-state"><p>No upcoming deadlines</p></div>';
        } else {
            upcomingList.innerHTML = upcoming.map(d => this.renderDeadlineCard(d)).join('');
        }
    }

    renderDeadlineCard(deadline, isOverdue = false) {
        return `
            <div class="deadline-card ${isOverdue ? 'overdue' : deadline.urgency === 'urgent' ? 'urgent' : ''}" 
                 onclick="caseTrack.openFileDetails('${deadline.fileId}')">
                <div class="deadline-card-header">
                    <span class="deadline-card-type">${deadline.type}</span>
                    <span class="deadline-card-date">
                        ${isOverdue ? Math.abs(deadline.daysUntil) + ' days overdue' : deadline.daysUntil + ' days'}
                    </span>
                </div>
                <div class="deadline-card-file">${deadline.file?.caseName || 'Unknown'}</div>
                <div class="deadline-card-description">${deadline.description}</div>
            </div>
        `;
    }

    // ==========================================
    // REPORTS VIEW
    // ==========================================

    loadReportsView() {
        document.getElementById('reportOutput').innerHTML = '';
    }

    loadReport(reportType) {
        const output = document.getElementById('reportOutput');

        switch (reportType) {
            case 'custodian':
                this.renderCustodianReport(output);
                break;
            case 'deadline':
                this.renderDeadlineReport(output);
                break;
            case 'bottleneck':
                this.renderBottleneckReport(output);
                break;
            case 'risk':
                this.renderRiskReport(output);
                break;
            case 'audit':
                this.renderAuditReport(output);
                break;
            case 'practice':
                this.renderPracticeAreaReport(output);
                break;
        }
    }

    renderCustodianReport(container) {
        const report = Reports.getCustodianReport();

        container.innerHTML = `
            <h3>Custodian Report</h3>
            <p style="color: var(--text-muted); margin-bottom: 16px;">
                Total: ${report.summary.totalFiles} files across ${report.summary.totalCustodians} custodians
            </p>
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Custodian</th>
                        <th>Role</th>
                        <th>Files</th>
                        <th>Pending Ack</th>
                        <th>Avg Days Held</th>
                    </tr>
                </thead>
                <tbody>
                    ${report.report.map(r => `
                        <tr>
                            <td>${r.user?.name || 'Unknown'}</td>
                            <td>${r.user?.role || 'N/A'}</td>
                            <td>${r.fileCount}</td>
                            <td>${r.unacknowledged > 0 ? `<span style="color: var(--status-warning)">${r.unacknowledged}</span>` : '0'}</td>
                            <td>${r.avgDaysInPossession} days</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    renderDeadlineReport(container) {
        const report = Reports.getDeadlineReport(30);

        container.innerHTML = `
            <h3>Deadline Report</h3>
            <p style="color: var(--text-muted); margin-bottom: 16px;">
                Overdue: ${report.summary.overdueCount} • This Week: ${report.summary.thisWeek} • Total Upcoming: ${report.summary.upcomingCount}
            </p>
            
            ${report.overdue.length > 0 ? `
                <h4 style="color: var(--status-danger); margin: 16px 0 8px;">Overdue (${report.overdue.length})</h4>
                <table class="report-table">
                    <thead><tr><th>File</th><th>Type</th><th>Days Overdue</th><th>Description</th></tr></thead>
                    <tbody>
                        ${report.overdue.map(d => `
                            <tr style="background: rgba(239,68,68,0.05)">
                                <td>${d.file?.caseName || 'Unknown'}</td>
                                <td>${d.type}</td>
                                <td>${Math.abs(d.daysUntil)} days</td>
                                <td>${d.description}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : ''}
            
            <h4 style="margin: 16px 0 8px;">Upcoming (${report.upcoming.length})</h4>
            <table class="report-table">
                <thead><tr><th>File</th><th>Type</th><th>Due Date</th><th>Days Until</th></tr></thead>
                <tbody>
                    ${report.upcoming.map(d => `
                        <tr>
                            <td>${d.file?.caseName || 'Unknown'}</td>
                            <td>${d.type}</td>
                            <td>${d.formattedDate}</td>
                            <td>${d.daysUntil} days</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    renderBottleneckReport(container) {
        const report = Reports.getBottleneckReport(7);

        container.innerHTML = `
            <h3>Bottleneck Report</h3>
            <p style="color: var(--text-muted); margin-bottom: 16px;">
                Files held for 7+ days without movement. High risk: ${report.summary.highRisk}
            </p>
            
            ${report.bottlenecks.length === 0 ? '<p>No bottlenecks detected</p>' : `
                <table class="report-table">
                    <thead><tr><th>Risk</th><th>File</th><th>Custodian</th><th>Days Held</th><th>Last Movement</th></tr></thead>
                    <tbody>
                        ${report.bottlenecks.map(b => `
                            <tr>
                                <td><span class="severity-badge ${b.riskLevel}">${b.riskLevel}</span></td>
                                <td>${b.file?.caseName || 'Unknown'}</td>
                                <td>${b.custodianInfo?.name || 'Unknown'}</td>
                                <td>${b.daysHeld} days</td>
                                <td>${b.lastMovementDate}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        `;
    }

    renderRiskReport(container) {
        const report = Reports.getRiskReport();

        container.innerHTML = `
            <h3>Risk Assessment Report</h3>
            <p style="color: var(--text-muted); margin-bottom: 16px;">
                High: ${report.summary.high} • Medium: ${report.summary.medium} • Low: ${report.summary.low}
            </p>
            
            ${report.risks.length === 0 ? '<p>No risks identified</p>' : `
                <table class="report-table">
                    <thead><tr><th>Severity</th><th>Type</th><th>File</th><th>Description</th><th>Recommendation</th></tr></thead>
                    <tbody>
                        ${report.risks.map(r => `
                            <tr>
                                <td><span class="severity-badge ${r.severity}">${r.severity}</span></td>
                                <td>${r.type}</td>
                                <td>${r.file?.caseName || 'N/A'}</td>
                                <td>${r.description}</td>
                                <td style="font-size: 0.8rem">${r.recommendation}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        `;
    }

    renderAuditReport(container) {
        const report = Reports.getAuditLogReport();

        container.innerHTML = `
            <h3>Audit Log</h3>
            <p style="color: var(--text-muted); margin-bottom: 16px;">
                Total movements: ${report.summary.totalMovements} • Acknowledged: ${report.summary.acknowledged} • Pending: ${report.summary.pending}
            </p>
            
            <table class="report-table">
                <thead><tr><th>Timestamp</th><th>File ID</th><th>From</th><th>To</th><th>Purpose</th><th>Ack</th></tr></thead>
                <tbody>
                    ${report.logs.slice(0, 50).map(l => `
                        <tr>
                            <td>${l.formattedTimestamp}</td>
                            <td>${l.file?.fileId || 'Unknown'}</td>
                            <td>${l.fromUserInfo?.name || 'N/A'}</td>
                            <td>${l.toUserInfo?.name || 'N/A'}</td>
                            <td>${l.purpose}</td>
                            <td>${l.acknowledged ? '✓' : '—'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    renderPracticeAreaReport(container) {
        const report = Reports.getByPracticeAreaReport();

        container.innerHTML = `
            <h3>Practice Area Breakdown</h3>
            <p style="color: var(--text-muted); margin-bottom: 16px;">
                Distribution of files across practice areas
            </p>
            
            <table class="report-table">
                <thead><tr><th>Practice Area</th><th>Total Files</th><th>Active</th><th>% of Total</th></tr></thead>
                <tbody>
                    ${report.summary.map(s => `
                        <tr>
                            <td>${s.area}</td>
                            <td>${s.count}</td>
                            <td>${s.activeCount}</td>
                            <td>${Math.round((s.count / CaseTrackDB.getAllFiles().length) * 100)}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    // ==========================================
    // MODALS
    // ==========================================

    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    // New File Modal
    openNewFileModal() {
        const options = FileManager.getFormOptions();

        // Populate practice areas
        document.getElementById('practiceArea').innerHTML =
            options.practiceAreas.map(area => `<option value="${area}">${area}</option>`).join('');

        // Populate advocates
        document.getElementById('assignedAdvocates').innerHTML =
            [...options.advocates, ...options.partners].map(u =>
                `<option value="${u.userId}">${u.name}</option>`
            ).join('');

        // Populate custodians
        document.getElementById('initialCustodian').innerHTML =
            options.users.map(u => `<option value="${u.userId}">${u.name} (${u.role})</option>`).join('');

        // Clear form
        document.getElementById('newFileForm').reset();

        this.openModal('newFileModal');
    }

    async handleNewFileSubmit(e) {
        e.preventDefault();
        const currentUser = CaseTrackAuth.getCurrentUser();

        const fileData = {
            caseName: document.getElementById('caseName').value,
            clientName: document.getElementById('clientName').value,
            practiceArea: document.getElementById('practiceArea').value,
            courtJurisdiction: document.getElementById('courtJurisdiction').value,
            assignedAdvocates: Array.from(document.getElementById('assignedAdvocates').selectedOptions).map(o => o.value),
            currentCustodian: document.getElementById('initialCustodian').value,
            notes: document.getElementById('fileNotes').value,
            createdBy: currentUser?.userId
        };

        const newFile = await CaseTrackDB.createFile(fileData);
        if (newFile) {
            this.closeModal('newFileModal');
            this.showNotification(`File ${newFile.fileId} registered successfully`);
            this.loadFilesTable();
            this.updateQuickStats();
            this.loadDashboard();
        }
    }

    // Movement Modal
    openMovementModal(preselectedFileId = null) {
        const options = FileManager.getFormOptions();
        const files = CaseTrackAuth.getVisibleFiles().filter(f => f.status === 'Active');

        // Populate files
        const fileSelect = document.getElementById('movementFile');
        fileSelect.innerHTML = files.map(f =>
            `<option value="${f.fileId}" ${f.fileId === preselectedFileId ? 'selected' : ''}>${f.fileId} - ${this.truncate(f.caseName, 30)}</option>`
        ).join('');

        // Populate custodians
        document.getElementById('movementTo').innerHTML =
            options.users.map(u => `<option value="${u.userId}">${u.name} (${u.role})</option>`).join('');

        // Populate purposes
        document.getElementById('movementPurpose').innerHTML =
            MovementTracker.getMovementPurposes().map(p => `<option value="${p}">${p}</option>`).join('');

        // Clear notes
        document.getElementById('movementNotes').value = '';

        this.openModal('movementModal');
    }

    async handleMovementSubmit(e) {
        e.preventDefault();
        const currentUser = CaseTrackAuth.getCurrentUser();

        const movementData = {
            fileId: document.getElementById('movementFile').value,
            toCustodian: document.getElementById('movementTo').value,
            purpose: document.getElementById('movementPurpose').value,
            notes: document.getElementById('movementNotes').value,
            loggedBy: currentUser?.userId,
            fromCustodian: currentUser?.userId
        };

        const movement = await CaseTrackDB.logMovement(movementData);
        if (movement) {
            this.closeModal('movementModal');
            this.showNotification(`File ${movementData.fileId} transfer logged`);
            this.loadMovementsView();
            this.updateQuickStats();
            this.loadDashboard();
        }
    }

    async acknowledgeReceipt(movementId) {
        const currentUser = CaseTrackAuth.getCurrentUser();
        const result = await CaseTrackDB.acknowledgeMovement(movementId, currentUser.userId);
        if (result) {
            this.showNotification('File receipt acknowledged');
            this.loadMovementsView();
            this.updateQuickStats();
            this.loadDashboard();
            AlertEngine.runAlertCheck();
        }
    }

    // Deadline Modal
    openDeadlineModal(preselectedFileId = null) {
        const files = CaseTrackAuth.getVisibleFiles().filter(f => f.status === 'Active');

        // Populate files
        const fileSelect = document.getElementById('deadlineFile');
        fileSelect.innerHTML = files.map(f =>
            `<option value="${f.fileId}" ${f.fileId === preselectedFileId ? 'selected' : ''}>${f.fileId} - ${this.truncate(f.caseName, 30)}</option>`
        ).join('');

        // Populate types
        document.getElementById('deadlineType').innerHTML =
            CaseTrackDB.DEADLINE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');

        // Clear form
        document.getElementById('deadlineDate').value = '';
        document.getElementById('deadlineDescription').value = '';

        this.openModal('deadlineModal');
    }

    async handleDeadlineSubmit(e) {
        e.preventDefault();
        const currentUser = CaseTrackAuth.getCurrentUser();

        const deadlineData = {
            fileId: document.getElementById('deadlineFile').value,
            type: document.getElementById('deadlineType').value,
            dueDate: document.getElementById('deadlineDate').value,
            description: document.getElementById('deadlineDescription').value,
            createdBy: currentUser?.userId
        };

        const deadline = await CaseTrackDB.createDeadline(deadlineData);
        if (deadline) {
            this.closeModal('deadlineModal');
            this.showNotification('Deadline added successfully');
            this.loadDeadlinesView();
            this.updateQuickStats();
            this.loadDashboard();
            AlertEngine.runAlertCheck();
        }
    }

    // ==========================================
    // 2FA SETUP
    // ==========================================

    async handle2FASetupStart() {
        try {
            const data = await APIClient.setup2FA();
            if (data && data.qrCodeUrl) {
                document.getElementById('setup2FA-Step1').style.display = 'none';
                document.getElementById('setup2FA-Step2').style.display = 'block';
                document.getElementById('qrcode').innerHTML = `<img src="${data.qrCodeUrl}" style="width: 200px; height: 200px;">`;
                document.getElementById('twoFactorSecretDisplay').textContent = data.secret;
            }
        } catch (err) {
            this.showNotification('Failed to initialize 2FA setup', 'error');
        }
    }

    async handle2FASetupVerify() {
        const code = document.getElementById('verify2FACode').value;
        if (!code) return;

        try {
            const data = await APIClient.verify2FA(code);
            if (data.success) {
                document.getElementById('setup2FA-Step2').style.display = 'none';
                document.getElementById('setup2FA-Success').style.display = 'block';
                this.showNotification('Two-Factor Authentication enabled', 'success');
            }
        } catch (err) {
            this.showNotification('Invalid verification code', 'error');
        }
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    truncate(str, length) {
        if (!str) return '';
        return str.length > length ? str.substring(0, length) + '...' : str;
    }

    /**
     * Show toast notification
     */
    showNotification(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) {
            console.log('Toast:', message);
            return;
        }

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;

        container.appendChild(toast);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.animation = 'slideIn 0.3s ease reverse';
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }
}

// Global reference
let caseTrack;

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    caseTrack = new CaseTrackKE();
    caseTrack.init();
});
