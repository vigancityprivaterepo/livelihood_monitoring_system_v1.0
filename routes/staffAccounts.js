const express = require('express');
const { requireAdmin } = require('../lib/auth');
const { listStaffUsers, findStaffByUsername, createStaffUser, updateStaffUser, deleteStaffUser } = require('../lib/db');

const MIN_PASSWORD_LEN = 6;
const router = express.Router();

router.use(requireAdmin);

// GET /api/staff
router.get('/', async (req, res) => {
  res.json(await listStaffUsers());
});

// POST /api/staff
router.post('/', async (req, res) => {
  const username = ((req.body && req.body.username) || '').trim();
  const password = (req.body && req.body.password) || '';
  if(!username) return res.status(400).json({ error: 'Username is required' });
  if(password.length < MIN_PASSWORD_LEN){
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LEN} characters` });
  }
  if(await findStaffByUsername(username)) return res.status(409).json({ error: 'Username already exists' });
  res.status(201).json(await createStaffUser(username, password));
});

// PUT /api/staff/:id
router.put('/:id', async (req, res) => {
  const update = {};
  if(req.body && req.body.password){
    if(req.body.password.length < MIN_PASSWORD_LEN){
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LEN} characters` });
    }
    update.password = req.body.password;
  }
  if(req.body && typeof req.body.active === 'boolean'){
    update.active = req.body.active;
  }
  const updated = await updateStaffUser(req.params.id, update);
  if(!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

// DELETE /api/staff/:id
router.delete('/:id', async (req, res) => {
  const ok = await deleteStaffUser(req.params.id);
  res.status(ok ? 200 : 404).json({ deleted: ok });
});

module.exports = router;
