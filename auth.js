/**
 * CaseTrack KE — Authentication & Authorization
 * Role-Based Access Control System
 */

const CaseTrackAuth = {
    STORAGE_KEY: 'casetrack_session',

    currentUser: null,

    // Permission Matrix
    PERMISSIONS: {
        Clerk: {
            registerFiles: true,
            logMovements: true,
            updateFileStatus: true,
            viewAssignedFiles: true,
            viewAllFiles: false,
            requestFiles: true,
            uploadDocuments: false,
            generateReports: false,
            viewAuditLogs: false,
            manageUsers: false
        },
        Advocate: {
            registerFiles: false,
            logMovements: false,
            updateFileStatus: false,
            viewAssignedFiles: true,
            viewAllFiles: false,
            requestFiles: true,
            uploadDocuments: true,
            generateReports: false,
            viewAuditLogs: false,
            manageUsers: false
        },
        Partner: {
            registerFiles: true,
            logMovements: true,
            updateFileStatus: true,
            viewAssignedFiles: true,
            viewAllFiles: true,
            requestFiles: true,
            uploadDocuments: true,
            generateReports: true,
            viewAuditLogs: true,
            manageUsers: true
        }
    },

    /**
     * Initialize authentication - check for existing session
     */
    init() {
        const session = this.loadSession();
        if (session && session.userId) {
            const user = CaseTrackDB.getUser(session.userId);
            if (user && user.active) {
                this.currentUser = user;
                return true;
            }
        }
        this.currentUser = null;
        return false;
    },

    /**
     * Login user by selecting from user list (simplified for demo)
     */
    login(userId) {
        const user = CaseTrackDB.getUser(userId);
        if (!user || !user.active) {
            return { success: false, error: 'User not found or inactive' };
        }

        this.currentUser = user;
        this.saveSession({
            userId: user.userId,
            loginTime: new Date().toISOString()
        });

        return { success: true, user };
    },

    /**
     * Logout current user
     */
    logout() {
        this.currentUser = null;
        localStorage.removeItem(this.STORAGE_KEY);
        return true;
    },

    /**
     * Check if user is logged in
     */
    isLoggedIn() {
        return this.currentUser !== null;
    },

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.currentUser;
    },

    /**
     * Get current user's role
     */
    getCurrentRole() {
        return this.currentUser ? this.currentUser.role : null;
    },

    /**
     * Check if current user has a specific permission
     */
    hasPermission(permission) {
        if (!this.currentUser) return false;
        const role = this.currentUser.role;
        return this.PERMISSIONS[role] && this.PERMISSIONS[role][permission] === true;
    },

    /**
     * Check if current user can view a specific file
     */
    canViewFile(file) {
        if (!this.currentUser) return false;

        // Partners can view all files
        if (this.hasPermission('viewAllFiles')) return true;

        // Others can only view files assigned to them or where they are custodian
        const userId = this.currentUser.userId;
        return (
            file.currentCustodian === userId ||
            (file.assignedAdvocates && file.assignedAdvocates.includes(userId))
        );
    },

    /**
     * Get files visible to current user
     */
    getVisibleFiles() {
        if (!this.currentUser) return [];

        const allFiles = CaseTrackDB.getAllFiles();

        if (this.hasPermission('viewAllFiles')) {
            return allFiles;
        }

        const userId = this.currentUser.userId;
        return allFiles.filter(file =>
            file.currentCustodian === userId ||
            (file.assignedAdvocates && file.assignedAdvocates.includes(userId))
        );
    },

    /**
     * Get permission summary for current user
     */
    getPermissionSummary() {
        if (!this.currentUser) {
            return { role: null, permissions: {} };
        }

        return {
            role: this.currentUser.role,
            permissions: this.PERMISSIONS[this.currentUser.role] || {}
        };
    },

    /**
     * Require permission - throws if not authorized
     */
    requirePermission(permission, action = 'perform this action') {
        if (!this.isLoggedIn()) {
            throw new Error('You must be logged in to ' + action);
        }
        if (!this.hasPermission(permission)) {
            throw new Error(`Your role (${this.currentUser.role}) is not authorized to ${action}`);
        }
        return true;
    },

    /**
     * Session persistence
     */
    saveSession(session) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(session));
        } catch (e) {
            console.error('CaseTrack Auth: Session save error', e);
        }
    },

    loadSession() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('CaseTrack Auth: Session load error', e);
            return null;
        }
    },

    /**
     * Get role display information
     */
    getRoleInfo(role) {
        const roleInfo = {
            Clerk: {
                icon: '📋',
                color: '#10b981',
                description: 'Registry & File Management',
                capabilities: [
                    'Register new files',
                    'Log file movements',
                    'Update file status',
                    'View files in custody'
                ]
            },
            Advocate: {
                icon: '⚖️',
                color: '#6366f1',
                description: 'Case Handling & Documentation',
                capabilities: [
                    'View assigned files',
                    'Request files from registry',
                    'Upload digital documents',
                    'Receive deadline alerts'
                ]
            },
            Partner: {
                icon: '👔',
                color: '#d4a853',
                description: 'Full Oversight & Management',
                capabilities: [
                    'View all files',
                    'Generate reports',
                    'Access audit logs',
                    'Manage users',
                    'Escalation handling'
                ]
            }
        };

        return roleInfo[role] || null;
    }
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CaseTrackAuth;
}
