const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
    empId: { type: mongoose.Schema.Types.Mixed, unique: true, sparse: true },
    name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true }, // Optional, can be added during first login
    department: { type: String },
    designation: { type: String },
    phone: { type: String },
    panNumber: { type: String },
    aadhaarNumber: { type: String },
    salary: { type: Number, default: 0 },
    thriftContribution: { type: Number, default: 0 },

    // Accumulated thrift balance
    thriftBalance: { type: Number, default: 0 },

    // Employment activity status
    isActive: { type: Boolean, default: true },
    inactiveAt: { type: Date, default: null },
    inactiveReason: { type: String, default: '' },
    thriftSettledAmount: { type: Number, default: 0 },

    // Internal Credit Score (CIBIL-like)
    creditScore: { type: Number, default: 750, min: 300, max: 900 },

    // Optional status from Excel imports (when no Loan document exists)
    // Example values: 'Loan', 'No Loan'
    loanStatus: { type: String, default: '' },

    // Current active loan ID (if any)
    activeLoan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Loan'
    },

    // Guarantor status - helps check eligibility
    guaranteeingLoans: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Loan'
    }]
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);
