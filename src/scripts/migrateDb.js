require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../config/db');
const { validateEnvironment } = require('../config/env');

function checksum(sql) { return crypto.createHash('sha256').update(sql).digest('hex'); }
async function apply(client, name, sql) {
  const sum = checksum(sql);
  const existing = await client.query('SELECT checksum FROM app_migration WHERE migration_name=$1',[name]);
  if (!existing.rows[0]) {
    await client.query(sql);
    await client.query('INSERT INTO app_migration(migration_name,checksum) VALUES($1,$2)',[name,sum]);
    console.log(`Applied ${name}`);
  } else if (existing.rows[0].checksum !== sum) {
    throw new Error(`Migration checksum mismatch: ${name}. Jangan mengubah migration yang sudah diterapkan.`);
  } else {
    console.log(`Already applied: ${name}`);
  }
}

async function main() {
  validateEnvironment();
  const initial = fs.readFileSync(path.join(__dirname,'..','..','db','schema.sql'),'utf8');
  const hardening = fs.readFileSync(path.join(__dirname,'..','..','db','migrations','002-production-hardening.sql'),'utf8');
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(7420192601)');
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS app_migration (
      migration_name VARCHAR(200) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await apply(client,'001-initial-schema',initial);
    await apply(client,'002-production-hardening',hardening);
    await client.query('COMMIT');
  } catch(e) {
    try { await client.query('ROLLBACK'); } catch(_) {}
    throw e;
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(7420192601)'); } catch(_) {}
    client.release();
    await pool.end();
  }
}
main().catch(async e=>{console.error(e);try{await pool.end();}catch(_){}process.exit(1)});
