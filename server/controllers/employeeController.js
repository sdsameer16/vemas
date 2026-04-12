const Employee = require('../models/Employee');
const User = require('../models/User');
const Loan = require('../models/Loan');
const Transaction = require('../models/Transaction');

// @desc    Get current employee profile
// @route   GET /api/employee/me
// @access  Private/Employee
const getMyProfile = async (req, res) => {
    try {
        const employee = await Employee.findById(req.user.employeeId)
            .populate('activeLoan')
            .populate('guaranteeingLoans'); // Populate loan details

        if (!employee) {
            return res.status(404).json({ message: 'Employee profile not found' });
        }

        res.json(employee);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get employee dashboard summary
// @route   GET /api/employee/dashboard
// @access  Private/Employee
const getDashboardSummary = async (req, res) => {
    try {
        const employee = await Employee.findById(req.user.employeeId)
            .populate('activeLoan');

        if (!employee) {
            return res.status(404).json({ message: 'Employee profile not found' });
        }

        // Get latest transaction for monthly deductions
        const latestTransaction = await Transaction.findOne({ employee: req.user.employeeId })
            .sort({ month: -1 });

        // Calculate net salary — prefer actual values from latest transaction
        const thriftDeduction = latestTransaction?.thriftDeduction ?? (employee.thriftContribution || 0);
        const loanEmi = latestTransaction?.loanEMI ?? (employee.activeLoan ? (employee.activeLoan.emi || 0) : 0);
        const interest = latestTransaction?.interestPayment || 0;
        const totalDeduction = thriftDeduction + loanEmi + interest;
        const netSalary = latestTransaction?.netSalary ?? ((employee.salary || 0) - totalDeduction);

        // Get guaranteeing loans with borrower info
        const guaranteeingLoans = await Loan.find({
            _id: { $in: employee.guaranteeingLoans }
        })
            .populate('borrower', 'name empId department') // corrected: empId not employeeId
            .select('loanAmount emi remainingBalance status');

        const dashboardData = {
            // Employee identity
            employeeName: employee.name || '',
            empId: employee.empId || '',
            department: employee.department || '',
            email: employee.email || '',
            phone: employee.phone || '',
            panNumber: employee.panNumber || '',
            aadhaarNumber: employee.aadhaarNumber || '',
            // Salary Card
            salary: {
                gross: employee.salary || 0,
                net: netSalary,
                lastUpdated: latestTransaction?.month || employee.updatedAt
            },
            // Thrift Card
            thrift: {
                monthlyContribution: employee.thriftContribution || 0,
                totalBalance: employee.thriftBalance || 0,
                lastContribution: latestTransaction?.month || employee.updatedAt
            },
            // Loan Card
            loan: employee.activeLoan ? {
                amount: employee.activeLoan.loanAmount || 0,
                emi: employee.activeLoan.emi || 0,
                interestRate: employee.activeLoan.interestRate || 0,
                balance: employee.activeLoan.remainingBalance || 0,
                status: employee.activeLoan.status,
                startDate: employee.activeLoan.startDate || employee.activeLoan.createdAt
            } : null,
            // Deduction Card
            deductions: {
                thrift: thriftDeduction,
                loanEmi: loanEmi,
                interest: interest,
                total: totalDeduction
            },
            // Quick Summary
            summary: {
                totalSaved: employee.thriftBalance || 0,
                totalLoanTaken: employee.activeLoan ? (employee.activeLoan.loanAmount || 0) : 0,
                remainingLoan: employee.activeLoan ? (employee.activeLoan.remainingBalance || 0) : 0
            },
            // Surety Responsibilities
            suretyResponsibilities: guaranteeingLoans.map(loan => ({
                loanId: loan._id,
                borrowerName: loan.borrower?.name || 'N/A',
                borrowerId: loan.borrower?.empId || 'N/A', // corrected: empId not employeeId
                borrowerDepartment: loan.borrower?.department || 'N/A',
                loanAmount: loan.loanAmount || 0,
                emi: loan.emi || 0,
                balance: loan.remainingBalance || 0,
                status: loan.status
            }))
        };

        res.json(dashboardData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get employee transaction history
// @route   GET /api/employee/transactions
// @access  Private/Employee
const getMyTransactions = async (req, res) => {
    try {
        const transactions = await Transaction.find({ employee: req.user.employeeId })
            .sort({ month: -1 })
            .limit(12); // Last 12 months

        const formattedTransactions = transactions.map(t => ({
            month: t.month,
            salary: t.salary || 0,
            thrift: t.thriftDeduction || 0,
            loanEmi: t.loanEMI || 0,
            interest: t.interestPayment || 0,
            principal: t.principalRepayment || 0,
            netSalary: t.netSalary || 0
        }));

        res.json(formattedTransactions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get employee loan details
// @route   GET /api/employee/loan
// @access  Private/Employee
const getMyLoanDetails = async (req, res) => {
    try {
        const employee = await Employee.findById(req.user.employeeId)
            .populate({
                path: 'activeLoan',
                populate: {
                    path: 'sureties',
                    select: 'name empId department'
                }
            });

        if (!employee) {
            return res.status(404).json({ message: 'Employee profile not found' });
        }

        if (!employee.activeLoan) {
            return res.json({ message: 'No active loan', loan: null });
        }

        const populatedSureties = (employee.activeLoan.sureties || []).filter(s => s && s.name);
        const loanDetails = {
            loanId: employee.activeLoan._id,
            amount: employee.activeLoan.loanAmount || 0,
            interestRate: employee.activeLoan.interestRate || 0,
            emi: employee.activeLoan.emi || 0,
            balance: employee.activeLoan.remainingBalance || 0,
            status: employee.activeLoan.status,
            startDate: employee.activeLoan.startDate || employee.activeLoan.createdAt,
            sureties: populatedSureties.map(s => ({
                name: s.name,
                empId: s.empId,
                department: s.department
            })),
            suretyEmpIds: employee.activeLoan.suretyEmpIds || []
        };

        res.json(loanDetails);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get surety view (who guaranteed my loan + loans I guaranteed)
// @route   GET /api/employee/sureties
// @access  Private/Employee
const getMySuretyView = async (req, res) => {
    try {
        const employee = await Employee.findById(req.user.employeeId)
            .populate({
                path: 'activeLoan',
                select: 'sureties suretyEmpIds loanAmount emi remainingBalance status',
                populate: {
                    path: 'sureties',
                    select: 'name empId department'
                }
            })
            .populate({
                path: 'guaranteeingLoans',
                populate: {
                    path: 'borrower',
                    select: 'name empId department'
                }
            });

        if (!employee) {
            return res.status(404).json({ message: 'Employee profile not found' });
        }

        // Build mySureties: use populated ObjectIds for full data, fall back to raw empId strings
        let mySureties = [];
        if (employee.activeLoan) {
            const populatedSureties = employee.activeLoan.sureties || [];
            const rawEmpIds = employee.activeLoan.suretyEmpIds || [];

            if (populatedSureties.length > 0) {
                mySureties = populatedSureties.map(s => s && s.name ? {
                    name: s.name,
                    empId: s.empId,
                    department: s.department,
                    isPartial: false
                } : null).filter(Boolean);
            }

            // For any raw empId not already covered, add a partial entry
            const coveredEmpIds = new Set(mySureties.map(s => String(s.empId)));
            for (const rawId of rawEmpIds) {
                if (!coveredEmpIds.has(String(rawId))) {
                    mySureties.push({ empId: rawId, name: null, department: null, isPartial: true });
                }
            }
        }

        const suretyView = {
            hasActiveLoan: !!employee.activeLoan,
            mySureties,
            // Loans I guaranteed
            loansIGuaranteed: (employee.guaranteeingLoans || []).map(loan => ({
                loanId: loan._id,
                borrowerName: loan.borrower?.name || 'N/A',
                borrowerId: loan.borrower?.empId || 'N/A', // corrected: empId not employeeId
                borrowerDepartment: loan.borrower?.department || 'N/A',
                loanAmount: loan.loanAmount || 0,
                balance: loan.remainingBalance || 0,
                status: loan.status
            }))
        };

        res.json(suretyView);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update own email and phone (first-login profile completion)
// @route   PUT /api/employee/update-profile
// @access  Private/Employee
const updateMyProfile = async (req, res) => {
    try {
        const { email, phone, panNumber, aadhaarNumber } = req.body;

        const normalizedPan = panNumber ? String(panNumber).toUpperCase().trim() : '';
        const normalizedAadhaar = aadhaarNumber ? String(aadhaarNumber).replace(/\s+/g, '').trim() : '';

        if (!email || !String(email).includes('@')) {
            return res.status(400).json({ message: 'Please provide a valid email address' });
        }
        if (!phone || String(phone).trim().length < 6) {
            return res.status(400).json({ message: 'Please provide a valid phone number' });
        }

        // Optional but validated if provided
        if (normalizedPan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(normalizedPan)) {
            return res.status(400).json({ message: 'Please provide a valid PAN number' });
        }
        if (normalizedAadhaar && !/^[0-9]{12}$/.test(normalizedAadhaar)) {
            return res.status(400).json({ message: 'Please provide a valid Aadhaar number' });
        }

        const employee = await Employee.findById(req.user.employeeId);
        if (!employee) {
            return res.status(404).json({ message: 'Employee profile not found' });
        }

        // Check email not already used by another employee
        const emailConflict = await Employee.findOne({
            email: email.toLowerCase().trim(),
            _id: { $ne: employee._id }
        });
        if (emailConflict) {
            return res.status(400).json({ message: 'This email is already registered to another employee' });
        }

        employee.email = email.toLowerCase().trim();
        employee.phone = String(phone).trim();

        if (normalizedPan) employee.panNumber = normalizedPan;
        if (normalizedAadhaar) employee.aadhaarNumber = normalizedAadhaar;
        await employee.save();

        res.json({ message: 'Profile updated successfully', employee });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getMyProfile,
    getDashboardSummary,
    getMyTransactions,
    getMyLoanDetails,
    getMySuretyView,
    updateMyProfile
};
