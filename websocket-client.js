/**
 * CaseTrack KE — WebSocket Client
 * Real-time notifications and updates
 */

const WSClient = {
    socket: null,
    reconnectInterval: 5000,

    // Dynamically determine WebSocket URL based on current location
    get wsURL() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}`;
    },

    /**
     * Connect to WebSocket server
     */
    connect(userId) {
        if (!userId) return;

        this.socket = new WebSocket(this.wsURL);

        this.socket.onopen = () => {
            console.log('WebSocket Connected');
            // Authenticate session
            this.send({
                type: 'auth',
                userId: userId
            });
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };

        this.socket.onclose = () => {
            console.log('WebSocket Disconnected. Reconnecting...');
            setTimeout(() => this.connect(userId), this.reconnectInterval);
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket Error:', error);
        };
    },

    /**
     * Send message to server
     */
    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        }
    },

    /**
     * Handle incoming messages
     */
    handleMessage(data) {
        console.log('WS Message Received:', data);

        switch (data.type) {
            case 'movement_received':
                this.showToast(data.message, 'info');
                this.refreshUI();
                break;
            case 'movement_logged':
                this.refreshUI();
                break;
            case 'movement_acknowledged':
                this.refreshUI();
                break;
            case 'deadline_added':
                this.showToast(`New deadline added for file ${data.fileId}`, 'info');
                this.refreshUI();
                break;
            case 'file_created':
                this.showToast(`New case file registered: ${data.caseName}`, 'success');
                this.refreshUI();
                break;
            default:
                // Silently handle unknown message types (may be broadcasts from other features)
                if (data.type) {
                    console.debug('WS message type not handled by client:', data.type);
                }
        }
    },

    /**
     * Show notification via app instance
     */
    showToast(message, type) {
        if (typeof caseTrack !== 'undefined') {
            caseTrack.showNotification(message, type);
        }
    },

    /**
     * Trigger UI refresh
     */
    refreshUI() {
        if (typeof caseTrack !== 'undefined') {
            caseTrack.updateQuickStats();
            caseTrack.loadDashboard();
            caseTrack.syncWithBackend(); // Method to be added to database.js/app.js
        }
    }
};
