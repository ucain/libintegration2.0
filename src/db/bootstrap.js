const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../config/db');
const { validateEnvironment } = require('../config/env');

let readyPromise = null;

function readSql(file) {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'db', file), 'utf8');
}

function readMigration(file) {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'migrations', file), 'utf8');
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function ensureMigrationTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_migration (
      migration_name VARCHAR(200) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function applySqlOnce(db, migrationName, filename, fromMigrations = false) {
  const sql = fromMigrations ? readMigration(filename) : readSql(filename);
  const checksum = hash(sql);
  const existing = await db.query('SELECT checksum FROM app_migration WHERE migration_name=$1', [migrationName]);
  if (existing.rows[0]) {
    if (existing.rows[0].checksum !== checksum) {
      const err = new Error(`Migration ${migrationName} berubah setelah pernah diterapkan.`);
      err.code = 'MIGRATION_CHECKSUM_MISMATCH';
      err.status = 500;
      throw err;
    }
    return false;
  }
  await db.query(sql);
  await db.query('INSERT INTO app_migration(migration_name,checksum) VALUES($1,$2)', [migrationName, checksum]);
  return true;
}

async function seedDemoIfNeeded(db) {
  const env = validateEnvironment();
  if (!env.demoMode || !env.autoSeedDemo) return false;
  const exists = await db.query("SELECT 1 FROM library_member WHERE institutional_id='230012345' LIMIT 1");
  if (exists.rows[0]) return false;
  await db.query(readSql('seed.sql'));
  return true;
}

async function initializeDatabase() {
  const env = validateEnvironment();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(7420192601)');
    try {
      if (env.autoMigrate) {
        await client.query('BEGIN');
        try {
          await ensureMigrationTable(client);
          await applySqlOnce(client, '001-initial-schema', 'schema.sql');
          await applySqlOnce(client, '002-production-hardening', '002-production-hardening.sql', true);
          await seedDemoIfNeeded(client);
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        }
      } else {
        await client.query('SELECT 1 FROM library_member LIMIT 1');
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(7420192601)');
    }
  } catch (error) {
    if (error.code === '42P01') {
      const err = new Error('Schema database belum dibuat. Aktifkan AUTO_MIGRATE=true atau jalankan npm run db:migrate.');
      err.code = 'DATABASE_SCHEMA_MISSING';
      err.status = 503;
      throw err;
    }
    throw error;
  } finally {
    client.release();
  }
  return true;
}

function ensureDatabaseReady() {
  if (!readyPromise) {
    readyPromise = initializeDatabase().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

module.exports = { ensureDatabaseReady, initializeDatabase };
