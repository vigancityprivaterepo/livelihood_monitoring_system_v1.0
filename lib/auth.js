const crypto = require('node:crypto');
const { hashPassword } = require('./db');

// ---- Change these before deploying online (env vars override the defaults) ----
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'vigan-admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const staffSessions = new Map(); // token -> { userId, username, expiresAt }
const adminSessions = new Map(); // token -> { expiresAt }

function timingSafeEqualStr(a, b){
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if(bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyPassword(password, salt, expectedHash){
  return timingSafeEqualStr(hashPassword(password, salt), expectedHash);
}

function verifyAdminCredentials(username, password){
  const userOk = timingSafeEqualStr((username || '').trim(), ADMIN_USERNAME);
  const passOk = timingSafeEqualStr(password || '', ADMIN_PASSWORD);
  return userOk && passOk;
}

function pruneSessions(map){
  const now = Date.now();
  for(const [token, session] of map){
    if(session.expiresAt < now) map.delete(token);
  }
}

function createStaffSession(userId, username){
  const token = crypto.randomUUID();
  staffSessions.set(token, { userId, username, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function createAdminSession(){
  const token = crypto.randomUUID();
  adminSessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function getStaffSession(req){
  pruneSessions(staffSessions);
  const token = req.cookies && req.cookies.sid;
  if(!token) return null;
  return staffSessions.get(token) || null;
}

function isAdminSession(req){
  pruneSessions(adminSessions);
  const token = req.cookies && req.cookies.aid;
  return !!token && adminSessions.has(token);
}

const COOKIE_OPTS_BASE = { httpOnly: true, sameSite: 'strict', path: '/' };

function cookieOpts(req, maxAgeMs){
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return { ...COOKIE_OPTS_BASE, secure: isHttps, maxAge: maxAgeMs };
}

function setStaffCookie(req, res, token){
  res.cookie('sid', token, cookieOpts(req, SESSION_TTL_MS));
}
function clearStaffCookie(req, res){
  res.clearCookie('sid', cookieOpts(req));
}
function setAdminCookie(req, res, token){
  res.cookie('aid', token, cookieOpts(req, SESSION_TTL_MS));
}
function clearAdminCookie(req, res){
  res.clearCookie('aid', cookieOpts(req));
}

// ---- Middleware ----
// Attaches req.staffUser when logged in. On a page route (not under /api),
// redirects to /login; on an API route, responds 401 JSON.
function requireStaff(req, res, next){
  const session = getStaffSession(req);
  if(!session){
    if(req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Login required' });
    return res.redirect('/login');
  }
  req.staffUser = { id: session.userId, username: session.username };
  next();
}

function requireAdmin(req, res, next){
  if(!isAdminSession(req)){
    if(req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Admin login required' });
    return res.redirect('/admin/login');
  }
  next();
}

// For endpoints both the staff app and the admin panel read (e.g. dropdown option
// lists): accept either a staff or an admin session, since an admin may not also
// be logged in as staff.
function requireStaffOrAdmin(req, res, next){
  const session = getStaffSession(req);
  if(session){
    req.staffUser = { id: session.userId, username: session.username };
    return next();
  }
  if(isAdminSession(req)) return next();
  if(req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Login required' });
  return res.redirect('/login');
}

module.exports = {
  verifyPassword, verifyAdminCredentials,
  createStaffSession, createAdminSession,
  getStaffSession, isAdminSession,
  setStaffCookie, clearStaffCookie, setAdminCookie, clearAdminCookie,
  requireStaff, requireAdmin, requireStaffOrAdmin
};
