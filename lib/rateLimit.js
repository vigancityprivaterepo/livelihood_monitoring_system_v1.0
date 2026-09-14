const rateLimit = require('express-rate-limit');

// Brute-force protection for password checks. Keyed by IP; a shared reverse proxy
// should set X-Forwarded-For (and Express needs `app.set('trust proxy', ...)`)
// for this to key on the real client IP rather than the proxy's.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' }
});

module.exports = { loginLimiter };
