const express = require('express');
const { requireStaffOrAdmin } = require('../lib/auth');
const {
  listRecords, upsertRecord, deleteRecord, getRecordById,
  effectiveDateMs, findDuplicatesWithinWindow
} = require('../lib/db');

const router = express.Router();

router.use(requireStaffOrAdmin);

const SIGNATURE_RE = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_SIGNATURE_LEN = 2_000_000;

function validateSignature(rec){
  if(!rec.ben_signature) return null;
  if(rec.ben_signature.length > MAX_SIGNATURE_LEN) return 'Signature image is too large';
  if(!SIGNATURE_RE.test(rec.ben_signature)) return 'ben_signature must be a PNG/JPEG/WebP image data URL';
  return null;
}

function conflictPayload(conflicts){
  return {
    error: 'This beneficiary already received livelihood assistance within the past year.',
    conflicts: conflicts.map(c => ({
      id: c.id, program: c.program, assistance_type: c.assistance_type,
      amount: c.amount, date_released: c.date_released, source_year: c.source_year,
      saved_at: c.saved_at
    }))
  };
}

// GET /api/records
router.get('/', async (req, res) => {
  res.json(await listRecords());
});

// POST /api/records (create new, or upsert an existing one the client already has an id for)
router.post('/', async (req, res) => {
  const rec = req.body;
  if(!rec || !rec.id) return res.status(400).json({ error: 'Missing record id' });
  const sigError = validateSignature(rec);
  if(sigError) return res.status(400).json({ error: sigError });

  const isNew = !(await getRecordById(rec.id));
  if(isNew && !rec.overrideDuplicateCheck){
    const dateMs = effectiveDateMs(rec);
    const conflicts = await findDuplicatesWithinWindow(rec.name, dateMs, null);
    if(conflicts.length > 0) return res.status(409).json(conflictPayload(conflicts));
  }

  res.status(201).json(await upsertRecord(rec));
});

// PUT /api/records/:id
router.put('/:id', async (req, res) => {
  if(!req.body) return res.status(400).json({ error: 'Missing body' });
  const sigError = validateSignature(req.body);
  if(sigError) return res.status(400).json({ error: sigError });
  res.json(await upsertRecord({ ...req.body, id: req.params.id }));
});

// DELETE /api/records/:id
router.delete('/:id', async (req, res) => {
  const ok = await deleteRecord(req.params.id);
  res.status(ok ? 200 : 404).json({ deleted: ok });
});

module.exports = router;
