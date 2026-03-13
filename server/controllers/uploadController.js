/* eslint-disable no-unused-vars */
const Employee = require('../models/Employee');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AdjustmentHistory = require('../models/AdjustmentHistory');
const MonthlyUploadLog = require('../models/MonthlyUploadLog');
const Loan = require('../models/Loan');
const BalanceSheetMonth = require('../models/BalanceSheetMonth');
const xlsx = require('xlsx');
const fs = require('fs');
const archiveOldMonths = require('../utils/archiveOldMonths');

// Column name mapping: accept multiple variations for each field (including real-world typos)
// Reference template columns (vema reference.xlsx):
//   Emp. ID | Name of the Employ | CB Thrift Amount As on | Loan | Loan Re payment
//   Intrest | Monthly Threft Amount | Total  Amount | Paid Amount | Loan Amount
//   Thrift | Total monthly deduction | surity1 Emp .ID … surity6 Emp .ID
const COLUMN_MAP = {
    empId:          ['Emp. ID', 'Emp.ID', 'EmpID', 'Emp ID', 'Employee ID'],
    name:           ['Name of the Employ', 'Name', 'Employee Name', 'Name of Employee'],
    // 'CB Thrift Amount As on [date]' — startsWith 'CB Thrift Amount' catches date-suffixed headers
    cbThrift:       ['CB Thrift Amount As on', 'CB Thrift Amount', 'CB Thrift', 'CB Threft Amount', 'CB Threft', 'Thrift Balance', 'CBThrift'],
    loan:           ['Loan', 'Loan Bal', 'Loan Balance', 'Loan Outstanding', 'Loan Bal.', 'Loan O/S', 'Outstanding Balance', 'O/S Loan', 'Bal Loan', 'Balance Loan', 'Loan Pending', 'Pending Loan', 'Loan OS'],
    loanRepayment:  ['Loan Re payment', 'Loan Re Payment', 'Loan Repayment', 'Loan Repaymnt', 'Loan Re-payment', 'Loan re payment', 'LoanRepayment', 'LoanRePayment', 'Loan repay', 'Loan EMI', 'EMI'],
    interest:       ['Intrest', 'Interest', 'Intrst', 'Interest Amount', 'Intrest Amount', 'Inrest', 'Interset', 'Int Amount', 'Int Amt'],
    monthlyThrift:  ['Monthly Threft Amount', 'Monthly Thrift Amount', 'Monthly Thrft Amount', 'Monthly Threft', 'Monthly Thrift', 'Monthly Thrft', 'MonthlyThrift', 'Month Thrift Amt', 'Mnthly Thrift'],
    totalAmount:    ['Total  Amount', 'Total Amount', 'TotalAmount', 'Total Amt', 'TotalAmt', 'Tot Amount', 'Tot Amt'],
    paidAmount:     ['Paid Amount', 'PaidAmount', 'Paid Amt', 'Amount Paid', 'Amt Paid'],
    // 'Loan Amount' = monthly total EMI deduction (principal + interest)
    loanAmount:     ['Loan Amount', 'LoanAmount', 'Loan Amt', 'LoanAmt'],
    thrift:         ['Thrift', 'Monthly Threft Amount', 'Monthly Thrift Amount', 'Monthly Threft', 'Monthly Thrift', 'Thrift Amount', 'Thrift Amt', 'MonthlyThrift'],
    totalDeduction: ['Total monthly deduction', 'Total Monthly Deduction', 'Total Deduction', 'TotalDeduction', 'Total Deduct', 'Tot Deduction', 'Total Ded'],
    surity:         ['Surity', 'Surety', 'Guarantee'],
    // Reference: 'surity1 Emp .ID' — startsWith 'surity1' catches these variants
    surity1:        ['surity1 Emp .ID', 'surity1 Emp ID', 'surity1', 'Surity1', 'Surety1'],
    surity2:        ['surity2 Emp .ID', 'surity2 Emp ID', 'surity2', 'Surity2', 'Surety2'],
    surity3:        ['surity3 Emp .ID', 'surity3 Emp ID', 'surity3', 'Surity3', 'Surety3'],
    surity4:        ['surity4 Emp .ID', 'surity4 Emp ID', 'surity4', 'Surity4', 'Surety4'],
    surity5:        ['surity5 Emp .ID', 'surity5 Emp ID', 'surity5', 'Surity5', 'Surety5'],
    surity6:        ['surity6 Emp .ID', 'surity6 Emp ID', 'surity6', 'Surity6', 'Surety6'],
    phone:          ['Phone', 'Mobile No', 'Mobile', 'Contact', 'Phone No', 'Mob No', 'Cell', 'Phone Number', 'Mobile Number'],
    enttryFee:      ['enttry fee', 'entry fee'],
    shareCapital:   ['share capital', 'share'],
    fdClosed:       ['fd closed', 'fd close', 'fd closure'],
    bankIntrest:    ['bank intrest', 'bank interest'],
    cashInHand:     ['cash in hand', 'cash'],
    loanApplicationFee: ['loan application fee', 'loan app fee'],
    loansIssue:     ['loans issue', 'loan issue', 'loan issued'],
    thriftRefundToMembers: ['thrift refund to members', 'thrift refund'],
    scRefund:       ['sc refund', 'share capital refund'],
    fixedDepositInBank: ['fixed deposit in bank', 'fd in bank', 'fixed deposit'],
    salaryForAccountent: ['salary for accountent', 'salary for accountant', 'accountant salary'],
    expenditure:    ['expenditure', 'expense'],
    expenditureRemarks: ['expenditure remarks', 'expenditure remark', 'remarks', 'narration']
};

