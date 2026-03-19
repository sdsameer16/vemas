const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/adminController');
const { protect, admin } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { uploadMonthlyUpdate } = require('../controllers/uploadController');

router.use(protect);
router.use(admin);

router.get('/dashboard', getDashboardStats);

router.route('/employees')
    .get(getEmployees)
    .post(createEmployee);

router.post('/upload/employees', upload.single('file'), uploadEmployeeExcel);
router.post('/upload/monthly', upload.single('file'), uploadMonthlyUpdate);
router.get('/upload/template/:type', downloadUploadTemplate);

router.route('/employees/:id')
    .get(getEmployeeDetails)
    .put(updateEmployee)
    .delete(deleteEmployee);

// Adjustment routes
router.post('/employees/:id/adjust-salary', adjustSalary);
router.post('/employees/:id/adjust-thrift', adjustThrift);
router.post('/employees/:id/adjust-loan', adjustLoan);
router.get('/employees/:id/history', getAdjustmentHistory);
router.get('/employees/:id/transactions', getEmployeeTransactions);

// Report routes
router.get('/reports/monthly/:month', generateMonthlyReport);
router.get('/reports/balance-sheet', generateBalanceSheetReport);
router.get('/reports/kyc-details', downloadKycDetailsReport);
router.put('/reports/balance-sheet/:month', upsertBalanceSheetMonth);
router.get('/reports/yearly/:year', generateYearlyReport);
router.get('/reports/monthly-history', getMonthlyUploadHistory);
router.get('/reports/archived/:month', downloadArchivedMonthReport);

// Individual employee report routes
router.get('/employees/:id/report/monthly/:month', generateEmployeeMonthlyReport);
router.get('/employees/:id/report/yearly/:year', generateEmployeeYearlyReport);

// Yearly thrift update
router.post('/yearly-thrift-update', updateYearlyThrift);

// Sync loan documents for employees with loanStatus='Loan' but no activeLoan
router.post('/sync-loans', syncLoans);
router.post('/employees/regenerate-credentials', regenerateCredentials);

// Notify employees of monthly update
router.post('/notify/monthly-update', notifyMonthlyUpdate);
router.post('/notify/monthly-sms', notifyMonthlySms);

module.exports = router;
