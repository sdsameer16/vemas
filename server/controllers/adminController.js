const mongoose = require('mongoose');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Loan = require('../models/Loan');
const Transaction = require('../models/Transaction');
const MonthlyUploadLog = require('../models/MonthlyUploadLog');
const AdjustmentHistory = require('../models/AdjustmentHistory');
const ArchivedMonth = require('../models/ArchivedMonth');
const BalanceSheetMonth = require('../models/BalanceSheetMonth');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const sendEmail = require('../utils/mailer');
const { sendMonthlyUpdateSms } = require('../utils/sms');

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function inr(amount) {
    const num = Number(amount) || 0;
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const sendWelcomeEmail = async ({ name, email, empId, username, password }) => {
    const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/login`;
    await sendEmail(
        email,
        'Welcome to Vignan Society',
        `
<p>Hello <strong>${name}</strong>,</p>
<p>Your account has been created.</p>
<p>
  Employee ID: <strong>${empId || 'N/A'}</strong><br/>
  Username: <strong>${username}</strong><br/>
  Temporary Password: <strong>${password}</strong>
</p>
<p><a href="${loginUrl}">Login</a></p>
`
    );
};

const sendCredentialsSummaryToAdmin = async (createdUsers, fileName) => {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return;

    const rows = createdUsers
        .map(
            (u, i) =>
                `<tr>
                    <td style="padding:6px 10px;border:1px solid #e5e7eb;">${i + 1}</td>
                    <td style="padding:6px 10px;border:1px solid #e5e7eb;">${u.empId || 'N/A'}</td>
                    <td style="padding:6px 10px;border:1px solid #e5e7eb;">${u.name}</td>
                    <td style="padding:6px 10px;border:1px solid #e5e7eb;">${u.username}</td>
                    <td style="padding:6px 10px;border:1px solid #e5e7eb;">${u.password}</td>
                </tr>`
        )
        .join('');

    await sendEmail(
        adminEmail,
        `Employee credentials created (${createdUsers.length})`,
        `
<p>${createdUsers.length} employee account(s) were created from <strong>${fileName}</strong>.</p>
<table style="border-collapse:collapse;">
  <thead>
    <tr>
      <th style="padding:6px 10px;border:1px solid #e5e7eb;">#</th>
      <th style="padding:6px 10px;border:1px solid #e5e7eb;">Emp ID</th>
      <th style="padding:6px 10px;border:1px solid #e5e7eb;">Name</th>
      <th style="padding:6px 10px;border:1px solid #e5e7eb;">Username</th>
      <th style="padding:6px 10px;border:1px solid #e5e7eb;">Temp Password</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
`
    );
};

const sendMonthlyUpdateNotification = async (employee, displayMonth, txData = null, monthKey = '', dividend = 0) => {
        const portalUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}`;

    const thriftBalance = txData?.cbThriftBalance ?? employee?.thriftBalance ?? 0;
    const loanBalance = txData?.loanBalance ?? 0;
    const suretySignatures = Array.isArray(employee?.guaranteeingLoans) ? employee.guaranteeingLoans.length : 0;

    const balancesRows = [
        ['Thrift Balance', `₹${inr(thriftBalance)}`],
        ['Loan Balance', `₹${inr(loanBalance)}`],
        ['Surety Signatures', String(suretySignatures)],
        ['Dividend', `₹${inr(dividend)}`],
    ];

    const deductionRows = [
        ['Monthly Thrift Contribution', `₹${inr(txData?.thriftDeduction ?? 0)}`],
        ['Monthly Loan Repayment', `₹${inr(txData?.principalRepayment ?? 0)}`],
        ['Monthly Interest Amount', `₹${inr(txData?.interestPayment ?? 0)}`],
        ['Total Monthly Deduction', `₹${inr(txData?.totalDeduction ?? 0)}`],
    ];

    const renderTable = (rows) => `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#ffffff;">
            <tbody>
                ${rows
                    .map(
                        ([label, value], idx) => `
                    <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
                        <td style="padding:12px 14px;border-bottom:1px solid #eef2f7;color:#334155;font-size:14px;">${escapeHtml(label)}</td>
                        <td style="padding:12px 14px;border-bottom:1px solid #eef2f7;color:#0f172a;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(value)}</td>
                    </tr>`
                    )
                    .join('')}
            </tbody>
        </table>
    `;

    const balancesTable = renderTable(balancesRows);
    const deductionTable = renderTable(deductionRows);

    const missingTxBanner = txData
        ? ''
        : `
            <div style="margin-top:12px;padding:12px 14px;border:1px solid #fde68a;background:#fffbeb;border-radius:12px;color:#92400e;font-size:14px;">
                Monthly deduction details for <strong>${escapeHtml(displayMonth)}</strong> are not available yet. Amounts may show as 0. Please open the portal to view your latest update.
            </div>
        `;

        const html = `
<!doctype html>
<html>
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Monthly Update</title>
    </head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
            Your monthly update for ${escapeHtml(displayMonth)} is ready.
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9;padding:24px 0;">
            <tr>
                <td align="center" style="padding:0 16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;">
                        <tr>
                            <td style="padding:18px 18px 10px 18px;color:#0f172a;font-weight:800;font-size:18px;">
                                Vignan Society
                            </td>
                        </tr>
                        <tr>
                            <td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:22px 20px;">
                                <div style="font-size:16px;color:#0f172a;line-height:1.5;">
                                    Dear <strong>${escapeHtml(employee.name)}</strong>,
                                </div>
                                <div style="margin-top:8px;font-size:14px;color:#475569;line-height:1.6;">
                                    Your monthly update for <strong>${escapeHtml(displayMonth)}</strong> is ready.
                                    ${employee.empId != null ? ` <span style="color:#94a3b8;">(Emp ID: ${escapeHtml(employee.empId)})</span>` : ''}
                                </div>

                                <div style="margin-top:18px;">
                                    <div style="font-size:13px;color:#64748b;margin-bottom:10px;font-weight:700;">Monthly Update Details ${monthKey ? `(${escapeHtml(monthKey)})` : ''}</div>
                                    ${balancesTable}
                                    <div style="height:12px;line-height:12px;">&nbsp;</div>
                                    <div style="font-size:13px;color:#64748b;margin-bottom:10px;font-weight:700;">Monthly Deduction Details</div>
                                    ${deductionTable}
                                    ${missingTxBanner}
                                </div>

                                <div style="margin-top:18px;text-align:center;">
                                    <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:800;font-size:14px;">
                                        Open Portal
                                    </a>
                                </div>

                                <div style="margin-top:16px;font-size:12px;color:#94a3b8;line-height:1.5;text-align:center;">
                                    If the button doesn’t work, open this link:<br/>
                                    <a href="${escapeHtml(portalUrl)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(portalUrl)}</a>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:14px 18px;color:#94a3b8;font-size:12px;text-align:center;">
                                © ${new Date().getFullYear()} Vignan Society
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>
`;

        await sendEmail(
                employee.email,
                `Vignan Society - ${displayMonth} Monthly Update`,
                html
        );
};

// @desc    Get Admin Dashboard Stats
// @route   GET /api/admin/dashboard
// @access  Private/Admin
const getDashboardStats = async (req, res) => {
    try {
        const totalEmployees = await Employee.countDocuments();

        // Aggregation to sum thrift balances
        const thriftStats = await Employee.aggregate([
            { $group: { _id: null, total: { $sum: "$thriftBalance" } } }
        ]);
        const totalThrift = thriftStats.length > 0 ? thriftStats[0].total : 0;

        // Active loans count
        const activeLoans = await Loan.countDocuments({ status: 'active' });

        // Monthly deduction summary (current month)
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const deductionStats = await Transaction.aggregate([
            { $match: { month: currentMonth } },
            {
                $group: {
                    _id: null,
                    totalSalary: { $sum: "$salary" },
                    totalThrift: { $sum: "$thriftDeduction" },
                    totalEMI: { $sum: "$loanEMI" }
                }
            }
        ]);

        res.json({
            totalEmployees,
            totalThrift,
            activeLoans,
            monthlySummary: deductionStats[0] || {}
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all employees
// @route   GET /api/admin/employees
// @access  Private/Admin
const getEmployees = async (req, res) => {
    try {
        const employees = await Employee.find({}).populate({
            path: 'activeLoan',
            select: 'loanAmount remainingBalance emi interestRate status sureties',
            populate: { path: 'sureties', select: 'name empId' }
        });
        res.json(employees);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get single employee details
// @route   GET /api/admin/employees/:id
// @access  Private/Admin
const getEmployeeDetails = async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.id)
            .populate({ path: 'activeLoan', populate: { path: 'sureties', select: 'name empId' } })
            .populate({ path: 'guaranteeingLoans', populate: { path: 'borrower', select: 'name empId' } });

        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        res.json(employee);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create new employee manually
// @route   POST /api/admin/employees
// @access  Private/Admin
const createEmployee = async (req, res) => {
    try {
        const { empId, name, email, department, designation, phone, salary, thriftContribution } = req.body;

        const normalizedEmpId = empId !== undefined && empId !== null && String(empId).trim() !== ''
            ? String(empId).trim()
            : null;

        if (normalizedEmpId) {
            const existingByEmpId = await Employee.findOne({
                $or: [{ empId: normalizedEmpId }, { empId: Number(normalizedEmpId) }]
            });
            if (existingByEmpId) {
                return res.status(400).json({ message: 'Employee already exists with this Emp ID' });
            }
        }

        const employeeExists = await Employee.findOne({ email });
        if (employeeExists) {
            return res.status(400).json({ message: 'Employee already exists' });
        }

        const employee = await Employee.create({
            empId: normalizedEmpId || undefined,
            name,
            email,
            department,
            designation,
            phone,
            salary,
            thriftContribution
        });

        // Create User account for employee
        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-8);
        const loginUsername = normalizedEmpId || email;

        if (!loginUsername) {
            return res.status(400).json({ message: 'Emp ID or Email is required to create login credentials' });
        }

        await User.create({
            username: loginUsername,
            password: tempPassword, // Will be hashed by pre-save hook
            role: 'employee',
            employeeId: employee._id
        });

        res.status(201).json({
            employee,
            tempCredentials: { username: loginUsername, password: tempPassword }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Upload Employees via Excel
// @route   POST /api/admin/upload/employees
// @access  Private/Admin
const uploadEmployeeExcel = async (req, res) => {
    console.log('===== UPLOAD EMPLOYEE EXCEL - NEW VERSION =====');
    
    if (!req.file) {
        return res.status(400).json({ message: 'Please upload a file' });
    }

    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Detect header row (for Vignan format with multiple header rows)
        const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        let headerRowIdx = 0;
        
        // Scan for actual header row by checking for 'Emp. ID' or 'Name'
        for (let i = 0; i < Math.min(rawData.length, 15); i++) {
            const cells = (rawData[i] || []).map(c => String(c || '').trim().replace(/\s+/g, ' ').toLowerCase());
            const hasEmpId = cells.some(c => c.includes('emp') && (c.includes('id') || c.includes('.id')));
            const hasName = cells.some(c => c.includes('name'));
            if (hasEmpId && hasName) {
                headerRowIdx = i;
                break;
            }
        }
        
        // Parse data with detected header row
        const data = xlsx.utils.sheet_to_json(sheet, { range: headerRowIdx });
        console.log(`Header row detected at index ${headerRowIdx}, data rows: ${data.length}`);

        const log = new MonthlyUploadLog({
            uploadedBy: req.user._id, // Assuming req.user is set by auth middleware
            fileName: req.file.originalname,
            fileType: 'employee_data',
            totalRecords: data.length,
            successCount: 0,
            failureCount: 0,
            errorLog: []
        });

        const successRecords = [];
        const createdUsers = []; // Store created credentials (only for employees with email)
        const skippedExisting = []; // Track already-existing employees
        
        // Detect column names (handle both simple format and Vignan format)
        const firstRowKeys = Object.keys(data[0] || {});
        const normalize = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
        
        const findCol = (aliases) => {
            for (const alias of aliases) {
                const normAlias = normalize(alias);
                const found = firstRowKeys.find(k => normalize(k).includes(normAlias) || normalize(k).startsWith(normAlias));
                if (found) return found;
            }
            return null;
        };
        
        const empIdCol = findCol(['emp. id', 'emp id', 'empid', 'employee id']);
        const nameCol = findCol(['name of the employ', 'name', 'employee name']);
        const emailCol = findCol(['email', 'e-mail']);
        const deptCol = findCol(['department', 'dept']);
        const designCol = findCol(['designation', 'position']);
        const phoneCol = findCol(['phone', 'mobile', 'contact']);
        const salaryCol = findCol(['salary', 'basic salary']);
        // Monthly thrift contribution (deduction)
        const monthlyThriftCol = findCol(['monthly thrift amount', 'monthly threft amount', 'monthly thrft amount', 'monthly thrift', 'monthly threft', 'monthly thrft', 'month thrift amt', 'mnthly thrift', 'thrift amount', 'thrift']);
        // Current/closing thrift balance (often in CB column) - supports date-suffixed headers
        const cbThriftCol = findCol(['thrift amount as on', 'cb thrift amount', 'cb thrift', 'thrift balance', 'closing thrift', 'cb threft amount', 'cb threft']);
        // Loan status flag (when file provides a simple status instead of loan details)
        const loanStatusCol = findCol(['loan status', 'loan stat']);
        // Some files may only have a numeric "Loan" column (balance); treat >0 as loan
        const loanCol = loanStatusCol ? null : findCol(['loan balance', 'loan amt', 'loan']);

        console.log('Column detection:', { empIdCol, nameCol, emailCol, deptCol, monthlyThriftCol, cbThriftCol, loanStatusCol, loanCol });

        for (const [index, row] of data.entries()) {
            try {
                // Extract data using detected columns
                const empId = empIdCol && row[empIdCol] !== undefined && row[empIdCol] !== '' ? String(row[empIdCol]).trim() : null;
                const name = nameCol && row[nameCol] ? String(row[nameCol]).trim() : null;
                const email = emailCol && row[emailCol] ? String(row[emailCol]).trim() : null;
                const department = deptCol && row[deptCol] ? String(row[deptCol]).trim() : 'General';
                const designation = designCol && row[designCol] ? String(row[designCol]).trim() : 'Employee';
                const phone = phoneCol && row[phoneCol] ? String(row[phoneCol]).trim() : null;
                const salary = salaryCol && row[salaryCol] ? Number(row[salaryCol]) || 0 : 0;

                // Monthly thrift contribution (shown as "Monthly" in UI)
                const monthlyThrift = monthlyThriftCol && row[monthlyThriftCol] !== undefined && row[monthlyThriftCol] !== ''
                    ? Number(row[monthlyThriftCol]) || 0
                    : 0;

                // Closing/current thrift balance (shown as "Thrift Balance" in UI)
                const cbThrift = cbThriftCol && row[cbThriftCol] !== undefined && row[cbThriftCol] !== ''
                    ? Number(row[cbThriftCol]) || 0
                    : 0;

                // Loan status from Excel
                let loanStatus = '';
                if (loanStatusCol && row[loanStatusCol] !== undefined && row[loanStatusCol] !== null && String(row[loanStatusCol]).trim() !== '') {
                    const raw = String(row[loanStatusCol]).trim().toLowerCase();
                    loanStatus = (raw.includes('loan') || raw.includes('yes') || raw.includes('active')) ? 'Loan' : '';
                } else if (loanCol && row[loanCol] !== undefined && row[loanCol] !== null && String(row[loanCol]).trim() !== '') {
                    const loanVal = Number(row[loanCol]);
                    loanStatus = (!isNaN(loanVal) && loanVal > 0) ? 'Loan' : '';
                }
                
                // Skip empty rows or total rows
                const snoCol = firstRowKeys.find(k => normalize(k).includes('s.no') || normalize(k) === 'sno');
                if (snoCol && (row[snoCol] === '' || row[snoCol] === undefined)) continue;
                if (name && normalize(name) === 'total') continue;
                
                if (!name) {
                    throw new Error('Missing required field: Name');
                }

                // Check if employee already exists (by empId, email, or name)
                let existing = null;
                
                if (empId) {
                    existing = await Employee.findOne({ empId: empId });
                    if (!existing && !isNaN(Number(empId))) {
                        existing = await Employee.findOne({ empId: Number(empId) });
                    }
                }
                
                if (!existing && email) {
                    existing = await Employee.findOne({ email: email });
                }
                
                if (!existing && name) {
                    existing = await Employee.findOne({
                        name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
                    });
                }

                // Also check if a User account with this username already exists
                // (handles Mixed-type empId mismatch where Employee isn't found but User is)
                const username = empId ? String(empId) : null;
                if (!existing && username) {
                    const existingUser = await User.findOne({ username });
                    if (existingUser) existing = { _fromUser: true, empId, name }; // treat as existing
                }
                
                if (existing) {
                    skippedExisting.push({
                        row: headerRowIdx + index + 2,
                        name: name,
                        empId: empId || 'N/A',
                        reason: `Already exists (${empId ? 'Emp.ID: ' + empId : email ? 'Email: ' + email : 'Name: ' + name})`
                    });
                    continue;
                }

                const newEmployee = new Employee({
                    empId: empId || undefined, // undefined → field omitted → sparse unique index skips it
                    name: name,
                    email: email || undefined, // Don't set if not provided
                    department: department,
                    designation: designation,
                    phone: phone,
                    salary: salary,
                    thriftContribution: monthlyThrift,
                    thriftBalance: cbThrift,
                    loanStatus: loanStatus
                });

                await newEmployee.save();

                // Generate User account with empId as username and temporary password
                // Email will be added during first login
                const finalUsername = empId ? String(empId) : `emp_${newEmployee._id}`;
                const tempPassword = Math.random().toString(36).slice(-8);
                
                const newUser = new User({
                    username: finalUsername,
                    password: tempPassword,
                    role: 'employee',
                    employeeId: newEmployee._id,
                    isFirstLogin: true
                });

                await newUser.save();

                createdUsers.push({
                    empId: empId || 'N/A',
                    name: name,
                    email: email || null, // included so welcome email can be sent
                    username: finalUsername,
                    password: tempPassword,
                    employeeId: newEmployee._id
                });

                log.successCount++;
                successRecords.push(newEmployee);
            } catch (err) {
                console.error(`Row ${headerRowIdx + index + 2} error:`, err.message);
                log.failureCount++;
                log.errorLog.push({ row: headerRowIdx + index + 2, error: err.message });
            }
        }

        // Set totalRecords to reflect actual processing (exclude skipped)
        log.totalRecords = data.length;

        if (log.successCount === 0 && log.failureCount === 0 && skippedExisting.length > 0) {
            log.status = 'success'; // All were already existing, nothing to do
        } else if (log.failureCount === data.length) {
            log.status = 'failed';
        } else if (log.failureCount > 0) {
            log.status = 'partial';
        }

        await log.save();

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        // ── Email notifications (non-blocking — don't fail the response if email fails) ──
        let emailsSent = 0;
        let emailErrors = [];
        if (createdUsers.length > 0) {
            // 1. Welcome email to each employee that has an email address
            for (const u of createdUsers) {
                if (u.email) {
                    try {
                        await sendWelcomeEmail(u);
                        emailsSent++;
                    } catch (emailErr) {
                        console.warn(`Welcome email failed for ${u.email}:`, emailErr.message);
                        emailErrors.push(u.email);
                    }
                }
            }
            // 2. Summary email to admin's own inbox ("mail to self")
            try {
                await sendCredentialsSummaryToAdmin(createdUsers, req.file ? req.file.originalname : 'upload');
                emailsSent++;
                console.log(`Credentials summary sent to admin email.`);
            } catch (emailErr) {
                console.warn('Admin summary email failed:', emailErr.message);
                emailErrors.push('admin-summary');
            }
        }

        res.status(201).json({
            message: 'Processing complete',
            log,
            createdUsers,     // New employee credentials
            skippedExisting,  // Already-existing employees that were skipped
            emailsSent,
            emailErrors: emailErrors.length > 0 ? emailErrors : undefined
        });

    } catch (error) {
        console.error('===== UPLOAD ERROR =====');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        
        // Try to return the log with errors if it exists
        try {
            const log = new MonthlyUploadLog({
                uploadedBy: req.user._id,
                fileName: req.file.originalname,
                fileType: 'employee_data',
                totalRecords: 0,
                successCount: 0,
                failureCount: 0,
                status: 'failed',
                errorLog: [{ row: 0, error: error.message }]
            });
            await log.save();
        } catch (logErr) {
            console.error('Failed to save error log:', logErr);
        }
        
        // Clean up uploaded file
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update employee details
// @route   PUT /api/admin/employees/:id
// @access  Private/Admin
const updateEmployee = async (req, res) => {
    try {
        const { name, email, department, designation, phone, salary, thriftContribution } = req.body;

        // Check if email is being changed and if it already exists
        if (email) {
            const emailExists = await Employee.findOne({ email, _id: { $ne: req.params.id } });
            if (emailExists) {
                return res.status(400).json({ message: 'Email already in use' });
            }
        }

        const employee = await Employee.findByIdAndUpdate(
            req.params.id,
            {
                name,
                email,
                department,
                designation,
                phone,
                salary,
                thriftContribution
            },
            { new: true }
        );

        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        // Also update User email/username if it changed
        if (email) {
            await User.findOneAndUpdate({ employeeId: employee._id }, { username: email });
        }

        res.json(employee);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete employee
// @route   DELETE /api/admin/employees/:id
// @access  Private/Admin
const deleteEmployee = async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.id);

        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        await Employee.deleteOne({ _id: req.params.id });
        await User.deleteOne({ employeeId: req.params.id });
        // Should also handle related loans/transactions ideally

        res.json({ message: 'Employee removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Adjust employee salary
// @route   POST /api/admin/employees/:id/adjust-salary
// @access  Private/Admin
const adjustSalary = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { newSalary, remarks } = req.body;
        const employee = await Employee.findById(req.params.id).session(session);

        if (!employee) {
            throw new Error('Employee not found');
        }

        const oldSalary = employee.salary;
        employee.salary = newSalary;
        await employee.save({ session });

        // Create adjustment history
        await AdjustmentHistory.create([{
            employee: employee._id,
            admin: req.user._id,
            actionType: 'update_salary',
            targetField: 'salary',
            oldValue: oldSalary,
            newValue: newSalary,
            remarks: remarks || `Salary adjusted from ₹${oldSalary} to ₹${newSalary}`
        }], { session });

        await session.commitTransaction();
        session.endSession();

        res.json({ message: 'Salary updated successfully', employee });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: error.message });
    }
};

// @desc    Adjust employee thrift
// @route   POST /api/admin/employees/:id/adjust-thrift
// @access  Private/Admin
const adjustThrift = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { newThriftContribution, newThriftBalance, remarks } = req.body;
        const employee = await Employee.findById(req.params.id).session(session);

        if (!employee) {
            throw new Error('Employee not found');
        }

        const oldContribution = employee.thriftContribution;
        const oldBalance = employee.thriftBalance;

        if (newThriftContribution !== undefined) {
            employee.thriftContribution = newThriftContribution;
            
            await AdjustmentHistory.create([{
                employee: employee._id,
                admin: req.user._id,
                actionType: 'update_thrift',
                targetField: 'thriftContribution',
                oldValue: oldContribution,
                newValue: newThriftContribution,
                remarks: remarks || `Thrift contribution adjusted from ₹${oldContribution} to ₹${newThriftContribution}`
            }], { session });
        }

        if (newThriftBalance !== undefined) {
            employee.thriftBalance = newThriftBalance;
            
            await AdjustmentHistory.create([{
                employee: employee._id,
                admin: req.user._id,
                actionType: 'adjust_balance',
                targetField: 'thriftBalance',
                oldValue: oldBalance,
                newValue: newThriftBalance,
                remarks: remarks || `Thrift balance adjusted from ₹${oldBalance} to ₹${newThriftBalance}`
            }], { session });
        }

        await employee.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.json({ message: 'Thrift updated successfully', employee });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: error.message });
    }
};

// @desc    Adjust employee loan
// @route   POST /api/admin/employees/:id/adjust-loan
// @access  Private/Admin
const adjustLoan = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { loanAmount, emi, interestRate, remarks } = req.body;
        const employee = await Employee.findById(req.params.id).session(session);

        if (!employee) {
            throw new Error('Employee not found');
        }

        if (!employee.activeLoan) {
            throw new Error('Employee has no active loan');
        }

        const loan = await Loan.findById(employee.activeLoan).session(session);
        if (!loan) {
            throw new Error('Loan not found');
        }

        const changes = [];

        if (loanAmount !== undefined) {
            const oldAmount = loan.loanAmount;
            const oldBalance = loan.remainingBalance;
            const topUpAmount = loanAmount - oldAmount;
            
            loan.loanAmount = loanAmount;
            loan.remainingBalance = oldBalance + topUpAmount;
            
            changes.push({
                employee: employee._id,
                admin: req.user._id,
                actionType: 'create_loan',
                targetField: 'loanAmount',
                oldValue: oldAmount,
                newValue: loanAmount,
                remarks: remarks || `Loan top-up: ₹${topUpAmount}. New total: ₹${loanAmount}`
            });
        }

        if (emi !== undefined) {
            const oldEMI = loan.emi;
            loan.emi = emi;
            
            changes.push({
                employee: employee._id,
                admin: req.user._id,
                actionType: 'other',
                targetField: 'emi',
                oldValue: oldEMI,
                newValue: emi,
                remarks: remarks || `EMI updated from ₹${oldEMI} to ₹${emi}`
            });
        }

        if (interestRate !== undefined) {
            const oldRate = loan.interestRate;
            loan.interestRate = interestRate;
            
            changes.push({
                employee: employee._id,
                admin: req.user._id,
                actionType: 'other',
                targetField: 'interestRate',
                oldValue: oldRate,
                newValue: interestRate,
                remarks: remarks || `Interest rate updated from ${oldRate}% to ${interestRate}%`
            });
        }

        await loan.save({ session });
        
        if (changes.length > 0) {
            await AdjustmentHistory.create(changes, { session });
        }

        await session.commitTransaction();
        session.endSession();

        res.json({ message: 'Loan adjusted successfully', loan });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get employee adjustment history
// @route   GET /api/admin/employees/:id/history
// @access  Private/Admin
const getAdjustmentHistory = async (req, res) => {
    try {
        const history = await AdjustmentHistory.find({ employee: req.params.id })
            .populate('admin', 'username')
            .sort({ createdAt: -1 });

        res.json(history);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get employee monthly transactions
// @route   GET /api/admin/employees/:id/transactions
// @access  Private/Admin
const getEmployeeTransactions = async (req, res) => {
    try {
        const transactions = await Transaction.find({ employee: req.params.id })
            .sort({ month: -1 })
            .limit(12); // Last 12 months

        res.json(transactions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Generate Monthly Report (Excel) - All employees (Vignan Society Format)
// @route   GET /api/admin/reports/monthly/:month
// @access  Private/Admin
const generateMonthlyReport = async (req, res) => {
    try {
        const { month } = req.params; // Format: YYYY-MM

        // Parse month for display
        const [yearStr, monthNum] = month.split('-');
        const monthNames = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
        const displayMonth = `${monthNames[parseInt(monthNum) - 1]} - ${yearStr}`;

        // Fetch all employees with active loans populated (including sureties)
        const employees = await Employee.find().sort({ empId: 1, name: 1 });

        // If no employees, return an empty report
        if (employees.length === 0) {
            const workbook = xlsx.utils.book_new();
            const ws = xlsx.utils.aoa_to_sheet([['No employees found']]);
            xlsx.utils.book_append_sheet(workbook, ws, 'Empty');
            const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=Monthly_Report_${month}.xlsx`);
            return res.send(buffer);
        }

        // Fetch all transactions for the specified month
        const transactions = await Transaction.find({ month })
            .populate('employee');

        // Build a map of employee._id -> transaction
        const txnMap = {};
        for (const txn of transactions) {
            if (txn.employee) txnMap[txn.employee._id.toString()] = txn;
        }

        // Fetch all active loans with sureties
        const activeLoans = await Loan.find({ status: 'active' }).populate('sureties', 'empId name');

        // Build map of borrower employee._id -> loan
        const loanMap = {};
        for (const loan of activeLoans) {
            loanMap[loan.borrower.toString()] = loan;
        }

        // Build map of employee._id -> how many loans they are surety for
        const suretyCountMap = {};
        for (const loan of activeLoans) {
            for (const surety of (loan.sureties || [])) {
                const sid = surety._id.toString();
                suretyCountMap[sid] = (suretyCountMap[sid] || 0) + 1;
            }
        }

        // Build report data in the Vignan Society format
        const reportData = [];
        const today = new Date();
        const dateStr = `${today.getDate().toString().padStart(2, '0')} ${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}`;

        for (let i = 0; i < employees.length; i++) {
            const emp = employees[i];
            const empId = emp._id.toString();
            const txn = txnMap[empId];
            const loan = loanMap[empId];

            const thriftDeduction = txn ? (txn.thriftDeduction || 0) : (emp.thriftContribution || 0);
            const loanRepayment = txn ? (txn.loanEMI || 0) : 0;
            const interest = txn ? (txn.interestPayment || 0) : 0;
            const loanOutstanding = loan ? (loan.remainingBalance || 0) : 0;
            const loanAmount = loan ? (loan.loanAmount || 0) : 0;
            const totalAmount = thriftDeduction + loanRepayment + interest;
            const totalMonthlyDeduction = totalAmount;
            const suretyCount = suretyCountMap[empId] || 0;

            // Get sureties for this employee's loan   
            const suretyIds = [];
            if (loan && loan.sureties) {
                for (const s of loan.sureties) {
                    suretyIds.push(s.empId || '');
                }
            }

            const row = {
                'S.No': i + 1,
                'Emp. ID': emp.empId || '',
                'Name of the Employ': emp.name,
                'CB Thrift Amount': emp.thriftBalance || 0,
                'Loan': loanOutstanding,
                'Loan Re payment': loanRepayment,
                'Interest': interest,
                'Monthly Thrift Amount': thriftDeduction,
                'Total Amount': totalAmount,
                'Paid Amount': txn ? (txn.netSalary || 0) : 0,
                'Surity': suretyCount,
                'DATE': '',
                'Loan Amount': loanAmount,
                'Thrift': thriftDeduction,
                'Total monthly deduction': totalMonthlyDeduction,
                'surity1': suretyIds[0] || '',
                'surity2': suretyIds[1] || '',
                'surity3': suretyIds[2] || '',
                'surity4': suretyIds[3] || '',
                'surity5': suretyIds[4] || '',
                'surity6': suretyIds[5] || ''
            };
            reportData.push(row);
        }

        // Add totals row
        const totals = {
            'S.No': '',
            'Emp. ID': '',
            'Name of the Employ': 'TOTAL',
            'CB Thrift Amount': reportData.reduce((s, r) => s + (r['CB Thrift Amount'] || 0), 0),
            'Loan': reportData.reduce((s, r) => s + (r['Loan'] || 0), 0),
            'Loan Re payment': reportData.reduce((s, r) => s + (r['Loan Re payment'] || 0), 0),
            'Interest': reportData.reduce((s, r) => s + (r['Interest'] || 0), 0),
            'Monthly Thrift Amount': reportData.reduce((s, r) => s + (r['Monthly Thrift Amount'] || 0), 0),
            'Total Amount': reportData.reduce((s, r) => s + (r['Total Amount'] || 0), 0),
            'Paid Amount': reportData.reduce((s, r) => s + (r['Paid Amount'] || 0), 0),
            'Surity': '',
            'DATE': '',
            'Loan Amount': reportData.reduce((s, r) => s + (r['Loan Amount'] || 0), 0),
            'Thrift': reportData.reduce((s, r) => s + (r['Thrift'] || 0), 0),
            'Total monthly deduction': reportData.reduce((s, r) => s + (r['Total monthly deduction'] || 0), 0),
            'surity1': '', 'surity2': '', 'surity3': '', 'surity4': '', 'surity5': '', 'surity6': ''
        };
        reportData.push(totals);

        const workbook = xlsx.utils.book_new();

        // Create sheet with header rows for Vignan University format
        const ws = xlsx.utils.aoa_to_sheet([
            ['VIGNAN UNIVERSITY :: VADLAMUDI'],
            ['The Vignan Employees Mutually Aided Co-operative Thrift & Credit Society Ltd.'],
            [displayMonth],
            [] // Empty row before data
        ]);

        // Merge header cells across all columns
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 20 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 20 } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: 20 } }
        ];

        // Append the data starting from row 5 (after headers)
        xlsx.utils.sheet_add_json(ws, reportData, { origin: 'A5' });

        ws['!cols'] = [
            { wch: 5 },   // S.No
            { wch: 8 },   // Emp. ID
            { wch: 28 },  // Name
            { wch: 18 },  // CB Thrift Amount
            { wch: 14 },  // Loan
            { wch: 14 },  // Loan Re payment
            { wch: 12 },  // Interest
            { wch: 18 },  // Monthly Thrift Amount
            { wch: 14 },  // Total Amount
            { wch: 14 },  // Paid Amount
            { wch: 8 },   // Surity count
            { wch: 12 },  // DATE
            { wch: 14 },  // Loan Amount
            { wch: 12 },  // Thrift
            { wch: 20 },  // Total monthly deduction
            { wch: 10 },  // surity1
            { wch: 10 },  // surity2
            { wch: 10 },  // surity3
            { wch: 10 },  // surity4
            { wch: 10 },  // surity5
            { wch: 10 }   // surity6
        ];

        xlsx.utils.book_append_sheet(workbook, ws, `Monthly Report ${month}`);

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Monthly_Report_${month}.xlsx`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Generate Yearly Report (Excel) - All employees (Vignan Society Format)
// @route   GET /api/admin/reports/yearly/:year
// @access  Private/Admin
const generateYearlyReport = async (req, res) => {
    try {
        const { year } = req.params;

        const employees = await Employee.find().sort({ empId: 1, name: 1 });

        // If no employees, return an empty report
        if (employees.length === 0) {
            const workbook = xlsx.utils.book_new();
            const ws = xlsx.utils.aoa_to_sheet([['No employees found']]);
            xlsx.utils.book_append_sheet(workbook, ws, 'Empty');
            const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=Yearly_Report_${year}.xlsx`);
            return res.send(buffer);
        }

        const activeLoans = await Loan.find({ status: 'active' }).populate('sureties', 'empId name');
        const loanMap = {};
        for (const loan of activeLoans) {
            loanMap[loan.borrower.toString()] = loan;
        }

        const suretyCountMap = {};
        for (const loan of activeLoans) {
            for (const surety of (loan.sureties || [])) {
                suretyCountMap[surety._id.toString()] = (suretyCountMap[surety._id.toString()] || 0) + 1;
            }
        }

        const workbook = xlsx.utils.book_new();

        // Sheet 1: Yearly Summary in Vignan format
        const ws = xlsx.utils.aoa_to_sheet([
            ['VIGNAN UNIVERSITY :: VADLAMUDI'],
            ['The Vignan Employees Mutually Aided Co-operative Thrift & Credit Society Ltd.'],
            [`YEARLY REPORT - ${year}`],
            []
        ]);
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 15 } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: 15 } }
        ];

        const reportData = [];
        for (const emp of employees) {
            const empIdStr = emp._id.toString();
            const transactions = await Transaction.find({
                employee: emp._id,
                month: { $regex: `^${year}` }
            }).sort({ month: 1 });

            const yearlyTotals = transactions.reduce((acc, txn) => ({
                thrift: acc.thrift + (txn.thriftDeduction || 0),
                loanEMI: acc.loanEMI + (txn.loanEMI || 0),
                interest: acc.interest + (txn.interestPayment || 0)
            }), { thrift: 0, loanEMI: 0, interest: 0 });

            const loan = loanMap[empIdStr];
            const suretyCount = suretyCountMap[empIdStr] || 0;
            const suretyIds = [];
            if (loan && loan.sureties) {
                for (const s of loan.sureties) suretyIds.push(s.empId || '');
            }

            reportData.push({
                'S.No': reportData.length + 1,
                'Emp. ID': emp.empId || '',
                'Name of the Employ': emp.name,
                'CB Thrift Amount': emp.thriftBalance || 0,
                'Loan': loan ? (loan.remainingBalance || 0) : 0,
                'Total Loan Re payment': yearlyTotals.loanEMI,
                'Total Interest': yearlyTotals.interest,
                'Yearly Thrift Deducted': yearlyTotals.thrift,
                'Monthly Thrift': emp.thriftContribution || 0,
                'Loan Amount': loan ? (loan.loanAmount || 0) : 0,
                'Surity': suretyCount,
                'surity1': suretyIds[0] || '',
                'surity2': suretyIds[1] || '',
                'surity3': suretyIds[2] || '',
                'surity4': suretyIds[3] || '',
                'surity5': suretyIds[4] || '',
                'surity6': suretyIds[5] || ''
            });
        }

        const grandTotals = {
            'S.No': '',
            'Emp. ID': '',
            'Name of the Employ': 'GRAND TOTAL',
            'CB Thrift Amount': reportData.reduce((s, r) => s + (r['CB Thrift Amount'] || 0), 0),
            'Loan': reportData.reduce((s, r) => s + (r['Loan'] || 0), 0),
            'Total Loan Re payment': reportData.reduce((s, r) => s + (r['Total Loan Re payment'] || 0), 0),
            'Total Interest': reportData.reduce((s, r) => s + (r['Total Interest'] || 0), 0),
            'Yearly Thrift Deducted': reportData.reduce((s, r) => s + (r['Yearly Thrift Deducted'] || 0), 0),
            'Monthly Thrift': reportData.reduce((s, r) => s + (r['Monthly Thrift'] || 0), 0),
            'Loan Amount': reportData.reduce((s, r) => s + (r['Loan Amount'] || 0), 0),
            'Surity': '',
            'surity1': '', 'surity2': '', 'surity3': '', 'surity4': '', 'surity5': '', 'surity6': ''
        };
        reportData.push(grandTotals);

        xlsx.utils.sheet_add_json(ws, reportData, { origin: 'A5' });

        ws['!cols'] = [
            { wch: 5 }, { wch: 8 }, { wch: 28 }, { wch: 18 }, { wch: 14 },
            { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
            { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }
        ];

        xlsx.utils.book_append_sheet(workbook, ws, `Yearly Report ${year}`);

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Yearly_Report_${year}.xlsx`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Generate Balance Sheet Report (Excel) - Month-wise summary
// @route   GET /api/admin/reports/balance-sheet
// @access  Private/Admin
const generateBalanceSheetReport = async (req, res) => {
    try {
        const from = String(req.query.from || '').trim(); // YYYY-MM
        const to = String(req.query.to || '').trim();     // YYYY-MM

        const monthPattern = /^\d{4}-\d{2}$/;
        if (from && !monthPattern.test(from)) {
            return res.status(400).json({ message: 'Invalid from month. Use YYYY-MM format.' });
        }
        if (to && !monthPattern.test(to)) {
            return res.status(400).json({ message: 'Invalid to month. Use YYYY-MM format.' });
        }
        if (from && to && from > to) {
            return res.status(400).json({ message: 'from month cannot be greater than to month.' });
        }

        const monthQuery = {};
        if (from || to) {
            monthQuery.month = {};
            if (from) monthQuery.month.$gte = from;
            if (to) monthQuery.month.$lte = to;
        }

        const savedRows = await BalanceSheetMonth.find(monthQuery).sort({ month: 1 }).lean();

        const transactions = await Transaction.find(monthQuery)
            .select('month thriftDeduction principalRepayment loanEMI interestPayment')
            .lean();

        const enumerateMonths = (fromMonth, toMonth) => {
            if (!fromMonth || !toMonth) return [];
            const [fromYear, fromMon] = fromMonth.split('-').map(Number);
            const [toYear, toMon] = toMonth.split('-').map(Number);
            const months = [];
            let y = fromYear;
            let m = fromMon;
            while (y < toYear || (y === toYear && m <= toMon)) {
                months.push(`${y}-${String(m).padStart(2, '0')}`);
                m += 1;
                if (m > 12) {
                    m = 1;
                    y += 1;
                }
            }
            return months;
        };

        const monthMap = new Map();
        for (const row of savedRows) {
            monthMap.set(row.month, {
                thrift: 0,
                loanRepayment: 0,
                intrest: 0,
                enttryFee: Number(row.enttryFee) || 0,
                shareCapital: Number(row.shareCapital) || 0,
                fdClosed: Number(row.fdClosed) || 0,
                bankIntrest: Number(row.bankIntrest) || 0,
                cashInHand: Number(row.cashInHand) || 0,
                loanApplicationFee: Number(row.loanApplicationFee) || 0,
                loansIssue: Number(row.loansIssue) || 0,
                thriftRefundToMembers: Number(row.thriftRefundToMembers) || 0,
                scRefund: Number(row.scRefund) || 0,
                fixedDepositInBank: Number(row.fixedDepositInBank) || 0,
                salaryForAccountent: Number(row.salaryForAccountent) || 0,
                expenditure: Number(row.expenditure) || 0,
                expenditureRemarks: row.expenditureRemarks || ''
            });
        }
        for (const tx of transactions) {
            const monthKey = tx.month;
            if (!monthMap.has(monthKey)) {
                monthMap.set(monthKey, {
                    thrift: 0,
                    loanRepayment: 0,
                    intrest: 0,
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
                });
            }

            const agg = monthMap.get(monthKey);
            const thrift = Number(tx.thriftDeduction) || 0;
            const interest = Number(tx.interestPayment) || 0;
            const loanEmi = Number(tx.loanEMI) || 0;
            const principal = (Number(tx.principalRepayment) || 0) > 0
                ? Number(tx.principalRepayment)
                : Math.max(0, loanEmi - interest);

            agg.thrift += thrift;
            agg.intrest += interest;
            agg.loanRepayment += principal;
        }

        let months = Array.from(monthMap.keys()).sort();
        if (months.length === 0) {
            if (from && to) {
                months = enumerateMonths(from, to);
            } else if (from) {
                months = [from];
            } else if (to) {
                months = [to];
            }

            for (const monthKey of months) {
                if (!monthMap.has(monthKey)) {
                    monthMap.set(monthKey, {
                        thrift: 0,
                        loanRepayment: 0,
                        intrest: 0,
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
                    });
                }
            }
        }

        months = Array.from(monthMap.keys()).sort();
        const reportRows = months.map((monthKey) => {
            const [year, month] = monthKey.split('-');
            const data = monthMap.get(monthKey);
            return {
                month: `05-${month}-${year}`,
                thrift: Math.round((data.thrift || 0) * 100) / 100,
                'loan repayment': Math.round((data.loanRepayment || 0) * 100) / 100,
                intrest: Math.round((data.intrest || 0) * 100) / 100,
                'enttry fee': data.enttryFee,
                'share capital': data.shareCapital,
                'fd closed': data.fdClosed,
                'bank intrest': data.bankIntrest,
                'cash in hand': data.cashInHand,
                'loan application fee': data.loanApplicationFee,
                'loans issue': Math.round((data.loansIssue || 0) * 100) / 100,
                'thrift refund to members': data.thriftRefundToMembers,
                'SC Refund': data.scRefund,
                'fixed deposit in bank': data.fixedDepositInBank,
                'Salary for accountent': data.salaryForAccountent,
                expenditure: data.expenditure,
                'expenditure remarks': data.expenditureRemarks || ''
            };
        });

        const totals = reportRows.reduce((acc, row) => {
            const keys = Object.keys(row).filter((k) => k !== 'month');
            for (const key of keys) acc[key] = (acc[key] || 0) + (Number(row[key]) || 0);
            return acc;
        }, {});

        reportRows.push({
            month: 'TOTAL',
            thrift: totals.thrift || 0,
            'loan repayment': totals['loan repayment'] || 0,
            intrest: totals.intrest || 0,
            'enttry fee': totals['enttry fee'] || 0,
            'share capital': totals['share capital'] || 0,
            'fd closed': totals['fd closed'] || 0,
            'bank intrest': totals['bank intrest'] || 0,
            'cash in hand': totals['cash in hand'] || 0,
            'loan application fee': totals['loan application fee'] || 0,
            'loans issue': totals['loans issue'] || 0,
            'thrift refund to members': totals['thrift refund to members'] || 0,
            'SC Refund': totals['SC Refund'] || 0,
            'fixed deposit in bank': totals['fixed deposit in bank'] || 0,
            'Salary for accountent': totals['Salary for accountent'] || 0,
            expenditure: totals.expenditure || 0,
            'expenditure remarks': ''
        });

        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(
            reportRows.length > 1
                ? reportRows
                : [{
                    month: 'NO DATA',
                    thrift: 0,
                    'loan repayment': 0,
                    intrest: 0,
                    'enttry fee': 0,
                    'share capital': 0,
                    'fd closed': 0,
                    'bank intrest': 0,
                    'cash in hand': 0,
                    'loan application fee': 0,
                    'loans issue': 0,
                    'thrift refund to members': 0,
                    'SC Refund': 0,
                    'fixed deposit in bank': 0,
                    'Salary for accountent': 0,
                    expenditure: 0,
                    'expenditure remarks': ''
                }]
        );
        worksheet['!cols'] = [
            { wch: 12 },
            { wch: 12 },
            { wch: 15 },
            { wch: 12 },
            { wch: 12 },
            { wch: 12 },
            { wch: 10 },
            { wch: 12 },
            { wch: 12 },
            { wch: 19 },
            { wch: 12 },
            { wch: 24 },
            { wch: 10 },
            { wch: 20 },
            { wch: 20 },
            { wch: 12 },
            { wch: 22 }
        ];

        xlsx.utils.book_append_sheet(workbook, worksheet, 'Balance Sheet');
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        const suffix = from || to ? `${from || 'start'}_to_${to || 'latest'}` : 'all_months';
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Balance_Sheet_${suffix}.xlsx`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Generate Employee KYC Details Report (Excel)
// @route   GET /api/admin/reports/kyc-details
// @access  Private/Admin
const downloadKycDetailsReport = async (req, res) => {
    try {
        const employees = await Employee.find({})
            .select('empId name panNumber aadhaarNumber')
            .sort({ name: 1 })
            .lean();

        const reportRows = employees.map((emp, index) => ({
            'S.No': index + 1,
            'Employee ID': emp.empId ?? '',
            'Employee Name': emp.name || '',
            'PAN Number': emp.panNumber || '',
            'Aadhaar Number': emp.aadhaarNumber || ''
        }));

        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(
            reportRows.length > 0
                ? reportRows
                : [{
                    'S.No': '',
                    'Employee ID': '',
                    'Employee Name': 'No employee records found',
                    'PAN Number': '',
                    'Aadhaar Number': ''
                }]
        );

        worksheet['!cols'] = [
            { wch: 8 },
            { wch: 15 },
            { wch: 32 },
            { wch: 18 },
            { wch: 20 }
        ];

        xlsx.utils.book_append_sheet(workbook, worksheet, 'KYC Details');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const dateStamp = new Date().toISOString().slice(0, 10);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Employee_KYC_Details_${dateStamp}.xlsx`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update manual balance-sheet heads for a month
// @route   PUT /api/admin/reports/balance-sheet/:month
// @access  Private/Admin
const upsertBalanceSheetMonth = async (req, res) => {
    try {
        const month = String(req.params.month || '').trim();
        if (!/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
        }

        const toNum = (v) => (v === undefined || v === null || v === '' ? 0 : Number(v) || 0);

        const update = {
            enttryFee: toNum(req.body.enttryFee),
            shareCapital: toNum(req.body.shareCapital),
            fdClosed: toNum(req.body.fdClosed),
            bankIntrest: toNum(req.body.bankIntrest),
            cashInHand: toNum(req.body.cashInHand),
            loanApplicationFee: toNum(req.body.loanApplicationFee),
            loansIssue: toNum(req.body.loansIssue),
            thriftRefundToMembers: toNum(req.body.thriftRefundToMembers),
            scRefund: toNum(req.body.scRefund),
            fixedDepositInBank: toNum(req.body.fixedDepositInBank),
            salaryForAccountent: toNum(req.body.salaryForAccountent),
            expenditure: toNum(req.body.expenditure),
            expenditureRemarks: String(req.body.expenditureRemarks || '').trim(),
            updatedBy: req.user._id
        };

        const row = await BalanceSheetMonth.findOneAndUpdate(
            { month },
            {
                $set: update,
                $setOnInsert: {
                    month,
                    thrift: 0,
                    loanRepayment: 0,
                    intrest: 0
                }
            },
            { upsert: true, new: true }
        );

        res.json({ message: `Balance sheet heads updated for ${month}`, row });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Generate Individual Employee Monthly Report (Excel)
// @route   GET /api/admin/employees/:id/report/monthly/:month
// @access  Private/Admin
const generateEmployeeMonthlyReport = async (req, res) => {
    try {
        const { id, month } = req.params;

        const employee = await Employee.findById(id).populate('activeLoan');
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        const transaction = await Transaction.findOne({ employee: id, month });

        const workbook = xlsx.utils.book_new();

        // Parse month for display
        const [yearStr, monthNum] = month.split('-');
        const monthNames = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
        const displayMonth = `${monthNames[parseInt(monthNum) - 1]} - ${yearStr}`;

        // Fetch loan and sureties info
        const loan = employee.activeLoan;
        const loanDoc = loan ? await Loan.findById(loan._id || loan).populate('sureties', 'empId name') : null;

        // Sheet 1: Vignan format statement
        const ws = xlsx.utils.aoa_to_sheet([
            ['VIGNAN UNIVERSITY :: VADLAMUDI'],
            ['The Vignan Employees Mutually Aided Co-operative Thrift & Credit Society Ltd.'],
            [`Individual Monthly Statement - ${displayMonth}`],
            []
        ]);
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 14 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 14 } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: 14 } }
        ];

        const thriftDeduction = transaction ? (transaction.thriftDeduction || 0) : 0;
        const loanRepayment = transaction ? (transaction.loanEMI || 0) : 0;
        const interest = transaction ? (transaction.interestPayment || 0) : 0;
        const totalAmount = thriftDeduction + loanRepayment + interest;

        const suretyIds = [];
        if (loanDoc && loanDoc.sureties) {
            for (const s of loanDoc.sureties) suretyIds.push(s.empId || '');
        }

        const reportRow = [{
            'Emp. ID': employee.empId || '',
            'Name of the Employ': employee.name,
            'CB Thrift Amount': employee.thriftBalance || 0,
            'Loan': loanDoc ? (loanDoc.remainingBalance || 0) : 0,
            'Loan Re payment': loanRepayment,
            'Interest': interest,
            'Monthly Thrift Amount': thriftDeduction,
            'Total Amount': totalAmount,
            'Paid Amount': transaction ? (transaction.netSalary || 0) : 0,
            'Loan Amount': loanDoc ? (loanDoc.loanAmount || 0) : 0,
            'Thrift': thriftDeduction,
            'Total monthly deduction': totalAmount,
            'surity1': suretyIds[0] || '',
            'surity2': suretyIds[1] || '',
            'surity3': suretyIds[2] || ''
        }];

        xlsx.utils.sheet_add_json(ws, reportRow, { origin: 'A5' });
        ws['!cols'] = [
            { wch: 8 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
            { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
            { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }
        ];
        xlsx.utils.book_append_sheet(workbook, ws, `Statement ${month}`);

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const safeName = employee.name.replace(/[^a-zA-Z0-9]/g, '_');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${safeName}_Monthly_${month}.xlsx`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Generate Individual Employee Yearly Report (Excel)
// @route   GET /api/admin/employees/:id/report/yearly/:year
// @access  Private/Admin
const generateEmployeeYearlyReport = async (req, res) => {
    try {
        const { id, year } = req.params;

        const employee = await Employee.findById(id).populate('activeLoan');
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        const transactions = await Transaction.find({
            employee: id,
            month: { $regex: `^${year}` }
        }).sort({ month: 1 });

        const workbook = xlsx.utils.book_new();

        // Fetch loan info
        const loanDoc = employee.activeLoan
            ? await Loan.findById(employee.activeLoan._id || employee.activeLoan).populate('sureties', 'empId name')
            : null;

        // Sheet 1: Vignan format yearly summary
        const ws = xlsx.utils.aoa_to_sheet([
            ['VIGNAN UNIVERSITY :: VADLAMUDI'],
            ['The Vignan Employees Mutually Aided Co-operative Thrift & Credit Society Ltd.'],
            [`Individual Yearly Report - ${year}`],
            []
        ]);
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: 12 } }
        ];

        const yearlyTotals = transactions.reduce((acc, txn) => ({
            thrift: acc.thrift + (txn.thriftDeduction || 0),
            loanEMI: acc.loanEMI + (txn.loanEMI || 0),
            interest: acc.interest + (txn.interestPayment || 0)
        }), { thrift: 0, loanEMI: 0, interest: 0 });

        const suretyIds = [];
        if (loanDoc && loanDoc.sureties) {
            for (const s of loanDoc.sureties) suretyIds.push(s.empId || '');
        }

        const summaryRow = [{
            'Emp. ID': employee.empId || '',
            'Name of the Employ': employee.name,
            'CB Thrift Amount': employee.thriftBalance || 0,
            'Loan Outstanding': loanDoc ? (loanDoc.remainingBalance || 0) : 0,
            'Total Loan Re payment': yearlyTotals.loanEMI,
            'Total Interest': yearlyTotals.interest,
            'Yearly Thrift Deducted': yearlyTotals.thrift,
            'Monthly Thrift': employee.thriftContribution || 0,
            'Loan Amount': loanDoc ? (loanDoc.loanAmount || 0) : 0,
            'surity1': suretyIds[0] || '',
            'surity2': suretyIds[1] || '',
            'surity3': suretyIds[2] || '',
            'surity4': suretyIds[3] || ''
        }];

        xlsx.utils.sheet_add_json(ws, summaryRow, { origin: 'A5' });
        ws['!cols'] = [
            { wch: 8 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
            { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
            { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }
        ];
        xlsx.utils.book_append_sheet(workbook, ws, `Summary ${year}`);

        // Sheet 2: Month-by-month breakdown
        if (transactions.length > 0) {
            const monthlyData = transactions.map(txn => ({
                'Month': txn.month,
                'Salary': txn.salary || 0,
                'Thrift': txn.thriftDeduction || 0,
                'EMI': txn.loanEMI || 0,
                'Interest': txn.interestPayment || 0,
                'Principal': txn.principalRepayment || 0,
                'Net Salary': txn.netSalary || 0
            }));

            // Add yearly totals row
            const yearlyTotals = {
                'Month': 'YEARLY TOTAL',
                'Salary': monthlyData.reduce((s, r) => s + r['Salary'], 0),
                'Thrift': monthlyData.reduce((s, r) => s + r['Thrift'], 0),
                'EMI': monthlyData.reduce((s, r) => s + r['EMI'], 0),
                'Interest': monthlyData.reduce((s, r) => s + r['Interest'], 0),
                'Principal': monthlyData.reduce((s, r) => s + r['Principal'], 0),
                'Net Salary': monthlyData.reduce((s, r) => s + r['Net Salary'], 0)
            };
            monthlyData.push(yearlyTotals);

            const monthlySheet = xlsx.utils.json_to_sheet(monthlyData);
            monthlySheet['!cols'] = [
                { wch: 15 }, { wch: 12 }, { wch: 12 },
                { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
            ];
            xlsx.utils.book_append_sheet(workbook, monthlySheet, `Transactions ${year}`);
        } else {
            const emptySheet = xlsx.utils.json_to_sheet([{ 'Message': `No transactions found for ${year}` }]);
            xlsx.utils.book_append_sheet(workbook, emptySheet, `Transactions ${year}`);
        }

        // Sheet 3: Yearly Thrift Summary
        const yearlyThrift = transactions.reduce((sum, txn) => sum + (txn.thriftDeduction || 0), 0);
        const yearlyInterest = transactions.reduce((sum, txn) => sum + (txn.interestPayment || 0), 0);
        const yearlyEMI = transactions.reduce((sum, txn) => sum + (txn.loanEMI || 0), 0);
        const thriftSummary = [
            { 'Detail': 'Emp. ID', 'Amount': employee.empId || 'N/A' },
            { 'Detail': 'Monthly Thrift Contribution', 'Amount': employee.thriftContribution },
            { 'Detail': `Total Thrift Deducted in ${year}`, 'Amount': yearlyThrift },
            { 'Detail': 'Accumulated Thrift Balance (CB)', 'Amount': employee.thriftBalance },
            { 'Detail': `Total Loan EMI Paid in ${year}`, 'Amount': yearlyEMI },
            { 'Detail': `Total Interest Paid in ${year}`, 'Amount': yearlyInterest },
            { 'Detail': 'Months with Thrift Deduction', 'Amount': transactions.filter(t => t.thriftDeduction > 0).length }
        ];
        const thriftSheet = xlsx.utils.json_to_sheet(thriftSummary);
        thriftSheet['!cols'] = [{ wch: 30 }, { wch: 15 }];
        xlsx.utils.book_append_sheet(workbook, thriftSheet, `Yearly Thrift ${year}`);

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const safeName = employee.name.replace(/[^a-zA-Z0-9]/g, '_');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${safeName}_Yearly_${year}.xlsx`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Sync loan documents for employees who have loanStatus='Loan' but no activeLoan
// @route   POST /api/admin/sync-loans
// @access  Private/Admin
const syncLoans = async (req, res) => {
    try {
        const { employeeId } = req.body; // Optional: sync a single employee

        // Find employees that need syncing
        const query = { activeLoan: null };
        if (employeeId) query._id = employeeId;
        else query.loanStatus = 'Loan'; // Bulk: only those flagged

        const employees = await Employee.find(query);
        const results = { linked: 0, created: 0, skipped: 0, errors: [] };

        for (const emp of employees) {
            try {
                // 1. Check for an orphaned active Loan doc
                let loan = await Loan.findOne({ borrower: emp._id, status: 'active' });

                if (loan) {
                    // Relink
                    emp.activeLoan = loan._id;
                    await emp.save();
                    results.linked++;
                    continue;
                }

                // 2. Check latest transaction for loan data
                const latestTx = await Transaction.findOne({ employee: emp._id, loanEMI: { $gt: 0 } })
                    .sort({ month: -1 });

                if (latestTx) {
                    // Estimate from transaction: remaining balance unknown so use loanEMI as emi
                    // We create a minimal Loan doc so the UI stops showing zeros
                    const estimatedBalance = latestTx.principalRepayment > 0
                        ? latestTx.principalRepayment * 12  // rough estimate
                        : latestTx.loanEMI * 12;

                    loan = await Loan.create({
                        borrower: emp._id,
                        loanAmount: estimatedBalance,
                        interestRate: latestTx.interestPayment > 0 && estimatedBalance > 0
                            ? Math.round((latestTx.interestPayment / estimatedBalance) * 1200 * 10) / 10
                            : 12,
                        emi: latestTx.loanEMI,
                        remainingBalance: estimatedBalance,
                        totalInterestPaid: 0,
                        status: 'active'
                    });
                    emp.activeLoan = loan._id;
                    await emp.save();
                    results.created++;
                } else {
                    results.skipped++;
                }
            } catch (err) {
                results.errors.push({ empId: emp.empId, name: emp.name, error: err.message });
            }
        }

        res.json({
            message: `Sync complete: ${results.linked} relinked, ${results.created} created, ${results.skipped} skipped (no transaction data)`,
            ...results
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update Yearly Thrift for all employees (Cooperative Society Dividend Formula)
// @route   POST /api/admin/yearly-thrift-update
// @access  Private/Admin
// Formula: Rate = ((Loans Outstanding + Bank Balance + Cash in Hand) - (Total Thrift + Share Capital)) / Total Thrift
// Each employee's dividend = Rate × Employee's Thrift Balance
// New Thrift Balance = Employee's Thrift Balance + Dividend
const updateYearlyThrift = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { year, shareCapital, bankBalance, cashInHand } = req.body;
        const targetYear = year || new Date().getFullYear().toString();

        // Validate required inputs
        if (shareCapital === undefined || bankBalance === undefined || cashInHand === undefined) {
            return res.status(400).json({
                message: 'Share Capital, Bank Balance, and Cash in Hand are required fields'
            });
        }

        const shareCapitalNum = Number(shareCapital) || 0;
        const bankBalanceNum = Number(bankBalance) || 0;
        const cashInHandNum = Number(cashInHand) || 0;

        const employees = await Employee.find().session(session);

        // Calculate total thrift of all members
        const totalThrift = employees.reduce((sum, emp) => sum + (emp.thriftBalance || 0), 0);

        if (totalThrift === 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Total thrift balance is 0. Cannot calculate rate.' });
        }

        // Calculate total loans outstanding
        const activeLoans = await Loan.find({ status: 'active' }).session(session);
        const totalLoansOutstanding = activeLoans.reduce((sum, loan) => sum + (loan.remainingBalance || 0), 0);

        // Society formula
        const societyAssets = totalLoansOutstanding + bankBalanceNum + cashInHandNum;
        const societyCapital = totalThrift + shareCapitalNum;
        const difference = societyAssets - societyCapital; // Surplus/Profit
        const ratePerRupee = difference / totalThrift;

        const results = [];
        const errors = [];

        for (const emp of employees) {
            try {
                const oldBalance = emp.thriftBalance || 0;

                // Calculate dividend for this employee
                const dividend = ratePerRupee * oldBalance;
                const newBalance = oldBalance + dividend;

                emp.thriftBalance = Math.round(newBalance * 100) / 100; // Round to 2 decimals
                await emp.save({ session });

                // Create audit record
                await AdjustmentHistory.create([{
                    employee: emp._id,
                    admin: req.user._id,
                    actionType: 'yearly_thrift_update',
                    targetField: 'thriftBalance',
                    oldValue: oldBalance,
                    newValue: emp.thriftBalance,
                    remarks: `Yearly thrift update for ${targetYear}. Rate per rupee: ₹${ratePerRupee.toFixed(6)}. Dividend: ₹${dividend.toFixed(2)}. Formula: ((Loans:${totalLoansOutstanding} + Bank:${bankBalanceNum} + Cash:${cashInHandNum}) - (Thrift:${totalThrift} + ShareCap:${shareCapitalNum})) / TotalThrift:${totalThrift}`
                }], { session });

                results.push({
                    name: emp.name,
                    empId: emp.empId || '',
                    email: emp.email,
                    oldBalance,
                    dividend: Math.round(dividend * 100) / 100,
                    newBalance: emp.thriftBalance,
                    changed: oldBalance !== emp.thriftBalance
                });
            } catch (err) {
                errors.push({ name: emp.name, email: emp.email, error: err.message });
            }
        }

        await session.commitTransaction();
        session.endSession();

        res.json({
            message: `Yearly thrift update completed for ${targetYear}`,
            totalProcessed: results.length,
            totalChanged: results.filter(r => r.changed).length,
            totalErrors: errors.length,
            formula: {
                totalThrift,
                totalLoansOutstanding,
                shareCapital: shareCapitalNum,
                bankBalance: bankBalanceNum,
                cashInHand: cashInHandNum,
                societyAssets,
                societyCapital,
                difference,
                ratePerRupee: Math.round(ratePerRupee * 1000000) / 1000000
            },
            results,
            errors
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: error.message });
    }
};

// @desc  Reset passwords for all employees and return fresh credentials
// @route POST /api/admin/employees/regenerate-credentials
// @access Private/Admin
const regenerateCredentials = async (req, res) => {
    try {
        const employees = await Employee.find({}).select('empId name email');
        const results = [];
        const skipped = [];

        if (!employees.length) {
            return res.status(404).json({ message: 'No employees found to reset credentials' });
        }

        const plans = [];

        for (const emp of employees) {
            const normalizedEmpId = emp.empId !== undefined && emp.empId !== null && String(emp.empId).trim() !== ''
                ? String(emp.empId).trim()
                : null;

            if (!normalizedEmpId) {
                skipped.push({ empId: 'N/A', name: emp.name || 'Unknown', reason: 'Missing Emp ID' });
                continue;
            }

            let user = await User.findOne({ role: 'employee', employeeId: emp._id });
            if (!user) {
                user = await User.findOne({ role: 'employee', username: normalizedEmpId });
            }

            if (!user) {
                user = new User({
                    username: normalizedEmpId,
                    password: Math.random().toString(36).slice(-8),
                    role: 'employee',
                    employeeId: emp._id,
                    isFirstLogin: true,
                    resetPasswordToken: null,
                    resetPasswordExpires: null
                });
                await user.save();
            }

            plans.push({
                employee: emp,
                user,
                finalUsername: normalizedEmpId
            });
        }

        // Pass 1: move every planned user to a unique temporary username to avoid collisions.
        for (const plan of plans) {
            plan.user.username = `tmp_${plan.user._id}_${Date.now()}`;
            await plan.user.save();
        }

        // Pass 2: assign final Emp ID username and reset password.
        for (const plan of plans) {
            const newPassword = Math.random().toString(36).slice(-8);
            plan.user.username = plan.finalUsername;
            plan.user.password = newPassword; // hashed by pre-save hook
            plan.user.resetPasswordToken = null;
            plan.user.resetPasswordExpires = null;
            plan.user.isFirstLogin = true;
            await plan.user.save();

            results.push({
                empId: plan.finalUsername,
                name: plan.employee.name || plan.finalUsername,
                username: plan.finalUsername,
                password: newPassword,
                email: plan.employee.email || ''
            });
        }

        res.json({
            message: `Credentials reset for ${results.length} employees`,
            credentials: results,
            skipped
        });
    } catch (error) {
        console.error('regenerateCredentials error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get list of all months (live + archived)
// @route   GET /api/admin/reports/monthly-history
// @access  Private/Admin
const getMonthlyUploadHistory = async (req, res) => {
    try {
        // Live months (still have Transaction rows)
        const liveHistory = await Transaction.aggregate([
            {
                $group: {
                    _id: '$month',
                    employeeCount: { $sum: 1 },
                    totalThrift: { $sum: '$thriftDeduction' },
                    totalEMI: { $sum: '$loanEMI' },
                    totalDeduction: { $sum: '$totalDeduction' }
                }
            },
            { $sort: { _id: -1 } }
        ]);

        // Archived months (raw transactions deleted, summary stored)
        const archives = await ArchivedMonth.find()
            .sort({ month: -1 })
            .select('month employeeCount totalThrift totalEMI totalDeduction archivedAt');

        // Upload log map (approximate by upload month)
        const logs = await MonthlyUploadLog.find({ fileType: 'monthly_update' })
            .sort({ createdAt: -1 })
            .select('fileName status successCount failureCount createdAt');
        const logByMonth = {};
        for (const log of logs) {
            const m = log.createdAt.toISOString().slice(0, 7);
            if (!logByMonth[m]) logByMonth[m] = log;
        }

        const liveRows = liveHistory.map(h => ({
            month: h._id,
            employeeCount: h.employeeCount,
            totalThrift: Math.round(h.totalThrift),
            totalEMI: Math.round(h.totalEMI),
            totalDeduction: Math.round(h.totalDeduction),
            uploadedOn: logByMonth[h._id]?.createdAt || null,
            fileName: logByMonth[h._id]?.fileName || null,
            dataStatus: 'live'   // detailed rows available
        }));

        const archivedRows = archives.map(a => ({
            month: a.month,
            employeeCount: a.employeeCount,
            totalThrift: Math.round(a.totalThrift),
            totalEMI: Math.round(a.totalEMI),
            totalDeduction: Math.round(a.totalDeduction),
            uploadedOn: a.archivedAt,
            fileName: null,
            dataStatus: 'archived'   // only summary available
        }));

        // Merge, deduplicate (archive wins for its months), sort newest first
        const liveMonths = new Set(liveRows.map(r => r.month));
        const combined = [
            ...liveRows,
            ...archivedRows.filter(r => !liveMonths.has(r.month))
        ].sort((a, b) => b.month.localeCompare(a.month));

        res.json(combined);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Download archived month as Excel
// @route   GET /api/admin/reports/archived/:month
// @access  Private/Admin
const downloadArchivedMonthReport = async (req, res) => {
    try {
        const { month } = req.params;
        const archive = await ArchivedMonth.findOne({ month });
        if (!archive) {
            return res.status(404).json({ message: `No archive found for month ${month}` });
        }

        const [yearStr, monthNum] = month.split('-');
        const monthNames = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
        const displayMonth = `${monthNames[parseInt(monthNum) - 1]} - ${yearStr}`;

        const workbook = xlsx.utils.book_new();

        // Summary sheet
        const summaryData = [
            ['VIGNAN UNIVERSITY :: VADLAMUDI'],
            ['The Vignan Employees Mutually Aided Co-operative Thrift & Credit Society Ltd.'],
            [displayMonth],
            [],
            ['Archived Month Summary'],
            ['Archived On', archive.archivedAt ? new Date(archive.archivedAt).toLocaleDateString('en-IN') : ''],
            ['Total Employees', archive.employeeCount],
            ['Total Thrift Collected', archive.totalThrift],
            ['Total Loan EMI Collected', archive.totalEMI],
            ['Total Interest Collected', archive.totalInterest],
            ['Total Deductions', archive.totalDeduction]
        ];
        const summarySheet = xlsx.utils.aoa_to_sheet(summaryData);
        xlsx.utils.book_append_sheet(workbook, summarySheet, 'Summary');

        // Detail sheet — full per-employee data
        if (archive.employees && archive.employees.length > 0) {
            const detailRows = archive.employees.map(e => ({
                'Emp. ID':              e.empId,
                'Name':                 e.name,
                'Department':           e.department,
                'Salary':               e.salary,
                'Thrift Deduction':     e.thriftDeduction,
                'CB Thrift Balance':    e.cbThriftBalance,
                'Loan Balance':         e.loanBalance,
                'Loan EMI':             e.loanEMI,
                'Interest':             e.interestPayment,
                'Principal':            e.principalRepayment,
                'Total EMI':            e.loanAmount,
                'Total Deduction':      e.totalDeduction,
                'Paid Amount':          e.paidAmount,
                'Net Salary':           e.netSalary
            }));
            const detailSheet = xlsx.utils.json_to_sheet(detailRows);
            detailSheet['!cols'] = Array(14).fill({ wch: 18 });
            xlsx.utils.book_append_sheet(workbook, detailSheet, `Data ${month}`);
        }

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Archived_${month}.xlsx`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Send monthly update SMS to all employees with a registered phone number
// @route   POST /api/admin/notify/monthly-sms
// @access  Private/Admin
const notifyMonthlySms = async (req, res) => {
    try {
        const missingEnv = [];
        if (!process.env.KITE_USERNAME) missingEnv.push('KITE_USERNAME');
        if (!process.env.KITE_API_KEY) missingEnv.push('KITE_API_KEY');
        if (!process.env.KITE_SENDER_ID) missingEnv.push('KITE_SENDER_ID');
        if (!process.env.KITE_TEMPLATE_ID) missingEnv.push('KITE_TEMPLATE_ID');
        if (missingEnv.length) {
            return res.status(500).json({
                message: `Missing SMS env var(s): ${missingEnv.join(', ')}`
            });
        }

        const { month, dividend = 0 } = req.body;
        if (!month) return res.status(400).json({ message: 'month is required (YYYY-MM)' });

        const employees = await Employee.find({ phone: { $exists: true, $nin: [null, ''] } })
            .select('name phone thriftBalance guaranteeingLoans activeLoan')
            .populate('activeLoan', 'remainingBalance');

        if (employees.length === 0) {
            return res.json({ message: 'No employees with a registered phone number found.', sent: 0, errors: [] });
        }

        // Fetch the latest transaction for the requested month for all employees at once
        const empIds = employees.map(e => e._id);
        const transactions = await Transaction.find(
            { employee: { $in: empIds }, month },
            'employee thriftDeduction principalRepayment interestPayment totalDeduction'
        ).lean();

        // Build a map empId → transaction
        const txMap = {};
        for (const tx of transactions) txMap[String(tx.employee)] = tx;

        const concurrency = Math.max(1, Number(process.env.SMS_CONCURRENCY || 5));
        let sent = 0;
        const errors = [];

        let cursor = 0;
        const workers = Array.from({ length: Math.min(concurrency, employees.length) }, async () => {
            while (cursor < employees.length) {
                const emp = employees[cursor++];
                try {
                    const txData = txMap[String(emp._id)] || {};
                    await sendMonthlyUpdateSms(emp, txData, Number(dividend));
                    sent++;
                } catch (err) {
                    errors.push({ name: emp.name, phone: emp.phone, error: err.message });
                }
            }
        });

        await Promise.all(workers);

        res.json({
            message: `SMS sent to ${sent} employee(s).`,
            sent,
            total: employees.length,
            errors
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const notifyMonthlyUpdate = async (req, res) => {
    try {
        const { month, dividend = 0 } = req.body;
        if (!month) return res.status(400).json({ message: 'month is required (YYYY-MM)' });

        const [yearStr, monthNum] = month.split('-');
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const displayMonth = `${monthNames[parseInt(monthNum) - 1]} ${yearStr}`;

        const employees = await Employee.find({ email: { $exists: true, $ne: '' } })
            .select('name email empId thriftBalance guaranteeingLoans');

        if (employees.length === 0) {
            return res.json({ message: 'No employees with a registered email address found.', sent: 0, errors: [] });
        }

        // Fetch the transaction for the requested month for all employees
        const empIds = employees.map(e => e._id);
        const transactions = await Transaction.find(
            { employee: { $in: empIds }, month },
            'employee month salary thriftDeduction loanEMI interestPayment principalRepayment totalDeduction paidAmount netSalary cbThriftBalance loanBalance'
        ).lean();
        const txMap = {};
        for (const tx of transactions) txMap[String(tx.employee)] = tx;

        let sent = 0;
        const errors = [];
        for (const emp of employees) {
            try {
                const txData = txMap[String(emp._id)] || null;
                await sendMonthlyUpdateNotification(emp, displayMonth, txData, month, Number(dividend));
                sent++;
            } catch (err) {
                errors.push({ name: emp.name, email: emp.email, error: err.message });
            }
        }

        res.json({
            message: `Monthly update notification sent to ${sent} employee(s).`,
            sent,
            total: employees.length,
            errors
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const downloadUploadTemplate = async (req, res) => {
    try {
        const type = String(req.params.type || '').toLowerCase();

        let workbook = xlsx.utils.book_new();
        let worksheet;
        let fileName;

        if (type === 'employees') {
            const employeeRows = [{
                'Emp. ID': 'EMP001',
                'Name of the Employ': 'S. Employee Name',
                'Email': 'employee@example.com',
                'Department': 'CSE',
                'Designation': 'Assistant Professor',
                'Phone': '9876543210',
                'Salary': 50000,
                'CB Thrift Amount As on': 25000,
                'Monthly Threft Amount': 1500,
                'Loan Status': ''
            }];

            worksheet = xlsx.utils.json_to_sheet(employeeRows);
            xlsx.utils.book_append_sheet(workbook, worksheet, 'Employees Template');
            fileName = 'employee_upload_template.xlsx';
        } else if (type === 'monthly') {
            const monthlyRows = [{
                'Emp. ID': 'EMP001',
                'Name of the Employ': 'S. Employee Name',
                'CB Thrift Amount As on': 26500,
                'Loan': 120000,
                'Loan Re payment': 3000,
                'Intrest': 1200,
                'Monthly Threft Amount': 1500,
                'Total  Amount': 4500,
                'Paid Amount': 4500,
                'Loan Amount': 4200,
                'Thrift': 1500,
                'Total monthly deduction': 4500,
                'enttry fee': 200,
                'share capital': 2000,
                'fd closed': 0,
                'bank intrest': 976,
                'cash in hand': 0,
                'loan application fee': 300,
                'loans issue': 400000,
                'thrift refund to members': 177386,
                'SC Refund': 2000,
                'fixed deposit in bank': 0,
                'Salary for accountent': 8000,
                'expenditure': 4000,
                'expenditure remarks': 'Meating expenditure',
                'surity1 Emp .ID': 'EMP010',
                'surity2 Emp .ID': 'EMP011',
                'surity3 Emp .ID': '',
                'surity4 Emp .ID': '',
                'surity5 Emp .ID': '',
                'surity6 Emp .ID': ''
            }];

            worksheet = xlsx.utils.json_to_sheet(monthlyRows);
            xlsx.utils.book_append_sheet(workbook, worksheet, 'Monthly Template');
            fileName = 'monthly_upload_template.xlsx';
        } else {
            return res.status(400).json({ message: 'Invalid template type. Use employees or monthly.' });
        }

        const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.send(buffer);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getDashboardStats,
    getEmployees,
    getEmployeeDetails,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    uploadEmployeeExcel,
    adjustSalary,
    adjustThrift,
    adjustLoan,
    getAdjustmentHistory,
    getEmployeeTransactions,
    generateMonthlyReport,
    generateBalanceSheetReport,
    downloadKycDetailsReport,
    upsertBalanceSheetMonth,
    generateYearlyReport,
    generateEmployeeMonthlyReport,
    generateEmployeeYearlyReport,
    updateYearlyThrift,
    syncLoans,
    regenerateCredentials,
    getMonthlyUploadHistory,
    downloadArchivedMonthReport,
    downloadUploadTemplate,
    notifyMonthlyUpdate,
    notifyMonthlySms
};
