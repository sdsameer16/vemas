const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
    borrower: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    sureties: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    }],
    // Raw empId strings from Excel — fallback display when Employee doc not found
    suretyEmpIds: [{ type: String }],
    loanAmount: { type: Number, required: true },
    interestRate: { type: Number, required: true }, // Annual interest rate in %
    emi: { type: Number, required: true }, // Calculated EMI
    remainingBalance: { type: Number, required: true },
    totalInterestPaid: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['active', 'closed', 'pending', 'rejected'],
        default: 'active'
    },
    paymentHistory: [{
        amount: Number,
        principal: Number,
        interest: Number,
        date: { type: Date, default: Date.now },
        type: { type: String, enum: ['monthly', 'adhoc'], default: 'monthly' }
    }],
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Loan', loanSchema);
