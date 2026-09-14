const express = require('express');
const { requireStaffOrAdmin } = require('../lib/auth');
const { listOfficerSignatures } = require('../lib/db');
const { buildDocxBuffer } = require('../lib/generateDocx');

const router = express.Router();

router.use(requireStaffOrAdmin);

async function findOfficerSignature(officerName){
  const target = String(officerName || '').trim().toUpperCase();
  if(!target) return null;
  const list = await listOfficerSignatures();
  const match = list.find(s => s.officer_name.trim().toUpperCase() === target);
  return match ? match.signature_data : null;
}

// POST /api/documents/docx - builds a .docx from the posted form data (saved or not yet saved)
router.post('/docx', async (req, res) => {
  const d = req.body;
  if(!d || typeof d !== 'object') return res.status(400).json({ error: 'Missing form data' });

  try{
    const record = { ...d, officer_signature_data: await findOfficerSignature(d.officer_name) };
    const buffer = await buildDocxBuffer(record);
    const safeName = String(d.name || 'beneficiary').replace(/[^a-z0-9]+/gi, '_').slice(0, 60) || 'beneficiary';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="Livelihood_Monitoring_${safeName}.docx"`);
    res.send(buffer);
  }catch(err){
    console.error('DOCX generation failed:', err);
    res.status(500).json({ error: 'Could not generate document' });
  }
});

module.exports = router;
