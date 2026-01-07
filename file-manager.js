/**
 * CaseTrack KE — File Manager
 * File registration and management operations
 */

const FileManager = {

    /**
     * Register a new file
     */
    registerFile(formData) {
        try {
            CaseTrackAuth.requirePermission('registerFiles', 'register new files');

            // Validate required fields
            if (!formData.caseName || !formData.clientName) {
                return { success: false, error: 'Case name and client name are required' };
            }

            if (!formData.currentCustodian) {
                return { success: false, error: 'Initial custodian must be specified' };
            }

            const file = CaseTrackDB.createFile({
                ...formData,
                createdBy: CaseTrackAuth.getCurrentUser()?.userId
            });

            return { success: true, file };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    /**
     * Update file metadata
     */
    updateFile(fileId, updates) {
        try {
            CaseTrackAuth.requirePermission('updateFileStatus', 'update file information');

            const file = CaseTrackDB.updateFile(fileId, updates);
            if (!file) {
                return { success: false, error: 'File not found' };
            }

            return { success: true, file };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    /**
     * Change file status
     */
    changeStatus(fileId, newStatus, notes = '') {
        try {
            CaseTrackAuth.requirePermission('updateFileStatus', 'change file status');

            const validStatuses = CaseTrackDB.FILE_STATUSES;
            if (!validStatuses.includes(newStatus)) {
                return { success: false, error: 'Invalid status' };
            }

            const updates = { status: newStatus };
            if (newStatus === 'Closed') {
                updates.dateClosed = new Date().toISOString();
            }

            const file = CaseTrackDB.updateFile(fileId, updates);

            // Log status change in movement log
            CaseTrackDB.logMovement({
                fileId,
                fromCustodian: file.currentCustodian,
                toCustodian: file.currentCustodian,
                purpose: `Status Change: ${newStatus}`,
                notes: notes || `File status changed to ${newStatus}`,
                loggedBy: CaseTrackAuth.getCurrentUser()?.userId
            });

            return { success: true, file };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    /**
     * Link digital document to file
     */
    linkDocument(fileId, documentInfo) {
        try {
            CaseTrackAuth.requirePermission('uploadDocuments', 'link documents');

            const file = CaseTrackDB.getFile(fileId);
            if (!file) {
                return { success: false, error: 'File not found' };
            }

            const linkedFiles = file.linkedDigitalFiles || [];
            linkedFiles.push({
                id: `DOC-${Date.now()}`,
                name: documentInfo.name,
                type: documentInfo.type || 'document',
                uploadedAt: new Date().toISOString(),
                uploadedBy: CaseTrackAuth.getCurrentUser()?.userId,
                description: documentInfo.description || ''
            });

            const updated = CaseTrackDB.updateFile(fileId, { linkedDigitalFiles: linkedFiles });
            return { success: true, file: updated };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    /**
     * Add deadline to file
     */
    addDeadline(fileId, deadlineData) {
        try {
            const file = CaseTrackDB.getFile(fileId);
            if (!file) {
                return { success: false, error: 'File not found' };
            }

            if (!deadlineData.dueDate) {
                return { success: false, error: 'Due date is required' };
            }

            const deadline = CaseTrackDB.createDeadline({
                fileId,
                type: deadlineData.type || 'Other',
                dueDate: deadlineData.dueDate,
                description: deadlineData.description || '',
                createdBy: CaseTrackAuth.getCurrentUser()?.userId
            });

            return { success: true, deadline };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    /**
     * Mark deadline as completed
     */
    completeDeadline(deadlineId) {
        try {
            const deadline = CaseTrackDB.updateDeadline(deadlineId, {
                status: 'Completed',
                completedAt: new Date().toISOString(),
                completedBy: CaseTrackAuth.getCurrentUser()?.userId
            });

            if (!deadline) {
                return { success: false, error: 'Deadline not found' };
            }

            return { success: true, deadline };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    /**
     * Get file with all related data
     */
    getFileDetails(fileId) {
        const file = CaseTrackDB.getFile(fileId);
        if (!file) return null;

        // Check view permission
        if (!CaseTrackAuth.canViewFile(file)) {
            return null;
        }

        const movements = CaseTrackDB.getFileMovements(fileId);
        const deadlines = CaseTrackDB.getFileDeadlines(fileId);
        const custodian = CaseTrackDB.getUser(file.currentCustodian);
        const advocates = file.assignedAdvocates?.map(id => CaseTrackDB.getUser(id)).filter(Boolean) || [];

        return {
            ...file,
            custodianInfo: custodian,
            advocateInfo: advocates,
            movements,
            deadlines,
            upcomingDeadlines: deadlines.filter(d => d.status === 'Pending'),
            overdueDeadlines: deadlines.filter(d => {
                return d.status === 'Pending' && new Date(d.dueDate) < new Date();
            })
        };
    },

    /**
     * Search files
     */
    searchFiles(query) {
        const allResults = CaseTrackDB.searchFiles(query);

        // Filter by visibility
        if (CaseTrackAuth.hasPermission('viewAllFiles')) {
            return allResults;
        }

        return allResults.filter(f => CaseTrackAuth.canViewFile(f));
    },

    /**
     * Get files for current user's dashboard
     */
    getDashboardFiles() {
        const files = CaseTrackAuth.getVisibleFiles();
        const user = CaseTrackAuth.getCurrentUser();

        // Categorize files
        const myFiles = files.filter(f => f.currentCustodian === user?.userId);
        const assignedFiles = files.filter(f =>
            f.assignedAdvocates?.includes(user?.userId) && f.currentCustodian !== user?.userId
        );

        // Get files with upcoming deadlines
        const upcomingDeadlines = CaseTrackDB.getUpcomingDeadlines(7);
        const filesWithDeadlines = files.filter(f =>
            upcomingDeadlines.some(d => d.fileId === f.fileId)
        );

        return {
            inMyCustody: myFiles,
            assignedToMe: assignedFiles,
            withUpcomingDeadlines: filesWithDeadlines,
            total: files.length
        };
    },

    /**
     * Generate QR code data for file
     */
    generateQRCode(fileId) {
        const file = CaseTrackDB.getFile(fileId);
        if (!file) return null;

        return {
            data: JSON.stringify({
                id: file.fileId,
                case: file.caseName,
                client: file.clientName,
                timestamp: new Date().toISOString()
            }),
            fileId: file.fileId,
            caseName: file.caseName
        };
    },

    /**
     * Get file by QR scan (parse QR data)
     */
    getFileByQR(qrData) {
        try {
            const parsed = JSON.parse(qrData);
            if (parsed.id) {
                return CaseTrackDB.getFile(parsed.id);
            }
        } catch (e) {
            // Try direct ID match
            return CaseTrackDB.getFile(qrData);
        }
        return null;
    },

    /**
     * Get form options for dropdowns
     */
    getFormOptions() {
        return {
            practiceAreas: CaseTrackDB.PRACTICE_AREAS,
            statuses: CaseTrackDB.FILE_STATUSES,
            deadlineTypes: CaseTrackDB.DEADLINE_TYPES,
            users: CaseTrackDB.getAllUsers().filter(u => u.active),
            clerks: CaseTrackDB.getUsersByRole('Clerk'),
            advocates: CaseTrackDB.getUsersByRole('Advocate'),
            partners: CaseTrackDB.getUsersByRole('Partner')
        };
    }
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileManager;
}
