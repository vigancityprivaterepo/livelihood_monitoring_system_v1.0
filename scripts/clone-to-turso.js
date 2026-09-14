// One-time clone of the local livelihood.db (source of truth so far) into Turso.
// Copies every table verbatim - records, staff accounts, dropdown options, officer
// signatures - so Turso ends up in exactly the same state as local dev, rather than
// re-deriving just the records table from the xlsx again.
// Run with: node --env-file=.env scripts/clone-to-turso.js
const path = require('node:path');
const { createClient } = require('@libsql/client');

const LOCAL_PATH = path.join(__dirname, '..', 'livelihood.db');
const CHUNK_SIZE = 200;

if(!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN){
  console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first (e.g. run with --env-file=.env).');
  process.exit(1);
}

const source = createClient({ url: 'file:' + LOCAL_PATH });
const dest = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    program TEXT, date_monitoring TEXT, name TEXT, contact TEXT, address TEXT,
    assistance_type TEXT, date_released TEXT, amount TEXT, monitored_by TEXT,
    status_rows TEXT,
    biz_type TEXT, household_members TEXT, daily_sales TEXT, monthly_income TEXT,
    current_status TEXT, closed_reason TEXT,
    challenges TEXT, challenges_other TEXT,
    needs TEXT, needs_other TEXT,
    observations TEXT, recommendations TEXT, feedback TEXT,
    ben_name TEXT, ben_date TEXT,
    officer_name TEXT, officer_position TEXT, officer_date TEXT,
    saved_at TEXT,
    source_year TEXT,
    ben_signature TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS officer_signatures (
    officer_name TEXT PRIMARY KEY,
    signature_data TEXT NOT NULL,
    uploaded_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS options (
    list_key TEXT NOT NULL,
    value TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    PRIMARY KEY (list_key, value)
  )`,
  `CREATE TABLE IF NOT EXISTS staff_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`
];

const TABLES = ['records', 'staff_users', 'options', 'officer_signatures'];

async function cloneTable(name){
  const rs = await source.execute(`SELECT * FROM ${name}`);
  const rows = rs.rows.map(r => JSON.parse(JSON.stringify(r)));
  if(rows.length === 0){ console.log(`  ${name}: 0 rows (nothing to copy)`); return; }

  const columns = rs.columns;
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO ${name} (${columns.join(', ')}) VALUES (${placeholders})`;

  for(let i = 0; i < rows.length; i += CHUNK_SIZE){
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const statements = chunk.map(row => ({ sql, args: columns.map(c => row[c]) }));
    await dest.batch(statements, 'write');
  }
  console.log(`  ${name}: ${rows.length} rows copied`);
}

async function main(){
  console.log('Creating schema on Turso...');
  for(const stmt of SCHEMA) await dest.execute(stmt);

  console.log('Cloning tables...');
  for(const table of TABLES) await cloneTable(table);

  console.log('Done.');
}

main().catch(err => {
  console.error('Clone failed:', err);
  process.exit(1);
});
