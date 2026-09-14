const express = require('express');
const { verifyAdminCredentials, createAdminSession, setAdminCookie, clearAdminCookie } = require('../lib/auth');
const { loginLimiter } = require('../lib/rateLimit');

const router = express.Router();

// POST /api/admin/login
router.post('/login', loginLimiter, (req, res) => {
  const username = (req.body && req.body.username) || '';
  const password = (req.body && req.body.password) || '';
  if(!verifyAdminCredentials(username, password)){
    return res.status(401).json({ error: 'Incorrect username or password' });
  }
  const token = createAdminSession();
  setAdminCookie(req, res, token);
  res.json({ ok: true });
});

// POST /api/admin/logout
router.post('/logout', (req, res) => {
  clearAdminCookie(req, res);
  res.json({ ok: true });
});

module.exports = router;
