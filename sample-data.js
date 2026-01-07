/**
 * CaseTrack KE — Sample Data
 * Realistic demo data for law firm file tracking
 */

const SampleData = {

    /**
     * Initialize sample data if database is empty
     */
    init() {
        const users = CaseTrackDB.getAllUsers();
        if (users.length === 0) {
            this.loadSampleData();
            console.log('CaseTrack: Sample data loaded');
            return true;
        }
        console.log('CaseTrack: Data already exists, skipping sample load');
        return false;
    },

    /**
     * Force reload sample data (clears existing)
     */
    reload() {
        CaseTrackDB.clearAll();
        this.loadSampleData();
        console.log('CaseTrack: Sample data reloaded');
    },

    loadSampleData() {
        // Create Users
        this.createUsers();

        // Create Files
        this.createFiles();

        // Create Movements
        this.createMovements();

        // Create Deadlines
        this.createDeadlines();
    },

    createUsers() {
        const users = [
            { name: 'Mary Wanjiru', email: 'mary.wanjiru@kenyalaw.firm', role: 'Clerk', department: 'Registry' },
            { name: 'John Kamau', email: 'john.kamau@kenyalaw.firm', role: 'Clerk', department: 'Registry' },
            { name: 'Adv. Sarah Otieno', email: 'sarah.otieno@kenyalaw.firm', role: 'Advocate', department: 'Commercial' },
            { name: 'Adv. Peter Mwangi', email: 'peter.mwangi@kenyalaw.firm', role: 'Advocate', department: 'Litigation' },
            { name: 'Adv. Grace Njeri', email: 'grace.njeri@kenyalaw.firm', role: 'Advocate', department: 'Family Law' },
            { name: 'Partner James Odhiambo', email: 'james.odhiambo@kenyalaw.firm', role: 'Partner', department: 'Managing' }
        ];

        users.forEach(userData => {
            CaseTrackDB.createUser(userData);
        });
    },

    createFiles() {
        const users = CaseTrackDB.getAllUsers();
        const clerks = users.filter(u => u.role === 'Clerk');
        const advocates = users.filter(u => u.role === 'Advocate');
        const partners = users.filter(u => u.role === 'Partner');

        const files = [
            {
                caseName: 'Kenya Commercial Bank v. Sunrise Enterprises Ltd',
                clientName: 'Kenya Commercial Bank',
                practiceArea: 'Banking & Finance',
                assignedAdvocates: [advocates[0]?.userId],
                currentCustodian: advocates[0]?.userId,
                courtJurisdiction: 'High Court - Commercial Division, Nairobi',
                notes: 'Loan recovery matter - KES 15 million'
            },
            {
                caseName: 'Republic v. James Muthomi',
                clientName: 'James Muthomi',
                practiceArea: 'Criminal',
                assignedAdvocates: [advocates[1]?.userId],
                currentCustodian: advocates[1]?.userId,
                courtJurisdiction: 'High Court - Criminal Division, Nairobi',
                notes: 'Economic crimes case - bail application pending'
            },
            {
                caseName: 'In Re: Estate of the Late Mzee Kiptoo',
                clientName: 'Family of Mzee Kiptoo',
                practiceArea: 'Succession & Inheritance',
                assignedAdvocates: [advocates[2]?.userId],
                currentCustodian: clerks[0]?.userId,
                courtJurisdiction: 'High Court - Family Division, Eldoret',
                notes: 'Grant of letters of administration'
            },
            {
                caseName: 'Safaricom PLC v. Communications Authority',
                clientName: 'Safaricom PLC',
                practiceArea: 'Constitutional',
                assignedAdvocates: [advocates[0]?.userId, partners[0]?.userId],
                currentCustodian: partners[0]?.userId,
                courtJurisdiction: 'Supreme Court of Kenya',
                notes: 'Constitutional petition on spectrum allocation'
            },
            {
                caseName: 'Nakuru County Government v. MegaBuild Contractors',
                clientName: 'MegaBuild Contractors Ltd',
                practiceArea: 'Public Procurement',
                assignedAdvocates: [advocates[1]?.userId],
                currentCustodian: advocates[1]?.userId,
                courtJurisdiction: 'Public Procurement Administrative Review Board',
                notes: 'Contract termination dispute - KES 500 million project'
            },
            {
                caseName: 'Jane Wambui v. David Kimani (Divorce)',
                clientName: 'Jane Wambui',
                practiceArea: 'Family Law',
                assignedAdvocates: [advocates[2]?.userId],
                currentCustodian: advocates[2]?.userId,
                courtJurisdiction: 'High Court - Family Division, Nairobi',
                notes: 'Matrimonial property division and child custody'
            },
            {
                caseName: 'East African Breweries Ltd v. Kenya Revenue Authority',
                clientName: 'East African Breweries Ltd',
                practiceArea: 'Tax',
                assignedAdvocates: [advocates[0]?.userId],
                currentCustodian: clerks[1]?.userId,
                courtJurisdiction: 'Tax Appeals Tribunal',
                notes: 'Excise duty assessment appeal - KES 1.2 billion'
            },
            {
                caseName: 'Jubilee Insurance v. Coastal Properties Ltd',
                clientName: 'Jubilee Insurance',
                practiceArea: 'Insurance',
                assignedAdvocates: [advocates[0]?.userId],
                currentCustodian: advocates[0]?.userId,
                courtJurisdiction: 'High Court - Commercial Division, Mombasa',
                notes: 'Fire damage claim dispute'
            },
            {
                caseName: 'Workers Union v. Nairobi Water Company',
                clientName: 'Nairobi Water Company',
                practiceArea: 'Employment & Labour',
                assignedAdvocates: [advocates[1]?.userId],
                currentCustodian: clerks[0]?.userId,
                courtJurisdiction: 'Employment and Labour Relations Court',
                notes: 'Collective bargaining agreement dispute'
            },
            {
                caseName: 'Green Acres Ltd v. Kiambu County Land Registrar',
                clientName: 'Green Acres Ltd',
                practiceArea: 'Land & Property',
                assignedAdvocates: [advocates[1]?.userId, advocates[2]?.userId],
                currentCustodian: advocates[2]?.userId,
                courtJurisdiction: 'Environment and Land Court, Kiambu',
                notes: 'Land registration dispute - 50 acres'
            },
            {
                caseName: 'Standard Chartered Bank v. Impala Motors',
                clientName: 'Standard Chartered Bank',
                practiceArea: 'Commercial',
                assignedAdvocates: [advocates[0]?.userId],
                currentCustodian: partners[0]?.userId,
                courtJurisdiction: 'High Court - Commercial Division, Nairobi',
                notes: 'Guarantee enforcement - motor vehicle financing'
            },
            {
                caseName: 'Ethics and Anti-Corruption Commission v. John Doe',
                clientName: 'John Doe (Accused)',
                practiceArea: 'Anti-Corruption',
                assignedAdvocates: [advocates[1]?.userId],
                currentCustodian: advocates[1]?.userId,
                courtJurisdiction: 'Anti-Corruption Court, Nairobi',
                notes: 'Public procurement fraud allegations'
            },
            {
                caseName: 'ABC Arbitration: TechCorp Kenya v. DataSoft Solutions',
                clientName: 'TechCorp Kenya',
                practiceArea: 'Alternative Dispute Resolution',
                assignedAdvocates: [partners[0]?.userId],
                currentCustodian: partners[0]?.userId,
                courtJurisdiction: 'Nairobi Centre for International Arbitration',
                notes: 'Software licensing dispute - ICC Arbitration'
            },
            {
                caseName: 'Equity Bank v. Sunrise Holdings',
                clientName: 'Equity Bank',
                practiceArea: 'Banking & Finance',
                assignedAdvocates: [advocates[0]?.userId],
                currentCustodian: clerks[0]?.userId,
                courtJurisdiction: 'High Court - Commercial Division, Nairobi',
                notes: 'Mortgage enforcement proceedings'
            },
            {
                caseName: 'Republic v. Ann Mumbi & 5 Others',
                clientName: 'Ann Mumbi',
                practiceArea: 'Criminal',
                assignedAdvocates: [advocates[1]?.userId],
                currentCustodian: advocates[1]?.userId,
                courtJurisdiction: 'High Court - Criminal Division, Nairobi',
                notes: 'Murder trial - self-defense plea'
            }
        ];

        files.forEach(fileData => {
            fileData.createdBy = clerks[0]?.userId || 'system';
            CaseTrackDB.createFile(fileData);
        });
    },

    createMovements() {
        const files = CaseTrackDB.getAllFiles();
        const users = CaseTrackDB.getAllUsers();
        const clerks = users.filter(u => u.role === 'Clerk');
        const advocates = users.filter(u => u.role === 'Advocate');
        const partners = users.filter(u => u.role === 'Partner');

        // Add some historical movements
        const movements = [
            { fileIndex: 0, from: clerks[0]?.userId, to: advocates[0]?.userId, purpose: 'Drafting', daysAgo: 5 },
            { fileIndex: 1, from: clerks[1]?.userId, to: advocates[1]?.userId, purpose: 'Court Hearing', daysAgo: 3 },
            { fileIndex: 2, from: advocates[2]?.userId, to: clerks[0]?.userId, purpose: 'Filing', daysAgo: 2 },
            { fileIndex: 3, from: advocates[0]?.userId, to: partners[0]?.userId, purpose: 'Partner Review', daysAgo: 1 },
            { fileIndex: 4, from: clerks[0]?.userId, to: advocates[1]?.userId, purpose: 'Review', daysAgo: 8 },
            { fileIndex: 6, from: advocates[0]?.userId, to: clerks[1]?.userId, purpose: 'Filing', daysAgo: 4 },
            { fileIndex: 10, from: advocates[0]?.userId, to: partners[0]?.userId, purpose: 'Senior Review', daysAgo: 10 },
        ];

        movements.forEach(m => {
            if (files[m.fileIndex]) {
                const movement = {
                    fileId: files[m.fileIndex].fileId,
                    fromCustodian: m.from,
                    toCustodian: m.to,
                    purpose: m.purpose,
                    notes: 'Historical movement record',
                    loggedBy: clerks[0]?.userId
                };

                // Manually add movement with backdated timestamp
                const allMovements = CaseTrackDB.getAllMovements();
                const backdatedMovement = {
                    movementId: `MV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    ...movement,
                    timestamp: new Date(Date.now() - m.daysAgo * 24 * 60 * 60 * 1000).toISOString(),
                    acknowledged: true,
                    acknowledgedAt: new Date(Date.now() - (m.daysAgo - 1) * 24 * 60 * 60 * 1000).toISOString(),
                    acknowledgedBy: m.to
                };
                allMovements.push(backdatedMovement);
                CaseTrackDB.saveData(CaseTrackDB.STORAGE_KEYS.MOVEMENTS, allMovements);
            }
        });
    },

    createDeadlines() {
        const files = CaseTrackDB.getAllFiles();
        const now = new Date();

        const deadlines = [
            { fileIndex: 0, type: 'Court Mention', daysFromNow: 2, description: 'Mention for directions' },
            { fileIndex: 1, type: 'Court Hearing', daysFromNow: 5, description: 'Bail review application' },
            { fileIndex: 2, type: 'Filing Deadline', daysFromNow: 7, description: 'File inventory of estate' },
            { fileIndex: 3, type: 'Court Hearing', daysFromNow: 14, description: 'Full hearing - Constitutional Petition' },
            { fileIndex: 4, type: 'Filing Deadline', daysFromNow: 3, description: 'Response to termination notice' },
            { fileIndex: 5, type: 'Court Mention', daysFromNow: 1, description: 'Case management conference' },
            { fileIndex: 6, type: 'Appeal Deadline', daysFromNow: 10, description: 'File notice of appeal' },
            { fileIndex: 8, type: 'Filing Deadline', daysFromNow: 4, description: 'Submit written submissions' },
            { fileIndex: 9, type: 'Court Hearing', daysFromNow: 21, description: 'Full hearing - Land dispute' },
            { fileIndex: 11, type: 'Court Mention', daysFromNow: 6, description: 'Pre-trial conference' },
            { fileIndex: 12, type: 'Filing Deadline', daysFromNow: 8, description: 'Submit arbitration brief' },
            { fileIndex: 14, type: 'Court Hearing', daysFromNow: 30, description: 'Trial commencement' },
            // Overdue deadlines for testing alerts
            { fileIndex: 7, type: 'Filing Deadline', daysFromNow: -2, description: 'Submit defense - OVERDUE' },
            { fileIndex: 13, type: 'Court Mention', daysFromNow: -1, description: 'Mention for directions - MISSED' }
        ];

        deadlines.forEach(d => {
            if (files[d.fileIndex]) {
                const dueDate = new Date(now.getTime() + d.daysFromNow * 24 * 60 * 60 * 1000);
                CaseTrackDB.createDeadline({
                    fileId: files[d.fileIndex].fileId,
                    type: d.type,
                    dueDate: dueDate.toISOString(),
                    description: d.description,
                    createdBy: 'system'
                });
            }
        });
    }
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SampleData;
}
