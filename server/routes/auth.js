const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Employee = require('../models/Employee');
const { protect } = require('../middleware/authMiddleware');
const sendEmail = require('../utils/mailer');

const isEmailConfigured = () => !!(process.env.SENDGRID_API_KEY && (process.env.SENDGRID_FROM || process.env.EMAIL_FROM));

// Generate Token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1d' });
};

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
    try {
        const rawUsername = req.body?.username;
        const rawPassword = req.body?.password;
        const username = String(rawUsername || '').trim();
        const password = String(rawPassword || '');

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const passwordMatches = async (candidate, inputPassword) => {
            let ok = await candidate.matchPassword(inputPassword);
            if (!ok) {
                const trimmed = inputPassword.trim();
                if (trimmed !== inputPassword) {
                    ok = await candidate.matchPassword(trimmed);
                }
            }
            return ok;
        };

        const normalizeEmpId = (value) => String(value ?? '')
            .trim()
            .toLowerCase()
            .replace(/\.0+$/, '');

        const candidates = [];
        const addCandidate = (candidate) => {
            if (!candidate) return;
            if (!candidates.some((u) => String(u._id) === String(candidate._id))) {
                candidates.push(candidate);
            }
        };

        // 1) Direct username match
        const directUser = await User.findOne({ username });
        addCandidate(directUser);

        // 2) Case-insensitive email-style username fallback
        const lower = username.toLowerCase();
        if (lower !== username) {
            const lowerUser = await User.findOne({ username: lower });
            addCandidate(lowerUser);
        }

        // 3) EmpId fallback: allow login input as Employee ID
        {
            const empIdQueries = [{ empId: username }];
            const numericEmpId = Number(username);
            if (!Number.isNaN(numericEmpId)) {
                empIdQueries.push({ empId: numericEmpId });
            }

            let employee = await Employee.findOne({ $or: empIdQueries }).select('_id empId');

            if (!employee) {
                // Fallback for mixed/dirty empId formats (e.g., spaces or 9.0 stored as string)
                const allEmpIds = await Employee.find({ empId: { $exists: true, $ne: null } }).select('_id empId');
                const normalizedInput = normalizeEmpId(username);
                employee = allEmpIds.find((e) => normalizeEmpId(e.empId) === normalizedInput) || null;
            }

            if (employee) {
                const employeeUsers = await User.find({ role: 'employee', employeeId: employee._id });
                employeeUsers.forEach(addCandidate);
            }
        }

        if (candidates.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Validate password against all candidate accounts and pick the first match
        let matchedUser = null;
        for (const candidate of candidates) {
            if (await passwordMatches(candidate, password)) {
                matchedUser = candidate;
                break;
            }
        }

        if (!matchedUser) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        res.json({
            _id: matchedUser._id,
            username: matchedUser.username,
            role: matchedUser.role,
            isFirstLogin: matchedUser.isFirstLogin,
            token: generateToken(matchedUser._id),
            employeeId: matchedUser.employeeId
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST /api/auth/change-password
// @desc    Change password (required for first login)
// @access  Private
router.post('/change-password', protect, async (req, res) => {
    try {
        const { newPassword, oldPassword } = req.body;

        if (!newPassword || String(newPassword).length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters' });
        }

        // Always take the user identity from the verified JWT
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // If this is not the first login, require old password verification
        if (!user.isFirstLogin) {
            if (!oldPassword) {
                return res.status(400).json({ message: 'Old password is required' });
            }
            const isMatch = await user.matchPassword(oldPassword);
            if (!isMatch) {
                return res.status(401).json({ message: 'Invalid old password' });
            }
        }

        user.password = newPassword;
        user.isFirstLogin = false;
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset link — accepts email OR username/empId
// @access  Public
router.post('/forgot-password', async (req, res) => {
    try {
        // Early check — return a clear message if SMTP is not configured on this server
        if (!isEmailConfigured()) {
            return res.status(503).json({
                message: 'Email service is not configured on this server. Please contact the administrator to reset your password manually.'
            });
        }

        const { email } = req.body; // may actually be an email OR a username/empId
        if (!email || !String(email).trim()) {
            return res.status(400).json({ message: 'Please provide your registered email or Employee ID' });
        }

        const input = String(email).trim().toLowerCase();
        let user = null;
        let employee = null;

        // Try email lookup first
        employee = await Employee.findOne({ email: input });
        if (employee) {
            user = await User.findOne({ employeeId: employee._id });
        }

        // Fallback: treat input as username (empId)
        if (!user) {
            user = await User.findOne({ username: input })
                || await User.findOne({ username: email.trim() }); // preserve original case
            if (user && user.employeeId) {
                employee = await Employee.findById(user.employeeId);
            }
        }

        if (!user) {
            // Generic — don't reveal if account exists
            return res.json({ message: 'If this account is registered, a reset link has been sent.' });
        }

        // Send reset link directly to the employee's email (or admin if no employee email)
        const recipientEmail = employee?.email || process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
        const viaAdmin = !employee?.email;

        // Generate secure random token (hex)
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await user.save();

        const resetLink = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

        console.log('[ForgotPwd] Sending reset link for user:', user.username, '→ to:', recipientEmail);

                const resetEmailHtml = `
<!doctype html>
<html>
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Password Reset</title>
    </head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
            Use this link to reset your Vignan Society password.
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
                                <div style="font-size:16px;color:#0f172a;line-height:1.5;font-weight:800;">Password Reset</div>

                                <div style="margin-top:10px;font-size:14px;color:#475569;line-height:1.7;">
                                    We received a request to reset your password. Click the button below to set a new password.
                                </div>

                                <div style="margin-top:16px;text-align:center;">
                                    <a href="${resetLink}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:800;font-size:14px;">
                                        Reset Password
                                    </a>
                                </div>

                                <div style="margin-top:14px;padding:12px 14px;border:1px solid #e5e7eb;background:#f8fafc;border-radius:12px;color:#334155;font-size:13px;line-height:1.6;">
                                    <strong>Important:</strong> This link expires in <strong>1 hour</strong>.
                                    If you didn’t request a password reset, you can safely ignore this email.
                                </div>

                                <div style="margin-top:16px;font-size:12px;color:#94a3b8;line-height:1.5;text-align:center;">
                                    If the button doesn’t work, open this link:<br/>
                                    <a href="${resetLink}" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${resetLink}</a>
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
            recipientEmail,
            'Password Reset',
                        resetEmailHtml
        );

        res.json({
            message: viaAdmin
                ? 'No email on file for this account. A reset link has been sent to the administrator.'
                : 'A password reset link has been sent to your registered email address.',
            viaAdmin
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            message: 'Failed to send reset email. Please try again later.',
            detail: error.message  // visible in browser for debugging
        });
    }
});

// @route   POST /api/auth/reset-password/:token
// @desc    Reset password using the token from email
// @access  Public
router.post('/reset-password/:token', async (req, res) => {
    try {
        const { newPassword, confirmPassword } = req.body;

        if (!newPassword || String(newPassword).length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: 'Passwords do not match' });
        }

        // Hash the incoming raw token to compare with DB
        const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Reset link is invalid or has expired. Please request a new one.' });
        }

        // Update password and clear reset fields
        user.password = newPassword;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        user.isFirstLogin = false;
        await user.save();

        res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
    } catch (error) {
        console.error('Reset password error:', error.message);
        res.status(500).json({ message: 'Server error. Please try again.' });
    }
});

// @route   POST /api/auth/test-email
// @desc    Send a test email to the configured admin inbox (verify SMTP setup)
// @access  Private/Admin
router.post('/test-email', protect, async (req, res) => {
    try {
        if (!isEmailConfigured()) {
            return res.status(503).json({ message: 'Email service is not configured on this server.' });
        }
        const to = (req.body && req.body.to) ? String(req.body.to).trim() : null;
        if (!to) {
            return res.status(400).json({ message: 'Provide { "to": "you@example.com" }' });
        }
        await sendEmail(to, 'Test Email', '<p>Test email from Vignan Society server.</p>');
        res.json({ message: `Test email sent to ${to}` });
    } catch (error) {
        console.error('Test email error:', error.message);
        res.status(500).json({ message: `Failed to send test email: ${error.message}` });
    }
});

module.exports = router;
