const { Pool } = require('pg');
const { getDatabaseUrl } = require('./env');

const connectionString = getDatabaseUrl();
const isProduction = process.env.NODE_ENV === 'production';
const sslDisabled = String(process.env.DATABASE_SSL || '').toLowerCase() === 'false';

const pool = new Pool({
  connectionString: connectionString || undefined,
  max: Math.max(1, Number(process.env.DB_POOL_MAX || (isProduction ? 3 : 10))),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: !isProduction,
  ssl: isProduction && !sslDisabled ? { rejectUnauthorized: false } : false,
});

pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'Asia/Jakarta'").catch((err)=>console.error('[db] Failed to set timezone:',err.message));
});

pool.on('error', (err) => {
  console.error('[db] Unexpected PostgreSQL pool error:', err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
