const express = require('express');
const { findStaffByUsername } = require('../lib/db');
const { verifyPassword, createStaffSession, setStaffCookie, clearStaffCookie, getStaffSession, isAdminSession } = require('../lib/auth');
const { loginLimiter } = require('../lib/rateLimit');

const router = express.Router();

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const username = ((req.body && req.body.username) || '').trim();
  const password = (req.body && req.body.password) || '';
  const user = username ? await findStaffByUsername(username) : null;
  if(!user || !user.active || !verifyPassword(password, user.password_salt, user.password_hash)){
    return res.status(401).json({ error: 'Incorrect username or password' });
  }
  const token = createStaffSession(user.id, user.username);
  setStaffCookie(req, res, token);
  res.json({ ok: true, username: user.username });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearStaffCookie(req, res);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const session = getStaffSession(req);
  if(session) return res.json({ username: session.username, isAdmin: isAdminSession(req) });
  if(isAdminSession(req)) return res.json({ username: 'Admin', isAdmin: true });
  res.status(401).json({ error: 'Login required' });
});

module.exports = router;
