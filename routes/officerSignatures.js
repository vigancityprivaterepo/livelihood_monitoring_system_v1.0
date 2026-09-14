const express = require('express');
const { requireStaffOrAdmin, requireAdmin } = require('../lib/auth');
const { listOfficerSignatures, setOfficerSignature, deleteOfficerSignature } = require('../lib/db');

const MAX_DATA_URL_LEN = 3_000_000; // ~2.2MB decoded, generous for a signature image
const router = express.Router();

router.use(requireStaffOrAdmin);

// GET /api/officer-signatures
router.get('/', async (req, res) => {
  res.json(await listOfficerSignatures());
});

// POST /api/officer-signatures (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const officerName = ((req.body && req.body.officer_name) || '').trim();
  const signatureData = (req.body && req.body.signature_data) || '';
  if(!officerName) return res.status(400).json({ error: 'Officer name is required' });
  if(!signatureData.startsWith('data:image/')) return res.status(400).json({ error: 'signature_data must be an image data URL' });
  if(signatureData.length > MAX_DATA_URL_LEN) return res.status(400).json({ error: 'Signature image is too large' });
  await setOfficerSignature(officerName, signatureData);
  res.status(201).json({ officer_name: officerName });
});

// DELETE /api/officer-signatures/:name
router.delete('/:name', requireAdmin, async (req, res) => {
  const ok = await deleteOfficerSignature(req.params.name);
  res.status(ok ? 200 : 404).json({ deleted: ok });
});

module.exports = router;
