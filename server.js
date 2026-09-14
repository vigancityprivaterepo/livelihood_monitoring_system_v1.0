const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const { listStaffUsers, dbReady } = require('./lib/db');

const PORT = process.env.PORT || 3000;

const app = express();
app.disable('x-powered-by');
// Only enable if actually deployed behind a reverse proxy (nginx/Caddy/etc) that sets
// X-Forwarded-For itself - otherwise a client could spoof that header and both defeat
// the login rate limiter and make requests appear to come from an arbitrary IP.
if(process.env.TRUST_PROXY) app.set('trust proxy', 1);
app.use(helmet({
  // Every page here relies on inline <script>/<style> tags (no build step, no
  // nonces) - helmet's default CSP would block all of it. Keep the other
  // protections (clickjacking, MIME-sniffing, HSTS, etc.) and skip CSP rather
  // than ship a policy that's either broken or too permissive to mean anything.
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: '5mb' })); // signature images are embedded as base64
app.use(cookieParser());

app.use('/api/auth', require('./routes/staffAuth'));
app.use('/api/admin', require('./routes/adminAuth'));
app.use('/api/staff', require('./routes/staffAccounts'));
app.use('/api/records', require('./routes/records'));
app.use('/api/options', require('./routes/options'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/officer-signatures', require('./routes/officerSignatures'));
app.use('/api/documents', require('./routes/documents'));
app.use('/', require('./routes/pages'));

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if(err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  if(err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  // Don't echo err.message to the client - it can leak internals (file paths, query
  // fragments, library names). Full detail already went to the server log above.
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

(async () => {
  await dbReady; // wait for schema creation/migration to finish before accepting traffic
  app.listen(PORT, async () => {
    console.log(`Livelihood Monitoring System running at http://localhost:${PORT}`);
    if((await listStaffUsers()).length === 0){
      console.log(`No staff accounts yet. Log in at /admin/login with the admin password, then add a staff account under "Manage Staff Accounts".`);
    }
  });
})().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
