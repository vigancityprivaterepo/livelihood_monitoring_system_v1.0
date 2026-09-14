const express = require('express');
const { requireStaffOrAdmin, requireAdmin } = require('../lib/auth');
const { listOptions, setOptionList, OPTION_LISTS } = require('../lib/db');

const router = express.Router();

router.use(requireStaffOrAdmin);

// GET /api/options
router.get('/', async (req, res) => {
  res.json(await listOptions());
});

// PUT /api/options/:key  (admin only)
router.put('/:key', requireAdmin, async (req, res) => {
  const key = req.params.key;
  if(!OPTION_LISTS.includes(key)) return res.status(404).json({ error: 'Unknown list' });
  if(!req.body || !Array.isArray(req.body.values)) return res.status(400).json({ error: 'Missing values array' });
  await setOptionList(key, req.body.values);
  res.json({ [key]: (await listOptions())[key] });
});

module.exports = router;
