/**
 * CaseTrack KE — QR Scanner Module
 * Real QR code generation and camera-based scanning
 */

const QRScanner = {
    scanner: null,
    isScanning: false,

    /**
     * Initialize QR scanner module
     */
    init() {
        this.bindElements();
        this.bindEvents();
    },

    /**
     * Bind DOM elements
     */
    bindElements() {
        this.modal = document.getElementById('qrScannerModal');
        this.readerView = document.getElementById('qrReaderView');
        this.startBtn = document.getElementById('startScanBtn');
        this.stopBtn = document.getElementById('stopScanBtn');
        this.resultDiv = document.getElementById('qrScanResult');
        this.scanMessage = document.getElementById('scanMessage');
        this.scanActions = document.getElementById('scanActions');
        this.closeBtn = document.getElementById('closeQrScanner');
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        this.closeBtn?.addEventListener('click', () => this.closeScanner());
        this.startBtn?.addEventListener('click', () => this.startScanning());
        this.stopBtn?.addEventListener('click', () => this.stopScanning());

        // Close on overlay click
        this.modal?.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeScanner();
            }
        });
    },

    /**
     * Open scanner modal
     */
    openScanner() {
        this.modal.classList.add('active');
        this.resultDiv.style.display = 'none';
        this.startBtn.style.display = 'inline-flex';
        this.stopBtn.style.display = 'none';
    },

    /**
     * Close scanner modal
     */
    closeScanner() {
        this.stopScanning();
        this.modal.classList.remove('active');
    },

    /**
     * Start camera scanning
     */
    async startScanning() {
        try {
            if (typeof Html5Qrcode === 'undefined') {
                throw new Error('QR Scanner library not loaded');
            }

            this.scanner = new Html5Qrcode('qrReaderView');

            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            };

            await this.scanner.start(
                { facingMode: 'environment' },
                config,
                (decodedText) => this.onScanSuccess(decodedText),
                (errorMessage) => this.onScanError(errorMessage)
            );

            this.isScanning = true;
            this.startBtn.style.display = 'none';
            this.stopBtn.style.display = 'inline-flex';
            this.resultDiv.style.display = 'none';

        } catch (error) {
            console.error('Scanner error:', error);
            this.showScanResult(`Error: ${error.message}`, 'error');
        }
    },

    /**
     * Stop camera scanning
     */
    async stopScanning() {
        if (this.scanner && this.isScanning) {
            try {
                await this.scanner.stop();
                this.scanner.clear();
            } catch (error) {
                console.error('Stop scanner error:', error);
            }
            this.isScanning = false;
        }

        this.startBtn.style.display = 'inline-flex';
        this.stopBtn.style.display = 'none';
    },

    /**
     * Handle successful QR scan
     */
    onScanSuccess(decodedText) {
        this.stopScanning();

        try {
            // Try to parse as CaseTrack QR data
            const qrData = this.parseQRData(decodedText);

            if (qrData && qrData.fileId) {
                const file = CaseTrackDB.getFile(qrData.fileId);

                if (file) {
                    this.showFileScanned(file, qrData);
                } else {
                    this.showScanResult(`File "${qrData.fileId}" not found in system`, 'warning');
                }
            } else {
                this.showScanResult(`Unrecognized QR code: ${decodedText}`, 'warning');
            }
        } catch (error) {
            this.showScanResult(`Error parsing QR: ${error.message}`, 'error');
        }
    },

    /**
     * Handle scan error (usually just no QR in frame)
     */
    onScanError(errorMessage) {
        // Ignore - this fires continuously when no QR is detected
    },

    /**
     * Parse QR code data
     */
    parseQRData(text) {
        // Try JSON parse first
        try {
            return JSON.parse(text);
        } catch {
            // Try URL format: casetrack://file/CT-2026-0001
            const match = text.match(/casetrack:\/\/file\/([A-Z]{2}-\d{4}-\d{4})/);
            if (match) {
                return { fileId: match[1], action: 'view' };
            }

            // Try plain file ID
            const fileIdMatch = text.match(/^[A-Z]{2}-\d{4}-\d{4}$/);
            if (fileIdMatch) {
                return { fileId: text, action: 'view' };
            }
        }
        return null;
    },

    /**
     * Show scanned file details with actions
     */
    showFileScanned(file, qrData) {
        const currentUser = CaseTrackAuth.getCurrentUser();
        const isCustodian = file.currentCustodian === currentUser?.userId;
        const custodian = CaseTrackDB.getUser(file.currentCustodian);

        // Check for pending acknowledgment
        const pendingAck = CaseTrackDB.getAllMovements().find(m =>
            m.fileId === file.fileId &&
            m.toCustodian === currentUser?.userId &&
            !m.acknowledged
        );

        this.resultDiv.style.display = 'block';
        this.resultDiv.innerHTML = `
            <div class="scan-success">
                <span class="scan-icon">📁</span>
                <div class="scan-file-info">
                    <strong>${file.fileId}</strong>
                    <p>${file.caseName}</p>
                    <small>Custodian: ${custodian?.name || 'Unknown'}</small>
                </div>
            </div>
            <div class="scan-actions" id="scanActions">
                ${pendingAck ? `
                    <button class="btn-primary" onclick="QRScanner.acknowledgeFile('${pendingAck.movementId}')">
                        ✅ Acknowledge Receipt
                    </button>
                ` : ''}
                <button class="btn-secondary" onclick="QRScanner.viewFile('${file.fileId}')">
                    View Details
                </button>
                ${isCustodian && CaseTrackAuth.hasPermission('logMovements') ? `
                    <button class="btn-secondary" onclick="QRScanner.transferFile('${file.fileId}')">
                        Transfer File
                    </button>
                ` : ''}
            </div>
        `;
    },

    /**
     * Show scan result message
     */
    showScanResult(message, type = 'info') {
        const icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };

        this.resultDiv.style.display = 'block';
        this.resultDiv.innerHTML = `
            <div class="scan-success scan-${type}">
                <span class="scan-icon">${icons[type]}</span>
                <span class="scan-message">${message}</span>
            </div>
            <div class="scan-actions">
                <button class="btn-secondary" onclick="QRScanner.startScanning()">
                    Scan Again
                </button>
            </div>
        `;
    },

    /**
     * Acknowledge file receipt from scan
     */
    acknowledgeFile(movementId) {
        const result = MovementTracker.acknowledgeReceipt(movementId);
        if (result.success) {
            this.showScanResult('File receipt acknowledged successfully!', 'success');
            // Update UI
            setTimeout(() => {
                this.closeScanner();
                if (typeof caseTrack !== 'undefined') {
                    caseTrack.updateQuickStats();
                    caseTrack.loadDashboard();
                }
            }, 1500);
        } else {
            this.showScanResult(`Error: ${result.error}`, 'error');
        }
    },

    /**
     * View file details from scan
     */
    viewFile(fileId) {
        this.closeScanner();
        if (typeof caseTrack !== 'undefined') {
            caseTrack.openFileDetails(fileId);
        }
    },

    /**
     * Transfer file from scan
     */
    transferFile(fileId) {
        this.closeScanner();
        if (typeof caseTrack !== 'undefined') {
            caseTrack.openMovementModal(fileId);
        }
    },

    /**
     * Generate QR code for a file
     */
    async generateQRCode(fileId, containerElement, size = 150) {
        if (typeof QRCode === 'undefined') {
            console.error('QRCode library not loaded');
            containerElement.innerHTML = `<div class="qr-placeholder">[QR]<br>${fileId}</div>`;
            return;
        }

        const qrData = JSON.stringify({
            type: 'casetrack-file',
            fileId: fileId,
            timestamp: new Date().toISOString()
        });

        try {
            // Clear previous QR
            containerElement.innerHTML = '';

            // Generate new QR code
            const canvas = document.createElement('canvas');
            await QRCode.toCanvas(canvas, qrData, {
                width: size,
                margin: 2,
                color: {
                    dark: '#1a1f2e',
                    light: '#ffffff'
                }
            });

            containerElement.appendChild(canvas);

            // Add download button
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'btn-text qr-download-btn';
            downloadBtn.textContent = '⬇️ Download QR';
            downloadBtn.onclick = () => this.downloadQR(canvas, fileId);
            containerElement.appendChild(downloadBtn);

        } catch (error) {
            console.error('QR generation error:', error);
            containerElement.innerHTML = `<div class="qr-placeholder">[QR Error]<br>${fileId}</div>`;
        }
    },

    /**
     * Download QR code as image
     */
    downloadQR(canvas, fileId) {
        const link = document.createElement('a');
        link.download = `qr-${fileId}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    QRScanner.init();
});
