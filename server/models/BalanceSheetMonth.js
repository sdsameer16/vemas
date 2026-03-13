const mongoose = require('mongoose');

const balanceSheetMonthSchema = new mongoose.Schema({
    month: { type: String, required: true, unique: true }, // YYYY-MM
    thrift: { type: Number, default: 0 },
    loanRepayment: { type: Number, default: 0 },
    intrest: { type: Number, default: 0 },
    enttryFee: { type: Number, default: 0 },
    shareCapital: { type: Number, default: 0 },
    fdClosed: { type: Number, default: 0 },
    bankIntrest: { type: Number, default: 0 },
    cashInHand: { type: Number, default: 0 },
    loanApplicationFee: { type: Number, default: 0 },
    loansIssue: { type: Number, default: 0 },
    thriftRefundToMembers: { type: Number, default: 0 },
    scRefund: { type: Number, default: 0 },
    fixedDepositInBank: { type: Number, default: 0 },
    salaryForAccountent: { type: Number, default: 0 },
    expenditure: { type: Number, default: 0 },
    expenditureRemarks: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('BalanceSheetMonth', balanceSheetMonthSchema);
