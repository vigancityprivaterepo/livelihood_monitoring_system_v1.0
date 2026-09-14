// One-time backfill of historical livelihood-assistance records from
// "LIVELIHOOD RECIPIENT.xlsx" (already dumped to plain JSON by a Python step)
// into the app's SQLite database. Run with: node scripts/migrate-legacy.js <dump.json>
const fs = require('node:fs');
const crypto = require('node:crypto');
const { client, dbReady, normalizeName, effectiveDateMs } = require('../lib/db');

const args = process.argv.slice(2).filter(a => a !== '--dry-run');
const dryRun = process.argv.includes('--dry-run');
const dumpPath = args[0];
if(!dumpPath){
  console.error('Usage: node scripts/migrate-legacy.js <legacy_dump.json> [--dry-run]');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));

function fmtAmount(n){
  if(n == null || n === '') return '';
  const num = Number(n);
  if(isNaN(num)) return String(n).trim();
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function baseRecord(fields){
  return {
    id: crypto.randomUUID(),
    program: fields.program || '',
    date_monitoring: '',
    name: (fields.name || '').trim(),
    contact: '',
    address: (fields.address || '').trim(),
    assistance_type: (fields.assistance_type || '').trim(),
    date_released: '',
    amount: fmtAmount(fields.amount),
    monitored_by: 'Historical Records Migration',
    status_rows: '[]',
    biz_type: '', household_members: '', daily_sales: '', monthly_income: '',
    current_status: '', closed_reason: '',
    challenges: '[]', challenges_other: '',
    needs: '[]', needs_other: '',
    observations: fields.observations || `Migrated historical record${fields.source_year ? ' (Year: ' + fields.source_year + ')' : ''}.`,
    recommendations: '', feedback: '',
    ben_name: '', ben_date: '',
    officer_name: '', officer_position: '', officer_date: '',
    saved_at: new Date().toISOString(),
    source_year: fields.source_year || ''
  };
}

const REGULAR_PROGRAM = 'Livelihood Assistance Program';
const records = [];

// ---- Regular per-year sheets: header row [NO., ADDRESS, NAME, PROJECT, AMOUNT GRANTED] ----
const REGULAR_SHEETS = ['2011-2014','2015','2016','2017','2018','2019','2020','2021','2022','2024','2025','2026'];
for(const sheetName of REGULAR_SHEETS){
  const rows = data[sheetName];
  if(!rows) continue;
  for(const row of rows.slice(1)){
    const [, address, name, project, amount] = row;
    if(!name) continue;
    records.push(baseRecord({
      program: REGULAR_PROGRAM,
      name, address, assistance_type: project, amount,
      source_year: sheetName
    }));
  }
}

// ---- SLP-LAG 2021: title/title/header rows, then
// [No, Barangay, Purok, LastName, FirstName, MiddleName, ExtName, Pantawid?, Microenterprise, Amount] ----
for(const row of (data['SLP-LAG 2021'] || []).slice(3)){
  const [, barangay, purok, lastName, firstName, middleName, extName, pantawid, microenterprise, amount] = row;
  if(!lastName && !firstName) continue;
  const name = [firstName, middleName, lastName, extName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const address = purok ? `${purok}, ${barangay}` : (barangay || '');
  records.push(baseRecord({
    program: 'SLP-LAG (COVID-19, 2021)',
    name, address, assistance_type: microenterprise, amount,
    source_year: '2021',
    observations: `Migrated historical record (Year: 2021).${pantawid === 'Yes' ? ' 4Ps beneficiary.' : ''}`
  }));
}

// ---- SLP-LAG 2022: title/title/header rows, then [NO, BARANGAY, "LAST, FIRST, MIDDLE", PROJECT, AMOUNT] ----
function splitCommaName(raw){
  const parts = String(raw || '').split(',').map(s => s.trim()).filter(Boolean);
  if(parts.length >= 3) return `${parts[1]} ${parts.slice(2).join(' ')} ${parts[0]}`.replace(/\s+/g, ' ').trim();
  if(parts.length === 2) return `${parts[1]} ${parts[0]}`.replace(/\s+/g, ' ').trim();
  return String(raw || '').trim();
}
for(const row of (data['SLP-LAG 2022'] || []).slice(3)){
  const [, barangay, rawName, project, amount] = row;
  if(!rawName) continue;
  records.push(baseRecord({
    program: 'SLP-LAG (COVID-19, 2022)',
    name: splitCommaName(rawName), address: barangay, assistance_type: project, amount,
    source_year: '2022'
  }));
}

// ---- LSG OSBG / LSG CONG. RONALD 2023-2024: header row, then
// [NO., "LAST, FIRST, MIDDLE", ADDRESS, TYPE OF ASSISTANCE, AMOUNT] ----
const LSG_SHEETS = [
  { name: 'LSG OSBG 2023-2024', program: 'LSG-OSBG (2023-2024)' },
  { name: 'LSG CONG. RONALD 2023-2024', program: 'LSG-CONG. RONALD (2023-2024)' }
];
for(const { name: sheetName, program } of LSG_SHEETS){
  for(const row of (data[sheetName] || []).slice(1)){
    const [, rawName, address, assistanceType, amount] = row;
    if(!rawName) continue;
    records.push(baseRecord({
      program, name: splitCommaName(rawName), address, assistance_type: assistanceType, amount,
      source_year: '', // exact year within the 2023-2024 span is not recorded per row
      observations: 'Migrated historical record (Year span: 2023-2024).'
    }));
  }
}

console.log(`Prepared ${records.length} legacy records.`);
const byProgram = new Map();
for(const r of records) byProgram.set(r.program, (byProgram.get(r.program) || 0) + 1);
for(const [program, count] of byProgram) console.log(`  ${program}: ${count}`);

if(dryRun){
  console.log('\n--dry-run: nothing written. Sample records:');
  console.log(records.slice(0, 3));
  console.log(records.slice(-3));
  process.exit(0);
}

const CHUNK_SIZE = 200; // keep each batch() call to a reasonable HTTP payload size for remote Turso

async function main(){
  await dbReady; // schema must exist before inserting

  console.log('Inserting...');
  const COLUMNS = Object.keys(records[0]);
  const placeholders = COLUMNS.map(() => '?').join(', ');
  const sql = `INSERT INTO records (${COLUMNS.join(', ')}) VALUES (${placeholders})`;

  for(let i = 0; i < records.length; i += CHUNK_SIZE){
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const statements = chunk.map(rec => ({ sql, args: COLUMNS.map(c => rec[c]) }));
    await client.batch(statements, 'write');
    process.stdout.write(`  ${Math.min(i + CHUNK_SIZE, records.length)}/${records.length}\r`);
  }
  console.log(`\nInserted ${records.length} records.`);

  // ---- Report (not a block): how many beneficiaries have more than one grant within ~1 year ----
  const rs = await client.execute(`SELECT id, name, date_released, date_monitoring, source_year, program FROM records`);
  const allRows = rs.rows.map(r => JSON.parse(JSON.stringify(r)));
  const byName = new Map();
  for(const r of allRows){
    const key = normalizeName(r.name);
    if(!key) continue;
    if(!byName.has(key)) byName.set(key, []);
    byName.get(key).push(r);
  }
  let repeatGroups = 0;
  let repeatRecords = 0;
  for(const [, group] of byName){
    if(group.length < 2) continue;
    const withDates = group.map(r => ({ r, ms: effectiveDateMs(r) })).filter(x => x.ms != null);
    withDates.sort((a, b) => a.ms - b.ms);
    let flagged = false;
    for(let i = 1; i < withDates.length; i++){
      if(withDates[i].ms - withDates[i - 1].ms < 365 * 24 * 60 * 60 * 1000){ flagged = true; break; }
    }
    if(flagged){ repeatGroups++; repeatRecords += group.length; }
  }
  console.log(`Heads up: ${repeatGroups} beneficiary name(s) already have 2+ grants within ~1 year across the historical data (${repeatRecords} records total). This is pre-existing history, not blocked by the new duplicate-check rule, which only applies to new records entered going forward.`);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
