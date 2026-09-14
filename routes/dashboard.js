const express = require('express');
const { requireStaffOrAdmin } = require('../lib/auth');
const { getDashboardSummary } = require('../lib/db');

const router = express.Router();

router.use(requireStaffOrAdmin);

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  res.json(await getDashboardSummary());
});

module.exports = router;
