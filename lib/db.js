const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@libsql/client');

// Turso (libSQL) in production - set TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) as env
// vars. With neither set, falls back to a local SQLite file for local development -
// same async API either way, so this is the only code path that needs to exist.
const DB_URL = process.env.TURSO_DATABASE_URL || ('file:' + path.join(__dirname, '..', 'livelihood.db'));
const client = createClient({
  url: DB_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

const OPTION_LISTS = ['program', 'assistance_type', 'biz_type'];

const COLUMNS = [
  'id','program','date_monitoring','name','contact','address',
  'assistance_type','date_released','amount','monitored_by',
  'status_rows','biz_type','household_members','daily_sales','monthly_income',
  'current_status','closed_reason','challenges','challenges_other',
  'needs','needs_other','observations','recommendations','feedback',
  'ben_name','ben_date','officer_name','officer_position','officer_date','saved_at',
  'source_year','ben_signature'
];

async function initSchema(){
  await client.execute(`
    CREATE TABLE IF NOT EXISTS records (
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
      saved_at TEXT
    )
  `);
  const info = await client.execute('PRAGMA table_info(records)');
  const recordCols = info.rows.map(c => c.name);
  if(!recordCols.includes('source_year')){
    await client.execute('ALTER TABLE records ADD COLUMN source_year TEXT');
  }
  if(!recordCols.includes('ben_signature')){
    await client.execute('ALTER TABLE records ADD COLUMN ben_signature TEXT');
  }
  await client.execute(`
    CREATE TABLE IF NOT EXISTS officer_signatures (
      officer_name TEXT PRIMARY KEY,
      signature_data TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS options (
      list_key TEXT NOT NULL,
      value TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      PRIMARY KEY (list_key, value)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS staff_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);
}

// Every exported function awaits this first, so callers just call the function -
// no separate "wait for the DB to be ready" step needed anywhere else in the app.
const dbReady = initSchema();

function toPlain(row){
  return row ? JSON.parse(JSON.stringify(row)) : null;
}

function rowToRecord(row){
  if(!row) return null;
  const plain = toPlain(row);
  return {
    ...plain,
    statusRows: plain.status_rows ? JSON.parse(plain.status_rows) : [],
    challenges: plain.challenges ? JSON.parse(plain.challenges) : [],
    needs: plain.needs ? JSON.parse(plain.needs) : []
  };
}

function recordToRow(rec){
  return {
    id: rec.id,
    program: rec.program || '', date_monitoring: rec.date_monitoring || '',
    name: rec.name || '', contact: rec.contact || '', address: rec.address || '',
    assistance_type: rec.assistance_type || '', date_released: rec.date_released || '',
    amount: rec.amount || '', monitored_by: rec.monitored_by || '',
    status_rows: JSON.stringify(rec.statusRows || []),
    biz_type: rec.biz_type || '', household_members: rec.household_members || '',
    daily_sales: rec.daily_sales || '', monthly_income: rec.monthly_income || '',
    current_status: rec.current_status || '', closed_reason: rec.closed_reason || '',
    challenges: JSON.stringify(rec.challenges || []), challenges_other: rec.challenges_other || '',
    needs: JSON.stringify(rec.needs || []), needs_other: rec.needs_other || '',
    observations: rec.observations || '', recommendations: rec.recommendations || '',
    feedback: rec.feedback || '',
    ben_name: rec.ben_name || '', ben_date: rec.ben_date || '',
    officer_name: rec.officer_name || '', officer_position: rec.officer_position || '',
    officer_date: rec.officer_date || '', saved_at: rec.saved_at || new Date().toISOString(),
    source_year: rec.source_year || '',
    ben_signature: rec.ben_signature || ''
  };
}

async function listRecords(){
  await dbReady;
  const rs = await client.execute('SELECT * FROM records ORDER BY saved_at DESC');
  return rs.rows.map(rowToRecord);
}

async function upsertRecord(rec){
  await dbReady;
  const row = recordToRow(rec);
  const placeholders = COLUMNS.map(c => `:${c}`).join(', ');
  const updates = COLUMNS.filter(c => c !== 'id').map(c => `${c}=excluded.${c}`).join(', ');
  await client.execute({
    sql: `INSERT INTO records (${COLUMNS.join(', ')}) VALUES (${placeholders})
          ON CONFLICT(id) DO UPDATE SET ${updates}`,
    args: row
  });
  const rs = await client.execute({ sql: 'SELECT * FROM records WHERE id=?', args: [rec.id] });
  return rowToRecord(rs.rows[0]);
}

async function deleteRecord(id){
  await dbReady;
  const rs = await client.execute({ sql: 'DELETE FROM records WHERE id=?', args: [id] });
  return rs.rowsAffected > 0;
}

async function getRecordById(id){
  await dbReady;
  const rs = await client.execute({ sql: 'SELECT * FROM records WHERE id=?', args: [id] });
  return rowToRecord(rs.rows[0]);
}

function parseAmount(amount){
  const n = Number(String(amount || '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function recordYear(r){
  if(r.source_year) return String(r.source_year).slice(0, 4);
  if(r.date_released) return String(r.date_released).slice(0, 4);
  if(r.date_monitoring) return String(r.date_monitoring).slice(0, 4);
  return null;
}

function topGroups(rows, keyFn, limit){
  const groups = new Map();
  for(const r of rows){
    const key = keyFn(r);
    if(!key) continue;
    if(!groups.has(key)) groups.set(key, { key, count: 0, amount: 0 });
    const g = groups.get(key);
    g.count += 1;
    g.amount += parseAmount(r.amount);
  }
  const list = Array.from(groups.values());
  list.sort((a, b) => b.amount - a.amount);
  return limit ? list.slice(0, limit) : list;
}

async function getDashboardSummary(){
  await dbReady;
  const rs = await client.execute('SELECT address, program, assistance_type, amount, current_status, source_year, date_released, date_monitoring, name FROM records');
  const rows = rs.rows.map(toPlain);

  const totalAmount = rows.reduce((sum, r) => sum + parseAmount(r.amount), 0);
  const uniqueBeneficiaries = new Set(rows.map(r => normalizeName(r.name)).filter(Boolean)).size;

  const byBarangay = topGroups(rows, r => (r.address || '').trim().toUpperCase(), null);
  const byProgram = topGroups(rows, r => (r.program || 'Unspecified').trim(), 10);
  const byAssistanceType = topGroups(rows, r => (r.assistance_type || '').trim().toUpperCase(), null)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const byYearMap = new Map();
  for(const r of rows){
    const year = recordYear(r);
    if(!year) continue;
    if(!byYearMap.has(year)) byYearMap.set(year, { key: year, count: 0, amount: 0 });
    const g = byYearMap.get(year);
    g.count += 1;
    g.amount += parseAmount(r.amount);
  }
  const byYear = Array.from(byYearMap.values()).sort((a, b) => a.key.localeCompare(b.key));

  const byStatus = topGroups(rows.filter(r => r.current_status), r => r.current_status, null);

  return {
    totals: {
      totalRecords: rows.length,
      totalAmount,
      uniqueBeneficiaries,
      barangayCount: new Set(rows.map(r => (r.address || '').trim().toUpperCase()).filter(Boolean)).size,
      programCount: new Set(rows.map(r => (r.program || '').trim()).filter(Boolean)).size
    },
    byBarangay, byProgram, byAssistanceType, byYear, byStatus
  };
}

function normalizeName(name){
  return String(name || '').trim().toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ');
}

// Effective date for duplicate-window comparison: the real released date if known,
// else Jan 1 of the record's known year (exact date unknown for migrated/legacy rows).
function effectiveDateMs(rec){
  if(rec.date_released){
    const d = new Date(rec.date_released + 'T00:00:00Z');
    if(!isNaN(d)) return d.getTime();
  }
  if(rec.date_monitoring){
    const d = new Date(rec.date_monitoring + 'T00:00:00Z');
    if(!isNaN(d)) return d.getTime();
  }
  if(rec.source_year){
    const year = parseInt(String(rec.source_year).slice(0, 4), 10);
    if(!isNaN(year)) return Date.UTC(year, 0, 1);
  }
  return null;
}

// Finds prior records for the same beneficiary (by normalized name) whose effective
// date falls within `windowDays` of the given date. Excludes excludeId (the record
// being edited, if any) so editing a record doesn't flag itself.
async function findDuplicatesWithinWindow(name, dateMs, excludeId, windowDays = 365){
  if(!name || dateMs == null) return [];
  const normalized = normalizeName(name);
  if(!normalized) return [];
  await dbReady;
  const rs = await client.execute('SELECT * FROM records');
  const rows = rs.rows.map(rowToRecord);
  return rows.filter(r => {
    if(excludeId && r.id === excludeId) return false;
    if(normalizeName(r.name) !== normalized) return false;
    const otherMs = effectiveDateMs(r);
    if(otherMs == null) return false;
    return Math.abs(dateMs - otherMs) < windowDays * 24 * 60 * 60 * 1000;
  });
}

async function listOptions(){
  await dbReady;
  const rs = await client.execute('SELECT list_key, value FROM options ORDER BY list_key, sort_order');
  const out = {};
  OPTION_LISTS.forEach(k => out[k] = []);
  rs.rows.forEach(r => { if(!out[r.list_key]) out[r.list_key] = []; out[r.list_key].push(r.value); });
  return out;
}

async function setOptionList(key, values){
  await dbReady;
  const statements = [{ sql: 'DELETE FROM options WHERE list_key=?', args: [key] }];
  values.forEach((v, i) => {
    if(String(v).trim()) statements.push({ sql: 'INSERT INTO options (list_key, value, sort_order) VALUES (?, ?, ?)', args: [key, String(v).trim(), i] });
  });
  await client.batch(statements, 'write');
}

async function listOfficerSignatures(){
  await dbReady;
  const rs = await client.execute('SELECT officer_name, signature_data, uploaded_at FROM officer_signatures ORDER BY officer_name');
  return rs.rows.map(toPlain);
}

async function getOfficerSignature(officerName){
  await dbReady;
  const rs = await client.execute({ sql: 'SELECT signature_data FROM officer_signatures WHERE officer_name = ?', args: [(officerName || '').trim()] });
  return rs.rows[0] ? rs.rows[0].signature_data : null;
}

async function setOfficerSignature(officerName, signatureData){
  await dbReady;
  const name = (officerName || '').trim();
  await client.execute({
    sql: `INSERT INTO officer_signatures (officer_name, signature_data, uploaded_at) VALUES (?, ?, ?)
          ON CONFLICT(officer_name) DO UPDATE SET signature_data=excluded.signature_data, uploaded_at=excluded.uploaded_at`,
    args: [name, signatureData, new Date().toISOString()]
  });
}

async function deleteOfficerSignature(officerName){
  await dbReady;
  const rs = await client.execute({ sql: 'DELETE FROM officer_signatures WHERE officer_name = ?', args: [(officerName || '').trim()] });
  return rs.rowsAffected > 0;
}

function staffUserPublic(row){
  if(!row) return null;
  const plain = toPlain(row);
  return { id: plain.id, username: plain.username, active: !!plain.active, created_at: plain.created_at };
}

async function listStaffUsers(){
  await dbReady;
  const rs = await client.execute('SELECT id, username, active, created_at FROM staff_users ORDER BY created_at');
  return rs.rows.map(staffUserPublic);
}

async function findStaffByUsername(username){
  await dbReady;
  const rs = await client.execute({ sql: 'SELECT * FROM staff_users WHERE username = ?', args: [username] });
  return toPlain(rs.rows[0]);
}

function hashPassword(password, salt){
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

async function createStaffUser(username, password){
  await dbReady;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const id = crypto.randomUUID();
  await client.execute({
    sql: `INSERT INTO staff_users (id, username, password_hash, password_salt, active, created_at) VALUES (?, ?, ?, ?, 1, ?)`,
    args: [id, username, hash, salt, new Date().toISOString()]
  });
  const rs = await client.execute({ sql: 'SELECT id, username, active, created_at FROM staff_users WHERE id=?', args: [id] });
  return staffUserPublic(rs.rows[0]);
}

async function updateStaffUser(id, { password, active }){
  await dbReady;
  if(password){
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    await client.execute({ sql: 'UPDATE staff_users SET password_hash=?, password_salt=? WHERE id=?', args: [hash, salt, id] });
  }
  if(active !== undefined){
    await client.execute({ sql: 'UPDATE staff_users SET active=? WHERE id=?', args: [active ? 1 : 0, id] });
  }
  const rs = await client.execute({ sql: 'SELECT id, username, active, created_at FROM staff_users WHERE id=?', args: [id] });
  return staffUserPublic(rs.rows[0]);
}

async function deleteStaffUser(id){
  await dbReady;
  const rs = await client.execute({ sql: 'DELETE FROM staff_users WHERE id=?', args: [id] });
  return rs.rowsAffected > 0;
}

module.exports = {
  client, dbReady, COLUMNS, OPTION_LISTS,
  listRecords, upsertRecord, deleteRecord, getRecordById,
  normalizeName, effectiveDateMs, findDuplicatesWithinWindow,
  getDashboardSummary,
  listOptions, setOptionList,
  listStaffUsers, findStaffByUsername, createStaffUser, updateStaffUser, deleteStaffUser,
  hashPassword,
  listOfficerSignatures, getOfficerSignature, setOfficerSignature, deleteOfficerSignature
};