// Normalize a string: trim, collapse internal whitespace, lowercase
const normalize = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();

// Find matching column name from a row's keys
const findColumn = (rowKeys, fieldAliases) => {
    // First try exact match (after normalizing whitespace)
    for (const alias of fieldAliases) {
        const normAlias = normalize(alias);
        const found = rowKeys.find(k => normalize(k) === normAlias);
        if (found) return found;
    }
    // Then try startsWith match — only for longer aliases (>= 8 chars) to avoid
    // short words like 'loan' matching multi-word columns like 'Loan Re payment'
    for (const alias of fieldAliases) {
        const normAlias = normalize(alias);
        if (normAlias.length < 8) continue;
        const found = rowKeys.find(k => normalize(k).startsWith(normAlias));
        if (found) return found;
    }
    return null;
};

// Helper: validate and normalize a row with the new format, collecting warnings
const validateMonthlyRow = (row, rowIndex, columnMapping) => {
    const warnings = [];
    const normalized = {};

    // Emp. ID (required for identification — can be number or string like "VT-1")
    const empIdCol = columnMapping.empId;
    if (empIdCol && row[empIdCol] !== undefined && row[empIdCol] !== '') {
        normalized.empId = String(row[empIdCol]).trim();
    } else {
        normalized.empId = null;
    }

    // Name (for reference/display only)
    const nameCol = columnMapping.name;
    normalized.name = nameCol && row[nameCol] ? String(row[nameCol]).trim() : '';

    // Numeric fields with defaults
    const numericFields = [
        { key: 'cbThrift', label: 'CB Thrift Amount', default: 0 },
        { key: 'loan', label: 'Loan', default: 0 },
        { key: 'loanRepayment', label: 'Loan Re payment', default: 0 },
        { key: 'interest', label: 'Interest', default: 0 },
        { key: 'monthlyThrift', label: 'Monthly Thrift Amount', default: 0 },
        { key: 'thrift', label: 'Thrift', default: 0 },
        { key: 'totalAmount', label: 'Total Amount', default: 0 },
        { key: 'paidAmount', label: 'Paid Amount', default: 0 },
        { key: 'loanAmount', label: 'Loan Amount', default: 0 },
        { key: 'totalDeduction', label: 'Total monthly deduction', default: 0 }
    ];

    for (const field of numericFields) {
        const col = columnMapping[field.key];
        if (col && row[col] !== undefined && row[col] !== null && row[col] !== '') {
            const val = Number(row[col]);
            if (isNaN(val)) {
                warnings.push({ row: rowIndex, column: field.label, issue: `Invalid number "${row[col]}", defaulting to 0` });
                normalized[field.key] = field.default;
            } else {
                normalized[field.key] = val;
            }
        } else {
            if (col) {
                warnings.push({ row: rowIndex, column: field.label, issue: 'Missing value, defaulting to 0' });
            }
            normalized[field.key] = field.default;
        }
    }

    // Phone number (optional — store as string, keep existing if empty in Excel)
    const phoneCol = columnMapping.phone;
    normalized.phone = phoneCol && row[phoneCol] ? String(row[phoneCol]).trim() : '';

    // Surety fields (string employee IDs)
    // Handle numbers (19 or 19.0 → "19"), strings ("VT-1"), and empty/null/0
    for (let i = 1; i <= 6; i++) {
        const col = columnMapping[`surity${i}`];
        if (!col || row[col] === undefined || row[col] === null || row[col] === '') {
            normalized[`surity${i}`] = '';
        } else {
            const raw = row[col];
            const str = String(raw).trim();
            // Convert float empIds like "19.0" to "19"
            if (str !== '' && !isNaN(Number(str))) {
                normalized[`surity${i}`] = String(Math.round(Number(str)));
            } else {
                normalized[`surity${i}`] = str;
            }
        }
    }

    return { normalized, warnings };
};

