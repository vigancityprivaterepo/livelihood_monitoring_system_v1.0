const express = require('express');
const path = require('node:path');
const { requireAdmin, requireStaffOrAdmin, getStaffSession, isAdminSession } = require('../lib/auth');

const ROOT = path.join(__dirname, '..');
const router = express.Router();

router.get('/logo.png', (req, res) => {
  res.sendFile(path.join(ROOT, 'logo.png'), (err) => {
    if(err && !res.headersSent) res.status(404).json({ error: 'Not found' });
  });
});

router.get('/icons.js', (req, res) => {
  res.sendFile(path.join(ROOT, 'icons.js'));
});

router.get('/fonts/fonts.css', (req, res) => {
  res.sendFile(path.join(ROOT, 'fonts', 'fonts.css'));
});
router.get('/fonts/:file', (req, res) => {
  if(!/^[\w-]+\.woff2$/.test(req.params.file)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(ROOT, 'fonts', req.params.file), (err) => {
    if(err && !res.headersSent) res.status(404).json({ error: 'Not found' });
  });
});

router.get('/login', (req, res) => {
  if(getStaffSession(req) || isAdminSession(req)) return res.redirect('/');
  res.sendFile(path.join(ROOT, 'login.html'));
});

router.get('/admin/login', (req, res) => {
  if(isAdminSession(req)) return res.redirect('/admin');
  res.sendFile(path.join(ROOT, 'admin-login.html'));
});

router.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(ROOT, 'admin.html'));
});

// Dashboard is now a tab inside the main app (index.html); redirect old links there.
router.get('/dashboard', (req, res) => {
  res.redirect('/#dashboard');
});

router.get(['/', '/index.html'], requireStaffOrAdmin, (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

module.exports = router;
