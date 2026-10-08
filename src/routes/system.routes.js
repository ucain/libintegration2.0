const express = require('express');
const { pool } = require('../config/db');
const { validateEnvironment } = require('../config/env');
const { ok, asyncHandler } = require('../utils/http');

const router = express.Router();

router.get('/system/status', asyncHandler(async (_req, res) => {
  const env = validateEnvironment();
  const [version, migrations, demo] = await Promise.all([
    pool.query('SELECT version() AS version, now() AS database_time'),
    pool.query('SELECT migration_name, applied_at FROM app_migration ORDER BY applied_at'),
    pool.query("SELECT COUNT(*)::int AS total FROM library_member WHERE institutional_id IN ('230012345','STF-BUKU-01','SYS-ADMIN-01')")
  ]);
  ok(res, {
    application: 'PKN STAN Library System',
    runtime: process.version,
    database: 'ok',
    databaseTime: version.rows[0].database_time,
    migrations: migrations.rows,
    demoMode: env.demoMode,
    demoAccountsSeeded: demo.rows[0].total >= 3,
    autoMigrate: env.autoMigrate,
  });
}));

module.exports = router;