const uploadMonthlyUpdate = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Please upload a file' });
    }

    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Try to detect if the sheet has Vignan header rows (skip them)
        const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        let headerRowIdx = 0;

        // Try to detect the month from the Excel header rows (e.g., "OCTOBER - 2025")
        let detectedMonth = null;
        const monthNames = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
        for (let i = 0; i < Math.min(rawData.length, 10); i++) {
            const cellStr = String(rawData[i]?.[0] || '').trim().toUpperCase();
            for (let m = 0; m < monthNames.length; m++) {
                if (cellStr.includes(monthNames[m])) {
                    // Extract year from the same cell
                    const yearMatch = cellStr.match(/\d{4}/);
                    if (yearMatch) {
                        detectedMonth = `${yearMatch[0]}-${String(m + 1).padStart(2, '0')}`;
                        break;
                    }
                }
            }
            if (detectedMonth) break;
        }

        // Use: 1) request body month, 2) detected from Excel, 3) current month
        const uploadMonth = req.body?.month || detectedMonth || new Date().toISOString().slice(0, 7);

        // Scan for the actual header row by checking for 'Emp. ID' or 'Emp ID' as a distinct cell value
        for (let i = 0; i < Math.min(rawData.length, 15); i++) {
            const cells = (rawData[i] || []).map(c => String(c || '').trim().replace(/\s+/g, ' ').toLowerCase());
            const hasEmpId = cells.some(c => c === 'emp. id' || c === 'emp id' || c === 'emp.id' || c === 'empid');
            const hasName = cells.some(c => c.includes('name of') || c === 'name' || c === 'employee name');
            if (hasEmpId && hasName) {
                headerRowIdx = i;
                break;
            }
        }

        // Parse data with detected header row
        const data = xlsx.utils.sheet_to_json(sheet, { range: headerRowIdx });

        if (data.length === 0) {
            throw new Error('No data rows found in the Excel file');
        }

        // Collect ALL unique column keys across every row — xlsx.utils.sheet_to_json
        // only includes keys that exist in each individual row, so the first row
        // (often a no-loan employee) may not have surety/loan columns at all.
        const allRowKeysSet = new Set();
        for (const row of data) {
            for (const k of Object.keys(row)) allRowKeysSet.add(k);
        }
        const allRowKeys = Array.from(allRowKeysSet);
        console.log('[Upload] All unique column keys across all rows:', allRowKeys.join(', '));

        const columnMapping = {};
        for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
            columnMapping[field] = findColumn(allRowKeys, aliases);
        }

        // Regex fallback for surety columns — handles any spacing/casing variant:
        // e.g. "Surity 1 Emp ID", "surity1 Emp .ID", "Surety 1", "Surety-1"
        // sur[iey] matches both 'surity' and 'surety'
        for (let si = 1; si <= 6; si++) {
            if (!columnMapping[`surity${si}`]) {
                const re = new RegExp(`sur[iey][^\\d]*${si}`, 'i');
                const found = allRowKeys.find(k => re.test(k));
                if (found) columnMapping[`surity${si}`] = found;
            }
        }
        const detectedSurityCols = [1,2,3,4,5,6].map(i => `surity${i}:${columnMapping[`surity${i}`]||'—'}`).join(' | ');
        console.log('[Upload] Surety columns detected:', detectedSurityCols);

        // Check if we have at minimum empId or name for identification
        if (!columnMapping.empId && !columnMapping.name) {
            throw new Error('Could not find "Emp. ID" or "Name" column. Please check your Excel format.');
        }

        const log = new MonthlyUploadLog({
            uploadedBy: req.user._id,
            fileName: req.file.originalname,
            fileType: 'monthly_update',
            totalRecords: data.length,
            successCount: 0,
            failureCount: 0,
            errorLog: []
        });

        const allWarnings = [];
        const processedIds = []; // track employee IDs processed in this upload

        // Pull month-level balance sheet heads from the same uploaded Excel.
        const headFieldKeys = [
            'enttryFee', 'shareCapital', 'fdClosed', 'bankIntrest', 'cashInHand',
            'loanApplicationFee', 'loansIssue', 'thriftRefundToMembers', 'scRefund',
            'fixedDepositInBank', 'salaryForAccountent', 'expenditure'
        ];
        const extractedHeads = {};
        const hasHeadColumn = {};
        for (const key of headFieldKeys) {
            extractedHeads[key] = 0;
            hasHeadColumn[key] = !!columnMapping[key];
        }
        const extractedRemarks = new Set();

        for (const row of data) {
            for (const key of headFieldKeys) {
                const col = columnMapping[key];
                if (!col) continue;
                const raw = row[col];
                if (raw === undefined || raw === null || String(raw).trim() === '') continue;
                const n = Number(raw);
                if (!isNaN(n)) extractedHeads[key] += n;
            }

            if (columnMapping.expenditureRemarks) {
                const rawRemark = row[columnMapping.expenditureRemarks];
                const remark = String(rawRemark || '').trim();
                if (remark && remark.toUpperCase() !== 'TOTAL') extractedRemarks.add(remark);
            }
        }

        for (const [index, row] of data.entries()) {
            const rowNumber = headerRowIdx + index + 2; // Actual Excel row

            try {
                // Skip empty rows or total rows
                const snoCol = allRowKeys.find(k => k.toLowerCase().includes('s.no') || k.toLowerCase() === 'sno');
                if (snoCol && (row[snoCol] === '' || row[snoCol] === undefined)) continue;
                const nameColKey = columnMapping.name;
                if (nameColKey && String(row[nameColKey] || '').toUpperCase() === 'TOTAL') continue;

                const { normalized, warnings } = validateMonthlyRow(row, rowNumber, columnMapping);
                allWarnings.push(...warnings);

                // Find employee by empId first (try both string and numeric), then by name
                let employee = null;
                if (normalized.empId) {
                    // Try string match
                    employee = await Employee.findOne({ empId: normalized.empId });
                    // Also try numeric match if the value is a valid number
                    if (!employee && !isNaN(Number(normalized.empId))) {
                        employee = await Employee.findOne({ empId: Number(normalized.empId) });
                    }
                }
                if (!employee && normalized.name) {
                    // Try case-insensitive name match
                    employee = await Employee.findOne({
                        name: { $regex: new RegExp(`^${normalized.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
                    });
                }

                if (!employee) {
                    throw new Error(`Employee not found (Emp.ID: ${normalized.empId || 'N/A'}, Name: "${normalized.name || 'N/A'}")`);
                }

                // Save phone number if provided in Excel (never overwrite existing with empty)
                if (normalized.phone && normalized.phone.trim() !== '') {
                    employee.phone = normalized.phone.trim();
                }

                // Update Employee Financials
                const thriftDeduction = normalized.monthlyThrift || normalized.thrift || 0;
                if (thriftDeduction > 0) {
                    employee.thriftContribution = thriftDeduction;
                    employee.thriftBalance = Math.round((employee.thriftBalance + thriftDeduction) * 100) / 100;
                }
                // If Excel provides the authoritative closing balance, use it to override the incremented value
                if (normalized.cbThrift > 0) {
                    employee.thriftBalance = Math.round(normalized.cbThrift * 100) / 100;
                }

                // Handle Loan Updates
                let loanDeduction = normalized.loanRepayment || 0;
                let interestPayment = normalized.interest || 0;
                // In the Excel, "Loan Amount" column = total EMI (principal + interest)
                const emiTotal = normalized.loanAmount > 0 ? normalized.loanAmount : (loanDeduction + interestPayment);

                if (normalized.loan > 0 || loanDeduction > 0 || interestPayment > 0) {
                    let loan = null;

                    // Try to find existing active loan
                    if (employee.activeLoan) {
                        loan = await Loan.findById(employee.activeLoan);
                    }

                    // Step 1b: If activeLoan reference is null, find any orphaned active Loan for this employee
                    // (happens when employee was imported but activeLoan field was never linked)
                    if (!loan) {
                        const orphanedLoan = await Loan.findOne({ borrower: employee._id, status: 'active' });
                        if (orphanedLoan) {
                            loan = orphanedLoan;
                            employee.activeLoan = orphanedLoan._id; // Relink
                        }
                    }

                    // Step 1b2: If still no loan, check if there's a recently closed loan we should reopen
                    // (happens when a previous upload accidentally zero'd out the balance)
                    if (!loan) {
                        const closedLoan = await Loan.findOne({ borrower: employee._id, status: 'closed' }).sort({ updatedAt: -1 });
                        if (closedLoan && normalized.loan > 0) {
                            // Excel still shows a balance — reopen the loan
                            closedLoan.status = 'active';
                            closedLoan.remainingBalance = normalized.loan;
                            if (emiTotal > 0) closedLoan.emi = emiTotal;
                            await closedLoan.save();
                            loan = closedLoan;
                            employee.activeLoan = closedLoan._id;
                        }
                    }

                    // Step 1c: Auto-create a Loan document if Excel shows a loan balance but no document exists.
                    // Also auto-create if EMI/interest data present even when balance column is 0
                    const shouldCreateLoan = !loan && (normalized.loan > 0 || loanDeduction > 0 || interestPayment > 0);
                    let wasJustCreated = false;
                    if (shouldCreateLoan) {
                        const loanBalance = normalized.loan > 0 ? normalized.loan : 0;
                        // Estimate interest rate: (interest / balance) * 12 * 100, default 12%
                        const estimatedRate = (interestPayment > 0 && loanBalance > 0)
                            ? Math.round((interestPayment / loanBalance) * 1200 * 10) / 10
                            : 12;
                        // When balance column is missing/0, estimate 24 months from EMI so loan doesn't immediately close
                        const estimatedBalance = loanBalance || (emiTotal * 24) || (loanDeduction * 24);

                        loan = new Loan({
                            borrower: employee._id,
                            loanAmount: loanBalance || (emiTotal * 36), // rough estimate if balance missing
                            interestRate: estimatedRate,
                            emi: emiTotal > 0 ? emiTotal : loanDeduction,
                            remainingBalance: estimatedBalance,
                            totalInterestPaid: 0,
                            status: 'active'
                        });
                        await loan.save();
                        employee.activeLoan = loan._id;
                        wasJustCreated = true;
                    }

                    if (loan) {
                        // Excel's "Loan" column is the authoritative remaining balance for this month
                        if (normalized.loan > 0) {
                            loan.remainingBalance = normalized.loan;
                        } else if (loanDeduction > 0) {
                            const principalComponent = Math.max(0, loanDeduction - interestPayment);
                            loan.remainingBalance = Math.max(0, loan.remainingBalance - principalComponent);
                        }

                        if (interestPayment > 0) {
                            loan.totalInterestPaid = (loan.totalInterestPaid || 0) + interestPayment;
                        }

                        // Update EMI if Excel provides it
                        if (emiTotal > 0) {
                            loan.emi = emiTotal;
                        }

                        if (loan.remainingBalance <= 0 && !wasJustCreated) {
                            loan.status = 'closed';
                            loan.remainingBalance = 0;
                            employee.activeLoan = null;
                            employee.loanStatus = '';
                            // Remove closed loan from all surety employees' guaranteeingLoans
                            if (loan.sureties && loan.sureties.length > 0) {
                                await Employee.updateMany(
                                    { _id: { $in: loan.sureties } },
                                    { $pull: { guaranteeingLoans: loan._id } }
                                );
                            }
                        } else {
                            loan.status = 'active';
                            // Keep employee.loanStatus in sync
                            employee.loanStatus = 'Loan';
                        }

                        // Link sureties from Excel (surity1 Emp .ID … surity6 Emp .ID)
                        // Collect incoming surety empIds from Excel
                        const incomingSuretyEmpIds = [];
                        for (let si = 1; si <= 6; si++) {
                            const sId = normalized[`surity${si}`];
                            if (!sId || sId === '0' || sId === '') continue;
                            incomingSuretyEmpIds.push(String(sId).trim());
                        }
                        if (incomingSuretyEmpIds.length > 0) {
                            console.log(`[Upload] Emp ${employee.empId} sureties from Excel:`, incomingSuretyEmpIds);
                        }

                        // Only process sureties if there are incoming values in the row
                        if (incomingSuretyEmpIds.length > 0) {
                            const newSuretyIds = [];
                            for (const sId of incomingSuretyEmpIds) {
                                let sEmp = await Employee.findOne({ empId: sId });
                                if (!sEmp && !isNaN(Number(sId))) {
                                    sEmp = await Employee.findOne({ empId: Number(sId) });
                                }
                                if (sEmp) newSuretyIds.push(sEmp._id);
                            }

                            // Remove this loan from OLD sureties that are no longer listed
                            const oldSuretyIds = (loan.sureties || []).map(id => id.toString());
                            const newSuretyIdStrs = newSuretyIds.map(id => id.toString());
                            const removedSuretyIds = oldSuretyIds.filter(id => !newSuretyIdStrs.includes(id));
                            for (const removedId of removedSuretyIds) {
                                await Employee.updateOne(
                                    { _id: removedId },
                                    { $pull: { guaranteeingLoans: loan._id } }
                                );
                            }

                            // Add this loan to NEW sureties that weren't listed before
                            for (const sEmpId of newSuretyIds) {
                                await Employee.updateOne(
                                    { _id: sEmpId, guaranteeingLoans: { $ne: loan._id } },
                                    { $addToSet: { guaranteeingLoans: loan._id } }
                                );
                            }

                            loan.sureties = newSuretyIds;
                            // Always save raw empId strings as fallback for display
                            loan.suretyEmpIds = incomingSuretyEmpIds;
                        }

                        await loan.save();
                    }
                } else if (employee.activeLoan) {
                    // Excel shows zero loan balance — close the loan
                    const loan = await Loan.findById(employee.activeLoan);
                    if (loan && loan.status === 'active') {
                        loan.status = 'closed';
                        loan.remainingBalance = 0;
                        // Remove closed loan from all surety employees' guaranteeingLoans
                        if (loan.sureties && loan.sureties.length > 0) {
                            await Employee.updateMany(
                                { _id: { $in: loan.sureties } },
                                { $pull: { guaranteeingLoans: loan._id } }
                            );
                        }
                        await loan.save();
                        employee.activeLoan = null;
                    }
                }

                await employee.save();

                // Create Transaction Record
                const month = uploadMonth;
                const existingTx = await Transaction.findOne({ employee: employee._id, month });

                const totalDeduction = (normalized.totalDeduction || 0) > 0
                    ? normalized.totalDeduction
                    : ((normalized.totalAmount || 0) > 0
                        ? normalized.totalAmount
                        : (thriftDeduction + loanDeduction));

                const txData = {
                    salary: Math.round((employee.salary || 0) * 100) / 100,
                    thriftDeduction: Math.round(thriftDeduction * 100) / 100,
                    loanEMI: Math.round(loanDeduction * 100) / 100,
                    interestPayment: Math.round(interestPayment * 100) / 100,
                    principalRepayment: Math.round(Math.max(0, loanDeduction - interestPayment) * 100) / 100,
                    loanAmount: Math.round((emiTotal || 0) * 100) / 100,
                    totalDeduction: Math.round(totalDeduction * 100) / 100,
                    paidAmount: Math.round((normalized.paidAmount || 0) * 100) / 100,
                    netSalary: Math.round((employee.salary > 0 ? (employee.salary - totalDeduction) : 0) * 100) / 100,
                    // Snapshot balances from Excel — preserved as historical record
                    cbThriftBalance: Math.round((normalized.cbThrift || employee.thriftBalance || 0) * 100) / 100,
                    loanBalance: Math.round((normalized.loan || 0) * 100) / 100
                };

                if (existingTx) {
                    Object.assign(existingTx, txData);
                    await existingTx.save();
                } else {
                    await Transaction.create([{
                        employee: employee._id,
                        month,
                        ...txData
                    }]);
                }

                if (!processedIds.includes(String(employee._id))) {
                    processedIds.push(String(employee._id));
                }
                log.successCount++;

            } catch (err) {
                log.failureCount++;
                log.errorLog.push({ row: rowNumber, error: err.message });
            }
        }

        if (log.failureCount === data.length) {
            log.status = 'failed';
        } else if (log.failureCount > 0) {
            log.status = 'partial';
        }

        await log.save();

        fs.unlinkSync(req.file.path);

        // Auto-sync: for every employee processed in this upload, if their activeLoan is null
        // but there is an active Loan doc (or transaction with loanEMI), link it automatically.
        // This removes the need for any manual "Sync Loans" button after upload.
        if (processedIds.length > 0) {
            const needSync = await Employee.find({
                _id: { $in: processedIds },
                activeLoan: null
            });
            for (const emp of needSync) {
                try {
                    let loan = await Loan.findOne({ borrower: emp._id, status: 'active' });
                    if (loan) {
                        emp.activeLoan = loan._id;
                        emp.loanStatus = 'Loan';
                        await emp.save();
                    } else {
                        const latestTx = await Transaction.findOne(
                            { employee: emp._id, loanEMI: { $gt: 0 } },
                        ).sort({ month: -1 });
                        if (latestTx) {
                            const estimatedBalance = latestTx.principalRepayment > 0
                                ? latestTx.principalRepayment * 24
                                : latestTx.loanEMI * 24;
                            loan = await Loan.create({
                                borrower: emp._id,
                                loanAmount: estimatedBalance,
                                interestRate: 12,
                                emi: latestTx.loanEMI,
                                remainingBalance: estimatedBalance,
                                totalInterestPaid: 0,
                                status: 'active'
                            });
                            emp.activeLoan = loan._id;
                            emp.loanStatus = 'Loan';
                            await emp.save();
                        }
                    }
                } catch (syncErr) {
                    console.error('[AutoSync] Failed for emp', emp.empId, syncErr.message);
                }
            }
        }

        // Archive months older than 4 (runs async, doesn't block response)
        archiveOldMonths().catch(e => console.error('[Archive] background error:', e.message));

        // Auto-upsert month-wise balance sheet summary from uploaded transaction data.
        const monthTransactions = await Transaction.find({ month: uploadMonth })
            .select('thriftDeduction principalRepayment loanEMI interestPayment')
            .lean();

        let thriftTotal = 0;
        let loanRepaymentTotal = 0;
        let intrestTotal = 0;

        for (const tx of monthTransactions) {
            const thrift = Number(tx.thriftDeduction) || 0;
            const intrest = Number(tx.interestPayment) || 0;
            const loanEmi = Number(tx.loanEMI) || 0;
            const principal = (Number(tx.principalRepayment) || 0) > 0
                ? Number(tx.principalRepayment)
                : Math.max(0, loanEmi - intrest);

            thriftTotal += thrift;
            intrestTotal += intrest;
            loanRepaymentTotal += principal;
        }

        await BalanceSheetMonth.findOneAndUpdate(
            { month: uploadMonth },
            {
                $set: {
                    thrift: Math.round(thriftTotal * 100) / 100,
                    loanRepayment: Math.round(loanRepaymentTotal * 100) / 100,
                    intrest: Math.round(intrestTotal * 100) / 100,
                    ...(hasHeadColumn.enttryFee ? { enttryFee: Math.round(extractedHeads.enttryFee) } : {}),
                    ...(hasHeadColumn.shareCapital ? { shareCapital: Math.round(extractedHeads.shareCapital) } : {}),
                    ...(hasHeadColumn.fdClosed ? { fdClosed: Math.round(extractedHeads.fdClosed) } : {}),
                    ...(hasHeadColumn.bankIntrest ? { bankIntrest: Math.round(extractedHeads.bankIntrest) } : {}),
                    ...(hasHeadColumn.cashInHand ? { cashInHand: Math.round(extractedHeads.cashInHand) } : {}),
                    ...(hasHeadColumn.loanApplicationFee ? { loanApplicationFee: Math.round(extractedHeads.loanApplicationFee) } : {}),
                    ...(hasHeadColumn.loansIssue ? { loansIssue: Math.round(extractedHeads.loansIssue) } : {}),
                    ...(hasHeadColumn.thriftRefundToMembers ? { thriftRefundToMembers: Math.round(extractedHeads.thriftRefundToMembers) } : {}),
                    ...(hasHeadColumn.scRefund ? { scRefund: Math.round(extractedHeads.scRefund) } : {}),
                    ...(hasHeadColumn.fixedDepositInBank ? { fixedDepositInBank: Math.round(extractedHeads.fixedDepositInBank) } : {}),
                    ...(hasHeadColumn.salaryForAccountent ? { salaryForAccountent: Math.round(extractedHeads.salaryForAccountent) } : {}),
                    ...(hasHeadColumn.expenditure ? { expenditure: Math.round(extractedHeads.expenditure) } : {}),
                    ...(columnMapping.expenditureRemarks ? { expenditureRemarks: Array.from(extractedRemarks).join('; ') } : {}),
                    updatedBy: req.user._id
                },
                $setOnInsert: {
                    enttryFee: 0,
                    shareCapital: 0,
                    fdClosed: 0,
                    bankIntrest: 0,
                    cashInHand: 0,
                    loanApplicationFee: 0,
                    loansIssue: 0,
                    thriftRefundToMembers: 0,
                    scRefund: 0,
                    fixedDepositInBank: 0,
                    salaryForAccountent: 0,
                    expenditure: 0,
                    expenditureRemarks: ''
                }
            },
            { upsert: true, new: true }
        );

        // Build column detection summary for UI diagnostics
        const columnSummary = {};
        for (const [field, col] of Object.entries(columnMapping)) {
            columnSummary[field] = col || null;
        }

        res.status(201).json({
            message: 'Monthly update processed',
            log,
            warnings: allWarnings,
            columnSummary,
            uploadedMonth: uploadMonth
        });
    } catch (error) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: error.message });
    }
};

module.exports = { uploadMonthlyUpdate };
