/**
 * CaseTrack KE — File Upload Module
 * Handle document attachments for legal files
 */

const FileUpload = {
    uploadQueue: [],
    currentFileId: null,

    // Simulated cloud storage (in production, replace with actual API)
    storage: JSON.parse(localStorage.getItem('casetrack_attachments') || '{}'),

    /**
     * Initialize file upload module
     */
    init() {
        this.bindElements();
        this.bindEvents();
    },

    /**
     * Bind DOM elements
     */
    bindElements() {
        this.modal = document.getElementById('fileUploadModal');
        this.uploadZone = document.getElementById('uploadZone');
        this.fileInput = document.getElementById('fileInput');
        this.progressDiv = document.getElementById('uploadProgress');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.uploadedList = document.getElementById('uploadedFilesList');
        this.fileIdInput = document.getElementById('uploadFileId');
        this.closeBtn = document.getElementById('closeFileUpload');
        this.cancelBtn = document.getElementById('cancelUpload');
        this.confirmBtn = document.getElementById('confirmUpload');
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Close buttons
        this.closeBtn?.addEventListener('click', () => this.closeModal());
        this.cancelBtn?.addEventListener('click', () => this.closeModal());
        this.confirmBtn?.addEventListener('click', () => this.confirmUploads());

        // Click to browse
        this.uploadZone?.addEventListener('click', () => this.fileInput?.click());

        // File input change
        this.fileInput?.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });

        // Drag and drop
        this.uploadZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadZone.classList.add('dragover');
        });

        this.uploadZone?.addEventListener('dragleave', () => {
            this.uploadZone.classList.remove('dragover');
        });

        this.uploadZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadZone.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });

        // Modal overlay click
        this.modal?.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
            }
        });
    },

    /**
     * Open upload modal for a specific file
     */
    openModal(fileId) {
        this.currentFileId = fileId;
        this.fileIdInput.value = fileId;
        this.uploadQueue = [];
        this.uploadedList.innerHTML = '';
        this.progressDiv.style.display = 'none';
        this.fileInput.value = '';

        // Load existing attachments
        this.loadExistingAttachments(fileId);

        this.modal.classList.add('active');
    },

    /**
     * Close upload modal
     */
    closeModal() {
        this.modal.classList.remove('active');
        this.uploadQueue = [];
        this.currentFileId = null;
    },

    /**
     * Load existing attachments for a file
     */
    loadExistingAttachments(fileId) {
        const attachments = this.storage[fileId] || [];

        if (attachments.length > 0) {
            this.uploadedList.innerHTML = `
                <h4 style="margin-bottom: 12px; color: var(--text-muted);">Current Attachments</h4>
                ${attachments.map((att, idx) => this.renderAttachment(att, idx, true)).join('')}
            `;
        }
    },

    /**
     * Handle selected files
     */
    handleFiles(files) {
        const maxSize = 10 * 1024 * 1024; // 10MB
        const allowedTypes = ['application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg', 'image/png'];

        Array.from(files).forEach(file => {
            // Validate size
            if (file.size > maxSize) {
                this.showNotification(`${file.name} exceeds 10MB limit`, 'error');
                return;
            }

            // Validate type
            if (!allowedTypes.includes(file.type)) {
                this.showNotification(`${file.name} is not a supported file type`, 'error');
                return;
            }

            // Add to queue
            this.uploadQueue.push({
                file: file,
                name: file.name,
                size: file.size,
                type: file.type,
                status: 'pending'
            });
        });

        this.renderUploadQueue();
    },

    /**
     * Render upload queue
     */
    renderUploadQueue() {
        if (this.uploadQueue.length === 0) return;

        const existingHtml = this.uploadedList.innerHTML;
        const queueHtml = `
            <h4 style="margin: 16px 0 12px; color: var(--text-primary);">Files to Upload</h4>
            ${this.uploadQueue.map((item, idx) => `
                <div class="upload-item">
                    <div class="upload-item-info">
                        <span class="upload-item-icon">${this.getFileIcon(item.type)}</span>
                        <div class="upload-item-details">
                            <span class="upload-item-name">${item.name}</span>
                            <span class="upload-item-size">${this.formatFileSize(item.size)}</span>
                        </div>
                    </div>
                    <button class="btn-danger upload-item-remove" onclick="FileUpload.removeFromQueue(${idx})">
                        ✕
                    </button>
                </div>
            `).join('')}
        `;

        // Preserve existing attachments section
        const existingSection = existingHtml.includes('Current Attachments')
            ? existingHtml.split('Files to Upload')[0]
            : existingHtml;

        this.uploadedList.innerHTML = existingSection + queueHtml;
    },

    /**
     * Remove item from upload queue
     */
    removeFromQueue(index) {
        this.uploadQueue.splice(index, 1);
        this.loadExistingAttachments(this.currentFileId);
        this.renderUploadQueue();
    },

    /**
     * Confirm and process uploads
     */
    async confirmUploads() {
        if (this.uploadQueue.length === 0) {
            this.closeModal();
            return;
        }

        this.progressDiv.style.display = 'block';
        this.confirmBtn.disabled = true;

        let processed = 0;
        const total = this.uploadQueue.length;

        for (const item of this.uploadQueue) {
            try {
                await this.uploadFile(item);
                processed++;
                this.updateProgress(processed, total);
            } catch (error) {
                console.error('Upload failed:', item.name, error);
                this.showNotification(`Failed to upload ${item.name}`, 'error');
            }
        }

        // Save to storage
        this.saveStorage();

        this.progressText.textContent = 'Upload complete!';
        this.confirmBtn.disabled = false;

        setTimeout(() => {
            this.closeModal();
            this.showNotification(`${processed} file(s) attached successfully`, 'success');

            // Refresh file details if open
            if (typeof caseTrack !== 'undefined' && this.currentFileId) {
                caseTrack.openFileDetails(this.currentFileId);
            }
        }, 1000);
    },

    /**
     * Upload single file (simulated - in production, send to server)
     */
    async uploadFile(item) {
        return new Promise((resolve) => {
            // Simulate upload delay
            setTimeout(() => {
                // Read file as base64 for demo storage
                const reader = new FileReader();
                reader.onload = (e) => {
                    const attachment = {
                        id: `ATT-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        name: item.name,
                        size: item.size,
                        type: item.type,
                        data: e.target.result, // Base64 for demo
                        uploadedAt: new Date().toISOString(),
                        uploadedBy: CaseTrackAuth.getCurrentUser()?.userId
                    };

                    // Add to storage
                    if (!this.storage[this.currentFileId]) {
                        this.storage[this.currentFileId] = [];
                    }
                    this.storage[this.currentFileId].push(attachment);

                    resolve(attachment);
                };
                reader.readAsDataURL(item.file);
            }, 500 + Math.random() * 500);
        });
    },

    /**
     * Update progress bar
     */
    updateProgress(current, total) {
        const percent = Math.round((current / total) * 100);
        this.progressFill.style.width = `${percent}%`;
        this.progressText.textContent = `Uploading ${current} of ${total}...`;
    },

    /**
     * Save storage to localStorage
     */
    saveStorage() {
        localStorage.setItem('casetrack_attachments', JSON.stringify(this.storage));
    },

    /**
     * Get attachments for a file
     */
    getAttachments(fileId) {
        return this.storage[fileId] || [];
    },

    /**
     * Delete attachment
     */
    deleteAttachment(fileId, attachmentId) {
        if (this.storage[fileId]) {
            this.storage[fileId] = this.storage[fileId].filter(a => a.id !== attachmentId);
            this.saveStorage();
            return true;
        }
        return false;
    },

    /**
     * Download attachment
     */
    downloadAttachment(fileId, attachmentId) {
        const attachments = this.storage[fileId] || [];
        const attachment = attachments.find(a => a.id === attachmentId);

        if (attachment) {
            const link = document.createElement('a');
            link.href = attachment.data;
            link.download = attachment.name;
            link.click();
        }
    },

    /**
     * Render attachment item
     */
    renderAttachment(attachment, index, showDelete = false) {
        return `
            <div class="attachment-item">
                <div class="attachment-info">
                    <span class="attachment-icon">${this.getFileIcon(attachment.type)}</span>
                    <div class="attachment-details">
                        <span class="attachment-name">${attachment.name}</span>
                        <span class="attachment-meta">
                            ${this.formatFileSize(attachment.size)} • 
                            ${new Date(attachment.uploadedAt).toLocaleDateString()}
                        </span>
                    </div>
                </div>
                <div class="attachment-actions">
                    <button class="btn-text" onclick="FileUpload.downloadAttachment('${this.currentFileId || attachment.fileId}', '${attachment.id}')">
                        ⬇️
                    </button>
                    ${showDelete ? `
                        <button class="btn-text" onclick="FileUpload.deleteAttachment('${this.currentFileId}', '${attachment.id}'); FileUpload.openModal('${this.currentFileId}');">
                            🗑️
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Get file icon based on type
     */
    getFileIcon(type) {
        const icons = {
            'application/pdf': '📕',
            'application/msword': '📘',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📘',
            'image/jpeg': '🖼️',
            'image/png': '🖼️'
        };
        return icons[type] || '📄';
    },

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        if (typeof caseTrack !== 'undefined') {
            caseTrack.showNotification(message);
        } else {
            alert(message);
        }
    }
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    FileUpload.init();
});
