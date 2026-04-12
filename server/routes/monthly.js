const express = require('express');
const router = express.Router();
const { previewMonthlyDeductions, processMonthlyDeductions } = require('../controllers/monthlyController');
const { protect, admin } = require('../middleware/authMiddleware');

router.use(protect);
router.use(admin);

router.get('/preview/:month', previewMonthlyDeductions);
router.post('/process', processMonthlyDeductions);

module.exports = router;
