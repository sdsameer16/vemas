const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const Loan = require('../models/Loan');
const Transaction = require('../models/Transaction');
const BalanceSheetMonth = require('../models/BalanceSheetMonth');

// @desc    Preview monthly deductions for all active employees
// @route   GET /api/admin/monthly/preview/:month
// @access  Private/Admin
const previewMonthlyDeductions = async (req, res) => {
    try {
        const month = req.params.month; // Expected format: 'YYYY-MM'
        
        // Check if transactions already exist for this month limit 1
        const existingTx = await Transaction.findOne({ month });
        if (existingTx) {
            return res.status(400).json({ message: `Transactions for ${month} have already been processed.` });
        }

        const employees = await Employee.find({ isActive: { $ne: false } }).populate('activeLoan');
        const previews = [];

        for (const emp of employees) {
            let thriftDeduction = emp.thriftContribution || 0;
            let loanEMI = 0;
            let interestPayment = 0;
            let principalRepayment = 0;
            let newLoanBalance = 0;
            let totalDeduction = 0;
            
            if (emp.activeLoan) {
                const loan = emp.activeLoan;
                
                // Calculate Interest (12% per annum = 1% per month generally, but let's use exact)
                // Using formula: (Remaining Balance * Interest Rate / 100) / 12
                interestPayment = Math.round((loan.remainingBalance * loan.interestRate / 100) / 12);
                
                // Standard EMI
                loanEMI = loan.emi || 0;
                
                // Principal portion
                principalRepayment = Math.max(0, loanEMI - interestPayment);
                
                // Cap principal if remaining balance is less
                if (loan.remainingBalance < principalRepayment) {
                    principalRepayment = loan.remainingBalance;
                    loanEMI = principalRepayment + interestPayment;
                }
                
                newLoanBalance = loan.remainingBalance - principalRepayment;
            }

            totalDeduction = thriftDeduction + loanEMI;
            let salary = emp.salary || 0;
            let netSalary = Math.max(0, salary - totalDeduction);
            let newThriftBalance = (emp.thriftBalance || 0) + thriftDeduction;

            previews.push({
                employee: emp._id,
                empId: emp.empId,
                name: emp.name,
                salary: salary,
                thriftDeduction: thriftDeduction,
                interestPayment: interestPayment,
                loanEMI: loanEMI,
                principalRepayment: principalRepayment,
                totalDeduction: totalDeduction,
                netSalary: netSalary,
                currentThriftBalance: emp.thriftBalance || 0,
                newThriftBalance: Math.round(newThriftBalance * 100) / 100,
                currentLoanBalance: emp.activeLoan ? emp.activeLoan.remainingBalance : 0,
                newLoanBalance: Math.round(newLoanBalance * 100) / 100
            });
        }

        res.json({
            month,
            totalEmployees: previews.length,
            previews: previews
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Process and save monthly data
// @route   POST /api/admin/monthly/process
// @access  Private/Admin
const processMonthlyDeductions = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { month, data } = req.body;

        if (!month || !data || !Array.isArray(data)) {
             throw new Error("Invalid request payload.");
        }

        // Check if transactions already exist
        const existingTx = await Transaction.findOne({ month }).session(session);
        if (existingTx) {
            throw new Error(`Month ${month} has already been processed.`);
        }

        let totalThriftDeducted = 0;
        let totalLoanRepayment = 0;
        let totalInterestPaid = 0;
        
        const processedEmpIds = [];

        for (const item of data) {
            const emp = await Employee.findById(item.employee).session(session);
            if (!emp) continue;

            // Values from frontend UI (which might have been manually adjusted slightly)
            const thriftDeduction = Number(item.thriftDeduction) || 0;
            const interestPayment = Number(item.interestPayment) || 0;
            const loanEMI = Number(item.loanEMI) || 0;
            const principalRepayment = Number(item.principalRepayment) || 0;
            const totalDeduction = Number(item.totalDeduction) || 0;
            const netSalary = Number(item.netSalary) || 0;

            const newThriftBalance = Number(item.newThriftBalance) || 0;
            const newLoanBalance = Number(item.newLoanBalance) || 0;

            // 1. Update Employee Thrift
            emp.thriftBalance = newThriftBalance;

            // 2. Update Loan Balance if they have one
            if (emp.activeLoan && (loanEMI > 0 || interestPayment > 0 || item.loanEMI === 0)) {
                const loan = await Loan.findById(emp.activeLoan).session(session);
                if (loan) {
                    
                    // CIBIL Score Logic
                    const expectedEmi = loan.emi || 0;
                    if (loanEMI >= expectedEmi || newLoanBalance <= 0) {
                        emp.creditScore = Math.min(900, (emp.creditScore || 750) + 5);
                    } else if (loanEMI > 0 && loanEMI < expectedEmi) {
                        emp.creditScore = Math.max(300, (emp.creditScore || 750) - 20);
                    } else if (loanEMI === 0 && expectedEmi > 0) {
                        emp.creditScore = Math.max(300, (emp.creditScore || 750) - 50);
                    }

                    loan.remainingBalance = newLoanBalance;
                    loan.totalInterestPaid = (loan.totalInterestPaid || 0) + interestPayment;
                    
                    // Do NOT overwrite loan.emi permanently just because they paid less this month.
                    // Keep original EMI schedule.

                    loan.paymentHistory.push({
                        amount: loanEMI,
                        principal: principalRepayment,
                        interest: interestPayment,
                        date: new Date(),
                        type: 'monthly'
                    });

                    // Close loan if paid off
                    if (loan.remainingBalance <= 0) {
                        loan.status = 'closed';
                        loan.remainingBalance = 0;
                        emp.activeLoan = null;
                        emp.loanStatus = '';
                        
                        // Remove Closed Loan from sureties
                        if (loan.sureties && loan.sureties.length > 0) {
                            await Employee.updateMany(
                                { _id: { $in: loan.sureties } },
                                { $pull: { guaranteeingLoans: loan._id } }
                            ).session(session);
                        }
                    }
                    await loan.save({ session });
                }
            }

            await emp.save({ session });

            // 3. Create Transaction Record
            await Transaction.create([{
                employee: emp._id,
                month: month,
                salary: Number(item.salary) || 0,
                thriftDeduction,
                loanEMI,
                interestPayment,
                principalRepayment,
                loanAmount: loanEMI, // matching upload logic format
                totalDeduction,
                paidAmount: netSalary, // from excel logic usually paidAmount is net
                netSalary: netSalary,
                cbThriftBalance: newThriftBalance,
                loanBalance: newLoanBalance
            }], { session });

            totalThriftDeducted += thriftDeduction;
            totalLoanRepayment += principalRepayment;
            totalInterestPaid += interestPayment;
            processedEmpIds.push(emp._id);
        }

        // 4. Update Balance Sheet Summary
        await BalanceSheetMonth.findOneAndUpdate(
            { month: month },
            {
                $inc: {
                    thrift: Math.round(totalThriftDeducted * 100) / 100,
                    loanRepayment: Math.round(totalLoanRepayment * 100) / 100,
                    intrest: Math.round(totalInterestPaid * 100) / 100
                },
                $set: { updatedBy: req.user._id }
            },
            { upsert: true, new: true, session }
        );

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: `Monthly logic executed successfully for ${month}`,
            processedRecords: processedEmpIds.length
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    previewMonthlyDeductions,
    processMonthlyDeductions
};
