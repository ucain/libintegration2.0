require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { validateEnvironment } = require('../config/env');

async function main() {
  const env = validateEnvironment();
  if (!env.demoMode) throw new Error('DEMO_MODE=false. Dummy seed diblokir.');
  const exists = await pool.query("SELECT 1 FROM library_member WHERE institutional_id='230012345' LIMIT 1");
  if (exists.rows[0]) {
    console.log('Demo seed already exists.');
  } else {
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'seed.sql'), 'utf8');
    await pool.query(sql);
    console.log('Demo seed applied.');
  }
  await pool.end();
}
main().catch(async e => { console.error(e); try { await pool.end(); } catch (_) {} process.exit(1); });
