/**
 * CaseTrack KE — API Client
 * Communication layer with the backend server
 */

const APIClient = {
    // Dynamically determine API base URL based on current location
    get baseURL() {
        return `${window.location.origin}/api`;
    },
    isEnabled: true,

    /**
     * Generic fetch wrapper
     */
    async request(endpoint, options = {}) {
        if (!this.isEnabled) return null;

        const url = `${this.baseURL}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };

        try {
            const response = await fetch(url, { ...defaultOptions, ...options });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'API Request failed');
            }
            return await response.json();
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    },

    // Users
    async getUsers() {
        return this.request('/users');
    },

    // Files
    async getFiles() {
        return this.request('/files');
    },

    async registerFile(fileData) {
        return this.request('/files', {
            method: 'POST',
            body: JSON.stringify(fileData)
        });
    },

    // Movements
    async getMovements() {
        return this.request('/movements');
    },

    async logMovement(movementData) {
        return this.request('/movements', {
            method: 'POST',
            body: JSON.stringify(movementData)
        });
    },

    async acknowledgeMovement(movementId) {
        return this.request(`/movements/${movementId}/acknowledge`, {
            method: 'POST'
        });
    },

    // Deadlines
    async getDeadlines() {
        return this.request('/deadlines');
    },

    async addDeadline(deadlineData) {
        return this.request('/deadlines', {
            method: 'POST',
            body: JSON.stringify(deadlineData)
        });
    },

    // Alerts
    async getAlerts() {
        return this.request('/alerts');
    },

    async createAlert(alertData) {
        return this.request('/alerts', {
            method: 'POST',
            body: JSON.stringify(alertData)
        });
    },

    async markAlertsRead() {
        return this.request('/alerts/read', {
            method: 'POST'
        });
    },

    // Attachments
    async getAttachments(fileId) {
        return this.request(`/attachments/${fileId}`);
    },

    async uploadAttachment(attachmentData) {
        return this.request('/attachments', {
            method: 'POST',
            body: JSON.stringify(attachmentData)
        });
    }
};
